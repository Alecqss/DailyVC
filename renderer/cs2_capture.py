"""
CS2 headless frame capture for the clip renderer (étape 2.3).

Given a .dem file, the player's steamid and a [tick_start, tick_end] window,
this module:
  1. Generates a CS2 console config that seeks to tick_start, locks the
     spectator camera to the player in first person, then records the segment
     with `startmovie` (TGA frames).
  2. Launches CS2 headless under the already-running Xvfb display.
  3. Waits for capture to finish by counting the TGA frames written to disk
     — GPU-speed independent, no console command channel required — then
     terminates CS2 once the expected number of frames is on disk. A hard
     timeout is the safety net.
  4. Returns the directory containing the captured frame_*.tga files.

⚠️ Note pour l'étape 2.5 (déploiement GPU) :
Les seules parties non vérifiables hors host GPU sont l'invocation exacte de
CS2 (`CS2_CMD`) et deux cvars console (`spec_lock_to_accountid`, `spec_mode`).
Elles sont isolées ici et pilotables par variables d'env, donc l'ajustement
sur le vrai host est une modif localisée. Toute la mécanique host-side
(conversion accountid, calcul du nombre de frames, gestion subprocess +
display, détection de fin, cleanup) est indépendante de la version du moteur.
"""

import logging
import os
import socket
import subprocess
import threading
import time
from pathlib import Path

logger = logging.getLogger("renderer.cs2")

# steamid64 du compte d'accountid 0 — accountid = steamid64 - STEAM64_BASE
STEAM64_BASE = 76561197960265728

# Réglages de capture (overridables par variables d'env)
TICKRATE = int(os.getenv("CS2_TICKRATE", "64"))   # GOTV/MM CS2 = 64 tick
FPS      = int(os.getenv("CS2_FPS", "60"))
WIDTH    = int(os.getenv("CS2_WIDTH", "1280"))
HEIGHT   = int(os.getenv("CS2_HEIGHT", "720"))

# Localisation de CS2 (disque persistant de la VM GPU)
CS2_DIR     = os.getenv("CS2_DIR", "/data/cs2")
CS2_LIB_DIR = f"{CS2_DIR}/game/bin/linuxsteamrt64"
# On lance le binaire `cs2` BRUT (pas cs2.sh) : cs2.sh impose le runtime sniper
# (bwrap) alors que le binaire direct tourne dès lors qu'un Steam loggé est présent.
CS2_CMD     = os.getenv("CS2_CMD", f"{CS2_LIB_DIR}/cs2")
CS2_CFG_DIR = os.getenv("CS2_CFG_DIR", f"{CS2_DIR}/game/csgo/cfg")
CFG_NAME    = "highlightgg_render"   # exec sans extension, relatif à csgo/cfg

# Filet de sécurité : on tue CS2 au plus tard après ce délai
CAPTURE_TIMEOUT = int(os.getenv("CS2_CAPTURE_TIMEOUT", "600"))

NETCON_TEST_MARKER = "HIGHLIGHTGG_NETCON_OK"

# Console TCP de CS2 (-netconport) : permet d'envoyer les commandes AU BON
# MOMENT. Leçon de la session 7 : tout mettre dans le cfg ne marche pas —
# `playdemo` charge la démo de façon asynchrone (~90s), donc demo_goto /
# startmovie exécutés depuis le cfg partent dans le vide avant le chargement,
# et la démo est jouée en entier sans jamais enregistrer.
# 29000 est le port par défaut de VConsole2 (console dev Source 2, protocole
# binaire à chunks CMND/PRNT/AINF...), ouvert automatiquement par CS2 QUELQUE
# SOIT la valeur de -netconport. Le demander nous-mêmes crée une collision :
# on finit par parler à VConsole (qui ignore du texte brut) au lieu de notre
# netconport. Diagnostic confirmé en session 8 via renderer/tools/netcon_probe.py
# — le texte brut fonctionne parfaitement sur un port qui NE COLLISIONNE PAS
# avec 29000.
NETCON_PORT = int(os.getenv("CS2_NETCON_PORT", "47201"))
# Délai max pour que la démo soit chargée (map + assets), puis pour le seek.
DEMO_LOAD_TIMEOUT = int(os.getenv("CS2_DEMO_LOAD_TIMEOUT", "240"))
DEMO_SEEK_WAIT    = int(os.getenv("CS2_DEMO_SEEK_WAIT", "15"))
CONSOLE_LOG = Path(f"{CS2_DIR}/game/csgo/console.log")


