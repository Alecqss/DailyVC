"""
Highlight.gg — Encoding TGA frames → MP4 (étape 2.4).

Prend un répertoire de frames TGA produit par cs2_capture.capture_frames,
encode en H.264/MP4 via ffmpeg, et renvoie (chemin_mp4, durée_secondes).
"""

import logging
import os
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger("renderer.ffmpeg")

FPS = int(os.getenv("CS2_FPS", "60"))

# Qualité H.264 : 18 = haute qualité, fichier plus gros ; 23 = qualité correcte
CRF = int(os.getenv("FFMPEG_CRF", "18"))


def encode(frames_dir: Path, clip_id: str) -> tuple[Path, float]:
    """
    Encode les frames TGA de `frames_dir` en MP4.
    Returns: (chemin absolu du MP4, durée en secondes)
    Lève si ffmpeg échoue ou s'il n'y a aucune frame.
    """
    frames = sorted(frames_dir.glob("*.tga"))
    if not frames:
        raise RuntimeError(f"Aucune frame TGA dans {frames_dir}")

    duration_sec = len(frames) / FPS
    logger.info(
        "Encoding %d frames @ %dfps → %.1fs  (clip %s)",
        len(frames), FPS, duration_sec, clip_id,
    )

    # Écrit un fichier liste pour le concat demuxer de ffmpeg :
    # plus robuste que le pattern image2 (gère n'importe quel nommage).
    list_file = frames_dir / "frames.txt"
    list_file.write_text(
        "\n".join(f"file '{f.name}'" for f in frames) + "\n"
    )

    mp4_path = Path(tempfile.mktemp(prefix=f"clip_{clip_id}_", suffix=".mp4"))

    cmd = [
        "ffmpeg", "-y",
        "-r", str(FPS),
        "-f", "concat",
        "-safe", "0",
        "-i", str(list_file),
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",   # force dimensions paires (requis H.264)
        "-c:v", "libx264",
        "-crf", str(CRF),
        "-preset", "fast",
        "-pix_fmt", "yuv420p",       # compatibilité navigateur maximale
        "-movflags", "+faststart",   # metadata en tête (streaming progressif)
        str(mp4_path),
    ]
    logger.info("ffmpeg: %s", " ".join(cmd))

    result = subprocess.run(
        cmd,
        cwd=str(frames_dir),   # chemins relatifs dans frames.txt
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed (code {result.returncode}):\n{result.stderr[-2000:]}"
        )

    logger.info("MP4 ready → %s (%.1fs)", mp4_path, duration_sec)
    return mp4_path, duration_sec
