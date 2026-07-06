"""
Highlight.gg — Finalisation du clip (étape 2.4, refonte session 8).

La capture n'est plus un dossier de frames TGA (`startmovie` n'existe pas dans
le binaire Linux de CS2) mais un capture.mp4 déjà encodé par x11grab dans
cs2_capture. Ici on ne fait que la finalisation pour le web :
  - remux avec +faststart (metadata en tête → streaming progressif)
  - mesure de la durée réelle via ffprobe
Pas de ré-encodage (la capture est déjà en H.264/yuv420p au bon CRF).
"""

import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger("renderer.ffmpeg")


def _clean_env() -> dict:
    """Env sans le LD_LIBRARY_PATH des libs CS2 (leurs libav* cassent ffmpeg)."""
    env = dict(os.environ)
    env.pop("LD_LIBRARY_PATH", None)
    return env


def encode(capture_path: Path, clip_id: str) -> tuple[Path, float]:
    """
    Finalise le capture.mp4 produit par cs2_capture.
    Returns: (chemin absolu du MP4 final, durée en secondes)
    Lève si ffmpeg/ffprobe échoue ou si la capture est absente.
    """
    if not capture_path.exists():
        raise RuntimeError(f"Capture absente : {capture_path}")

    mp4_path = Path(tempfile.mktemp(prefix=f"clip_{clip_id}_", suffix=".mp4"))

    cmd = [
        "ffmpeg", "-y",
        "-i", str(capture_path),
        "-c", "copy",                # pas de ré-encodage : remux uniquement
        "-movflags", "+faststart",   # metadata en tête (streaming progressif)
        str(mp4_path),
    ]
    logger.info("ffmpeg (remux faststart): %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, env=_clean_env())
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed (code {result.returncode}):\n{result.stderr[-2000:]}"
        )

    duration_sec = _probe_duration(mp4_path)
    logger.info("MP4 ready → %s (%.1fs)", mp4_path, duration_sec)
    return mp4_path, duration_sec


def _probe_duration(mp4_path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", str(mp4_path)],
        capture_output=True, text=True, env=_clean_env(),
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed:\n{result.stderr[-500:]}")
    return float(json.loads(result.stdout)["format"]["duration"])