def accountid_from_steamid(steamid) -> int | None:
    """steamid64 → accountid 32 bits (utilisé par spec_lock_to_accountid)."""
    try:
        sid = int(steamid)
    except (TypeError, ValueError):
        return None
    acct = sid - STEAM64_BASE
    return acct if acct > 0 else None


def expected_frame_count(tick_start: int, tick_end: int) -> int:
    """Nombre de frames TGA attendues pour la fenêtre [tick_start, tick_end]."""
    seconds = max(0, tick_end - tick_start) / TICKRATE
    return max(1, round(seconds * FPS))


def _write_cfg(demo_path: Path) -> Path:
    """
    Écrit le cfg exécuté par CS2 au démarrage. Il ne contient QUE les cvars
    globales + le `playdemo` : les commandes dépendantes du chargement de la
    démo (demo_goto, spec_*, startmovie) sont envoyées ensuite via netcon.
    """
    cfg_dir = Path(CS2_CFG_DIR)
    cfg_dir.mkdir(parents=True, exist_ok=True)

    lines = [
        "// auto-généré par le renderer Highlight.gg — ne pas éditer",
        "sv_cheats 1",
        "fps_max 0",
        f"host_framerate {FPS}",     # rend chaque frame de façon déterministe
        "demo_quitafterplayback 1",  # filet de sécurité si on ne tue pas avant
        f'playdemo "{demo_path}"',
    ]

    cfg_path = cfg_dir / f"{CFG_NAME}.cfg"
    cfg_path.write_text("\n".join(lines) + "\n")
    logger.info("Wrote CS2 render config → %s", cfg_path)
    return cfg_path


class NetconClient:
    """
    Console TCP de CS2 (-netconport). Connexion PERSISTANTE unique : le netcon
    est bidirectionnel et CS2 lie sa sortie console au socket ouvert. On garde
    donc une seule connexion pour toute la capture, et un thread lecteur logue
    ce que CS2 renvoie (indispensable pour voir la réponse à `startmovie`).
    """

    def __init__(self, sock: socket.socket):
        self._sock = sock
        self._buf = ""
        self._lock = threading.Lock()
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    def _read_loop(self) -> None:
        try:
            while True:
                data = self._sock.recv(4096)
                if not data:
                    logger.warning("netcon: connexion fermée par CS2 (recv → 0 octet).")
                    return
                text = data.decode(errors="replace")
                with self._lock:
                    self._buf += text
                # Dump brut, non filtré : on doit voir même un banner/prompt vide.
                logger.info("netcon ← [%d octets] %r", len(data), text[:300])
        except OSError as e:
            logger.warning("netcon: erreur de lecture socket (%s).", e)
            return

    def send(self, *commands: str) -> None:
        """
        Texte brut terminé par \\n (protocole netconport classique, confirmé
        fonctionnel en session 8 via renderer/tools/netcon_probe.py — le vrai
        bug était une collision de port avec VConsole2, pas le protocole).
        """
        for cmd in commands:
            logger.info("netcon → %s", cmd)
            self._sock.sendall((cmd + "\n").encode())
            time.sleep(0.4)

    def output(self) -> str:
        with self._lock:
            return self._buf

    def close(self) -> None:
        try:
            self._sock.close()
        except OSError:
            pass


