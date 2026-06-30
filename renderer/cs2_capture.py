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
import subprocess
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

# Localisation de CS2 (ajusté sur le host GPU en 2.5)
CS2_DIR     = os.getenv("CS2_DIR", "/opt/cs2")
CS2_CMD     = os.getenv("CS2_CMD", f"{CS2_DIR}/game/bin/linuxsteamrt64/cs2")
CS2_CFG_DIR = os.getenv("CS2_CFG_DIR", f"{CS2_DIR}/game/csgo/cfg")
CFG_NAME    = "highlightgg_render"   # exec sans extension, relatif à csgo/cfg

# Filet de sécurité : on tue CS2 au plus tard après ce délai
CAPTURE_TIMEOUT = int(os.getenv("CS2_CAPTURE_TIMEOUT", "600"))


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


def _write_cfg(demo_path: Path, tick_start: int, accountid: int | None,
               frame_prefix: str) -> Path:
    """Écrit le cfg exécuté par CS2 (dans csgo/cfg/) et renvoie son chemin."""
    cfg_dir = Path(CS2_CFG_DIR)
    cfg_dir.mkdir(parents=True, exist_ok=True)

    lines = [
        "// auto-généré par le renderer Highlight.gg — ne pas éditer",
        "sv_cheats 1",
        "fps_max 0",
        f"host_framerate {FPS}",     # rend chaque frame de façon déterministe
        "demo_quitafterplayback 1",  # filet de sécurité si on ne tue pas avant
        f'playdemo "{demo_path}"',
        # ↓ prennent effet une fois la démo chargée
        f"demo_goto {tick_start} 0 0",
    ]
    if accountid is not None:
        lines += [
            f"spec_lock_to_accountid {accountid}",
            "spec_mode 4",   # in-eye / première personne
        ]
    else:
        lines.append("spec_mode 5")  # caméra chase si joueur inconnu
    lines.append(f'startmovie "{frame_prefix}" tga')

    cfg_path = cfg_dir / f"{CFG_NAME}.cfg"
    cfg_path.write_text("\n".join(lines) + "\n")
    logger.info("Wrote CS2 render config → %s", cfg_path)
    return cfg_path


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

    _write_cfg(demo_path, tick_start, accountid, frame_prefix)

    args = [
        CS2_CMD,
        "-insecure", "-novid", "-nojoy",
        "-windowed", "-w", str(WIDTH), "-h", str(HEIGHT),
        "+exec", CFG_NAME,
    ]
    logger.info("Launching CS2: %s", " ".join(args))
    proc = subprocess.Popen(
        args,
        env=os.environ,            # hérite DISPLAY=:99 fixé par entrypoint.sh
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )

    try:
        _wait_for_capture(proc, frames_dir, expected)
    finally:
        _terminate(proc)

    frames = sorted(frames_dir.glob("frame_*.tga"))
    if not frames:
        raise RuntimeError("CS2 n'a produit aucune frame TGA")
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
