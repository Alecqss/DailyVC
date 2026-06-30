"""
Highlight.gg — Clip renderer worker.

Loop:
  1. Poll Supabase for clips with status = "pending"
  2. Fetch the associated highlight (tick_start, tick_end) and demo (storage_path)
  3. Download the .dem file from R2
  4. [2.3] Launch CS2 headless (Xvfb + +playdemo) and capture TGA frames
  5. [2.4] Encode TGA frames → MP4 via ffmpeg
  6. Upload MP4 to R2 bucket "clips"
  7. Update clip status to "done" with storage_path and duration_sec

Requires environment variables:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
  R2_BUCKET_DEMOS  (private, download .dem)
  R2_BUCKET_CLIPS  (public,  upload MP4)
"""

import logging
import os
import tempfile
import time
from pathlib import Path

import boto3
from botocore.config import Config
from dotenv import load_dotenv

from supabase_client import get_supabase_client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("renderer")

POLL_INTERVAL    = int(os.getenv("POLL_INTERVAL_SECONDS", "10"))
R2_BUCKET_DEMOS  = os.getenv("R2_BUCKET_DEMOS", "csplays-gg-demos")
R2_BUCKET_CLIPS  = os.getenv("R2_BUCKET_CLIPS", "csplays-gg-clips")


def _get_r2_client():
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


# ── Main loop ─────────────────────────────────────────────────────────────────

def main() -> None:
    supabase = get_supabase_client()
    r2       = _get_r2_client()
    logger.info("Renderer started. Polling every %ds.", POLL_INTERVAL)

    while True:
        try:
            clip = _pick_clip(supabase)
            if clip:
                _process_clip(clip, supabase, r2)
            else:
                time.sleep(POLL_INTERVAL)
        except Exception as exc:
            logger.exception("Unexpected error in main loop: %s", exc)
            time.sleep(POLL_INTERVAL)


# ── Clip processing ───────────────────────────────────────────────────────────

def _pick_clip(supabase) -> dict | None:
    """
    Fetch one 'pending' clip with its highlight + demo, claim it atomically.
    Returns None when the queue is empty.
    """
    result = (
        supabase.table("clips")
        .select("*, highlights(tick_start, tick_end, demo_id, demos(storage_path))")
        .eq("status", "pending")
        .order("created_at")
        .limit(1)
        .execute()
    )
    clips = result.data or []
    if not clips:
        return None

    clip = clips[0]
    supabase.table("clips").update(
        {"status": "rendering", "progress": 5}
    ).eq("id", clip["id"]).execute()

    return clip


def _process_clip(clip: dict, supabase, r2) -> None:
    clip_id   = clip["id"]
    highlight = clip["highlights"]
    demo      = highlight["demos"]

    tick_start   = highlight["tick_start"]
    tick_end     = highlight["tick_end"]
    storage_path = demo["storage_path"]

    logger.info("Rendering clip %s  ticks [%d → %d]", clip_id, tick_start, tick_end)

    dem_path: Path | None = None
    frames_dir: Path | None = None

    try:
        # ── 1. Download .dem from R2 ─────────────────────────────────────────
        _update(supabase, clip_id, progress=10)
        dem_path = _download_dem(r2, storage_path)

        # ── 2. CS2 headless render → TGA frames (étape 2.3) ─────────────────
        _update(supabase, clip_id, progress=20)
        frames_dir = _render_cs2_frames(dem_path, tick_start, tick_end, clip_id)

        # ── 3. Encode TGA → MP4 via ffmpeg (étape 2.4) ──────────────────────
        _update(supabase, clip_id, progress=70)
        mp4_path, duration_sec = _encode_mp4(frames_dir, clip_id)

        # ── 4. Upload MP4 → R2 "clips" bucket ───────────────────────────────
        _update(supabase, clip_id, progress=90)
        r2_key = _upload_mp4(r2, mp4_path, clip_id)

        # ── 5. Mark done ─────────────────────────────────────────────────────
        supabase.table("clips").update({
            "status":       "done",
            "progress":     100,
            "storage_path": r2_key,
            "duration_sec": duration_sec,
        }).eq("id", clip_id).execute()

        logger.info("Clip %s done → %s (%.1fs)", clip_id, r2_key, duration_sec)

    except Exception as exc:
        logger.exception("Error rendering clip %s: %s", clip_id, exc)
        supabase.table("clips").update({
            "status":        "error",
            "error_message": str(exc)[:500],
        }).eq("id", clip_id).execute()

    finally:
        if dem_path and dem_path.exists():
            dem_path.unlink(missing_ok=True)
        if frames_dir and frames_dir.exists():
            import shutil
            shutil.rmtree(frames_dir, ignore_errors=True)


# ── Step 2.3 — CS2 headless render (à implémenter) ────────────────────────────

def _render_cs2_frames(dem_path: Path, tick_start: int, tick_end: int, clip_id: str) -> Path:
    """
    Lance CS2 en headless (Xvfb) et capture les frames TGA entre tick_start et tick_end.
    Returns: répertoire contenant les frames frame_XXXXXX.tga
    Implémenté en étape 2.3.
    """
    raise NotImplementedError("CS2 headless rendering — étape 2.3")


# ── Step 2.4 — ffmpeg encoding (à implémenter) ────────────────────────────────

def _encode_mp4(frames_dir: Path, clip_id: str) -> tuple[Path, float]:
    """
    Encode les frames TGA en MP4 via ffmpeg.
    Returns: (chemin mp4, durée en secondes)
    Implémenté en étape 2.4.
    """
    raise NotImplementedError("ffmpeg encoding — étape 2.4")


# ── R2 helpers ────────────────────────────────────────────────────────────────

def _download_dem(r2, key: str) -> Path:
    logger.info("Downloading %s from R2…", key)
    tmp = tempfile.NamedTemporaryFile(suffix=".dem", delete=False)
    tmp.close()
    r2.download_file(R2_BUCKET_DEMOS, key, tmp.name)
    logger.info("Download complete → %s", tmp.name)
    return Path(tmp.name)


def _upload_mp4(r2, mp4_path: Path, clip_id: str) -> str:
    key = f"clips/{clip_id}.mp4"
    logger.info("Uploading %s → R2 %s…", mp4_path, key)
    r2.upload_file(
        str(mp4_path),
        R2_BUCKET_CLIPS,
        key,
        ExtraArgs={"ContentType": "video/mp4"},
    )
    logger.info("Upload complete.")
    return key


# ── Helpers ───────────────────────────────────────────────────────────────────

def _update(supabase, clip_id: str, **fields) -> None:
    supabase.table("clips").update(fields).eq("id", clip_id).execute()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    main()