def _connect_netcon(proc: subprocess.Popen, deadline: float) -> NetconClient:
    """Attend que le port netcon accepte, puis ouvre la connexion persistante."""
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"CS2 s'est terminé prématurément (code {proc.returncode}).")
        try:
            sock = socket.create_connection(("127.0.0.1", NETCON_PORT), timeout=5)
            # Le timeout de connexion persiste sur le socket après connect() —
            # sans le lever, recv() dans le thread lecteur lève socket.timeout
            # (sous-classe d'OSError) au premier silence de 5s et tue le
            # thread pour de bon. Le thread doit bloquer indéfiniment.
            sock.settimeout(None)
            logger.info("netcon: port %d ouvert (connexion persistante).", NETCON_PORT)
            return NetconClient(sock)
        except OSError:
            time.sleep(2)
    raise RuntimeError(f"CS2 netcon injoignable après {DEMO_LOAD_TIMEOUT}s.")


def _wait_for_demo_loaded(proc: subprocess.Popen, deadline: float) -> None:
    """
    Attend le "Host activate: Playing Demo" dans console.log (écrit par
    -condebug), signe que la map + la démo sont chargées et que les commandes
    demo_* deviennent effectives.

    NB : CS2 tronque console.log à chaque lancement (on le supprime en plus
    avant de lancer), donc le fichier ne contient que le run courant → pas
    besoin d'offset, on lit tout.
    """
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"CS2 s'est terminé prématurément (code {proc.returncode}).")
        try:
            if "Host activate: Playing Demo" in CONSOLE_LOG.read_text(errors="replace"):
                logger.info("Démo chargée (Host activate).")
                return
        except OSError:
            pass
        time.sleep(2)
    raise RuntimeError(f"Démo pas chargée après {DEMO_LOAD_TIMEOUT}s.")


def capture_frames(demo_path: Path, tick_start: int, tick_end: int,
                   player_steamid: str | None, work_dir: Path) -> Path:
    """
    Capture les frames TGA de la fenêtre [tick_start, tick_end].
    Renvoie le répertoire contenant frame_*.tga. Lève si rien n'est capturé.
    """
    frames_dir = work_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    accountid = accountid_from_steamid(player_steamid)
    if accountid is None:
        logger.warning("No valid player steamid (%s) — caméra chase.", player_steamid)

    expected = expected_frame_count(tick_start, tick_end)
    frame_prefix = str(frames_dir / "frame_")
    logger.info(
        "Capture: ticks [%d→%d] accountid=%s expected≈%d frames @ %dfps",
        tick_start, tick_end, accountid, expected, FPS,
    )

    _write_cfg(demo_path)

    args = [
        CS2_CMD,
        "-insecure", "-novid", "-nojoy", "-condebug",
        "-netconport", str(NETCON_PORT),
        "-windowed", "-w", str(WIDTH), "-h", str(HEIGHT),
        "+exec", CFG_NAME,
    ]

    # Le binaire brut a besoin de ses libs (rendersystemvulkan, etc.) dans le
    # LD_LIBRARY_PATH. DISPLAY / XDG_RUNTIME_DIR sont hérités de l'entrypoint.
    env = dict(os.environ)
    env["LD_LIBRARY_PATH"] = CS2_LIB_DIR + ":" + env.get("LD_LIBRARY_PATH", "")

    # CS2 recrée console.log au lancement ; on le supprime d'abord pour être
    # sûr de ne lire QUE le run courant (détection "Host activate" fiable).
    try:
        CONSOLE_LOG.unlink()
    except OSError:
        pass

    # Sortie de CS2 conservée pour debug (on ne veut plus être aveugle).
    cs2_log = work_dir / "cs2.log"
    logger.info("Launching CS2 (log → %s): %s", cs2_log, " ".join(args))
    with open(cs2_log, "wb") as log_fh:
        proc = subprocess.Popen(args, env=env, stdout=log_fh, stderr=subprocess.STDOUT)
        netcon = None
        try:
            # 1. Attendre que la console TCP et la démo soient prêtes.
            deadline = time.time() + DEMO_LOAD_TIMEOUT
            netcon = _connect_netcon(proc, deadline)

            # 1bis. Auto-test : confirme que les commandes envoyées sur CETTE
            # connexion sont bien exécutées par CS2. La confirmation arrive
            # sur LE SOCKET lui-même (echo renvoie sa sortie sur la connexion
            # netcon) — PAS dans console.log, qui ne la reçoit jamais (constaté
            # en session 8 via renderer/tools/netcon_probe.py).
            netcon.send(f"echo {NETCON_TEST_MARKER}")
            # Le boot de CS2 mirrore un gros volume de logs sur ce même socket
            # — notre echo peut être noyé/en retard derrière ce backlog. On
            # retente sur une fenêtre plus large plutôt qu'un seul check tôt.
            for _ in range(10):
                if NETCON_TEST_MARKER in netcon.output():
                    logger.info("netcon: auto-test OK — les commandes sont bien reçues par CS2.")
                    break
                time.sleep(1)
            else:
                logger.warning("netcon: auto-test ÉCHOUÉ — 'echo %s' absent de la réponse socket. "
                                "Les commandes n'atteignent probablement pas CS2.", NETCON_TEST_MARKER)

            _wait_for_demo_loaded(proc, deadline)

            # 2. Seek + caméra. sv_cheats est renvoyé APRÈS le load car il peut
            #    être reset au chargement de la démo (startmovie l'exige).
            spec_cmds = (
                [f"spec_lock_to_accountid {accountid}", "spec_mode 4"]
                if accountid is not None else ["spec_mode 5"]
            )
            netcon.send("sv_cheats 1", f"host_framerate {FPS}",
                        f"demo_gototick {tick_start}", *spec_cmds)
            time.sleep(DEMO_SEEK_WAIT)

            # 3. Enregistrement du segment. demo_gototick laisse la démo en
            # pause (comportement observé en session 8 : startmovie s'arme
            # sans erreur mais 0 tick n'avance → 0 frame). demo_resume avant
            # startmovie pour que la lecture reprenne réellement.
            netcon.send("demo_resume")
            netcon.send(f'startmovie "{frame_prefix}" tga')
            _wait_for_capture(proc, frames_dir, expected)

            # 4. Arrêt propre de l'enregistrement avant de tuer CS2.
            try:
                netcon.send("endmovie", "quit")
                proc.wait(timeout=15)
            except (OSError, subprocess.TimeoutExpired):
                pass
        finally:
            if netcon is not None:
                netcon.close()
            _terminate(proc)

    frames = sorted(frames_dir.glob("frame_*.tga"))
    if not frames:
        tail = _tail(cs2_log, 40)
        raise RuntimeError(f"CS2 n'a produit aucune frame TGA. Fin du log CS2:\n{tail}")
    logger.info("Captured %d frames in %s", len(frames), frames_dir)
    return frames_dir


