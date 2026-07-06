"""
CS2 headless capture for the clip renderer (étape 2.3, refonte session 8).

⚠️ Leçon majeure de la session 8 : `startmovie` N'EXISTE PAS dans le binaire
Linux de CS2 (`find startmovie` → "no results" via netcon), et aucune commande
de rendu offline alternative n'est exposée (`find movie/demo_/record` vérifiés).
La capture frame-par-frame déterministe est donc impossible sur Linux sans
HLAE (Windows only). → Pivot : capture TEMPS RÉEL du display Xvfb via
`ffmpeg -f x11grab`, validée en live sur la VM (60 fps constants, fluide).

Given a .dem file, the player's steamid and a [tick_start, tick_end] window,
this module:
  1. Generates a minimal CS2 console config (cvars globales + playdemo).
  2. Launches CS2 headless under the already-running Xvfb display.
  3. Drives the demo via netcon (seek → caméra → HUD propre → resume) puis
     enregistre le display avec ffmpeg x11grab pendant la durée du segment.
  4. Returns the path of the captured capture.mp4.

Contrainte de la capture temps réel : la fluidité du clip dépend du framerate
réel de CS2 pendant la lecture (pas de host_framerate ici — il découplerait
le temps moteur du temps réel et rendrait la vidéo accélérée/ralentie).
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
WIDTH    = int(os.getenv("CS2_WIDTH", "1920"))    # doit matcher le Xvfb (entrypoint)
HEIGHT   = int(os.getenv("CS2_HEIGHT", "1080"))

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


def clip_duration_sec(tick_start: int, tick_end: int) -> float:
    """Durée réelle (secondes) de la fenêtre [tick_start, tick_end]."""
    return max(1.0, (tick_end - tick_start) / TICKRATE)


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
        "fps_max 0",                 # capture temps réel : PAS de host_framerate
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
    Capture la fenêtre [tick_start, tick_end] en temps réel via x11grab.
    Renvoie le chemin du capture.mp4. Lève si rien n'est capturé.
    """
    capture_path = work_dir / "capture.mp4"

    accountid = accountid_from_steamid(player_steamid)
    if accountid is None:
        logger.warning("No valid player steamid (%s) — caméra chase.", player_steamid)

    duration = clip_duration_sec(tick_start, tick_end)
    logger.info(
        "Capture: ticks [%d→%d] accountid=%s durée=%.1fs @ %dfps (%dx%d, x11grab)",
        tick_start, tick_end, accountid, duration, FPS, WIDTH, HEIGHT,
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

            # 2. Seek + caméra + HUD propre. sv_cheats est renvoyé APRÈS le
            #    load car il peut être reset au chargement de la démo.
            #    demo_ui_mode 0 masque la barre de lecture de démo (retour
            #    utilisateur session 8 : "HUD de la démo présent").
            spec_cmds = (
                [f"spec_lock_to_accountid {accountid}", "spec_mode 4"]
                if accountid is not None else ["spec_mode 5"]
            )
            netcon.send("sv_cheats 1", "demo_ui_mode 0",
                        f"demo_gototick {tick_start}", *spec_cmds)
            time.sleep(DEMO_SEEK_WAIT)

            # 3. Armer l'arrêt automatique exactement à tick_end (la démo se
            #    remettra en pause toute seule), puis lancer ffmpeg AVANT le
            #    resume : on préfère ≤1s de lead-in figé au début plutôt que
            #    de rater le début de l'action.
            netcon.send(f"demo_pauseatservertick {tick_end}")
            ffmpeg = _start_x11grab(capture_path, duration + 1.5)
            netcon.send("demo_resume")

            try:
                ffmpeg.wait(timeout=duration + 30)
            except subprocess.TimeoutExpired:
                logger.warning("ffmpeg x11grab ne s'est pas terminé — kill.")
                ffmpeg.kill()
                ffmpeg.wait(timeout=10)

            # 4. Arrêt propre de CS2.
            try:
                netcon.send("quit")
                proc.wait(timeout=15)
            except (OSError, subprocess.TimeoutExpired):
                pass
        finally:
            if netcon is not None:
                netcon.close()
            _terminate(proc)

    if not capture_path.exists() or capture_path.stat().st_size < 50_000:
        tail = _tail(cs2_log, 40)
        raise RuntimeError(f"Capture x11grab vide ou absente. Fin du log CS2:\n{tail}")
    logger.info("Captured %.1fs → %s (%d octets)",
                duration, capture_path, capture_path.stat().st_size)
    return capture_path


def _start_x11grab(capture_path: Path, duration: float) -> subprocess.Popen:
    """
    Lance ffmpeg en capture du display Xvfb (hérité via $DISPLAY) pendant
    `duration` secondes. Validé en session 8 : 60 fps constants sur la VM L4.
    """
    display = os.environ.get("DISPLAY", ":99")
    cmd = [
        "ffmpeg", "-y",
        "-f", "x11grab",
        "-framerate", str(FPS),
        "-video_size", f"{WIDTH}x{HEIGHT}",
        "-i", display,
        "-t", f"{duration:.1f}",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", str(int(os.getenv("FFMPEG_CRF", "18"))),
        "-pix_fmt", "yuv420p",
        str(capture_path),
    ]
    logger.info("x11grab: %s", " ".join(cmd))
    log_path = capture_path.with_suffix(".ffmpeg.log")
    log_fh = open(log_path, "wb")
    # ⚠️ L'entrypoint exporte LD_LIBRARY_PATH vers les libs de CS2, qui
    # embarquent leurs propres libav* — ffmpeg les charge à la place de
    # celles du système et crashe (symbol lookup error, session 8).
    # → env nettoyé pour ffmpeg.
    env = dict(os.environ)
    env.pop("LD_LIBRARY_PATH", None)
    return subprocess.Popen(cmd, env=env, stdout=log_fh, stderr=subprocess.STDOUT)


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