def _wait_for_capture(proc: subprocess.Popen, frames_dir: Path,
                      expected: int) -> None:
    """
    Attend que ≥ `expected` frames soient écrites et que le compte se stabilise
    (la démo a dépassé tick_end), ou que CS2 se termine, ou timeout.
    """
    deadline = time.time() + CAPTURE_TIMEOUT
    last_count = -1
    stable = 0

    while True:
        if proc.poll() is not None:
            logger.info("CS2 exited on its own (code %s).", proc.returncode)
            return

        count = len(list(frames_dir.glob("frame_*.tga")))
        if count >= expected and count == last_count:
            stable += 1
            if stable >= 3:   # plus de nouvelles frames → segment capturé
                logger.info("Frame count stable at %d ≥ %d — done.", count, expected)
                return
        else:
            stable = 0
        last_count = count

        if time.time() > deadline:
            logger.warning("Capture timeout (%ds) at %d frames.", CAPTURE_TIMEOUT, count)
            return

        time.sleep(2)


def _terminate(proc: subprocess.Popen) -> None:
    """Arrête CS2 proprement, puis force si nécessaire. Les TGA déjà écrites restent."""
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        logger.warning("CS2 did not stop — killing.")
        proc.kill()
        proc.wait(timeout=10)


def _tail(path: Path, n: int) -> str:
    """Renvoie les n dernières lignes d'un fichier (pour les messages d'erreur)."""
    try:
        lines = path.read_text(errors="replace").splitlines()
        return "\n".join(lines[-n:])
    except OSError:
        return "(log CS2 introuvable)"
