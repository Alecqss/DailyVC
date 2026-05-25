"""
Highlight.gg — CS2 demo processing worker.

Loop:
  1. Poll Supabase for demos with status = "uploaded"
  2. Download the .dem file from Storage
  3. Parse it (demoparser2) to detect highlights
  4. Write highlights to the `highlights` table
  5. Update demo status to "done" (or "error")

Phase 2: generate MP4 clips and write to the `clips` table.
"""

import logging
import os
import tempfile
import time
from pathlib import Path

import boto3
from botocore.config import Config
from dotenv import load_dotenv

from parser import detect_highlights
from supabase_client import get_supabase_client

load_dotenv()  # no-op in production; useful for local dev with a .env file

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("worker")

POLL_INTERVAL   = int(os.getenv("POLL_INTERVAL_SECONDS", "10"))
R2_BUCKET_DEMOS = os.getenv("R2_BUCKET_DEMOS", "csplays-gg-demos")


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
    logger.info("Worker started. Polling every %ds.", POLL_INTERVAL)

    while True:
        try:
            demo = _pick_demo(supabase)
            if demo:
                _process_demo(demo, supabase, r2)
            else:
                time.sleep(POLL_INTERVAL)
        except Exception as exc:
            logger.exception("Unexpected error in main loop: %s", exc)
            time.sleep(POLL_INTERVAL)


# ── Demo processing ───────────────────────────────────────────────────────────

def _pick_demo(supabase) -> dict | None:
    """
    Fetch one 'uploaded' demo and immediately claim it by setting
    status = 'parsing'. Returns None when the queue is empty.
    """
    result = (
        supabase.table("demos")
        .select("*")
        .eq("status", "uploaded")
        .order("created_at")
        .limit(1)
        .execute()
    )
    demos = result.data or []
    if not demos:
        return None

    demo = demos[0]
    # Claim it immediately to avoid double-processing
    supabase.table("demos").update(
        {"status": "parsing", "progress": 5}
    ).eq("id", demo["id"]).execute()

    return demo


def _process_demo(demo: dict, supabase, r2) -> None:
    demo_id      = demo["id"]
    storage_path = demo["storage_path"]   # = clé R2
    action_types = demo.get("action_types") or []

    logger.info("Processing demo %s  (file: %s)", demo_id, storage_path)

    dem_path: Path | None = None
    try:
        # ── 1. Download depuis R2 ────────────────────────────────────────────
        _update(supabase, demo_id, progress=10)
        dem_path = _download_demo_r2(r2, storage_path)

        # ── 2. Parse ─────────────────────────────────────────────────────────
        _update(supabase, demo_id, progress=20)
        highlights, map_name, match_date = detect_highlights(str(dem_path), action_types)

        logger.info("Found %d highlights for demo %s.", len(highlights), demo_id)
        _update(supabase, demo_id, progress=60)

        # ── 3. Persist highlights ────────────────────────────────────────────
        if highlights:
            rows = [
                {
                    "demo_id":    demo_id,
                    "type":       h["type"],
                    "tick_start": h["tick_start"],
                    "tick_end":   h["tick_end"],
                    "round":      h["round"],
                    "kills":      h["kills"],
                }
                for h in highlights
            ]
            supabase.table("highlights").insert(rows).execute()

        _update(supabase, demo_id, progress=80)

        # ── 4. Update demo metadata ──────────────────────────────────────────
        meta: dict = {"status": "done", "progress": 100}
        if map_name:
            meta["map_name"] = map_name
        if match_date:
            meta["match_date"] = match_date

        supabase.table("demos").update(meta).eq("id", demo_id).execute()
        logger.info("Demo %s done. %d highlights stored.", demo_id, len(highlights))

        # ── 5. Supprime le .dem de R2 (économie de stockage) ────────────────
        _delete_demo_r2(r2, storage_path)

    except Exception as exc:
        logger.exception("Error processing demo %s: %s", demo_id, exc)
        supabase.table("demos").update(
            {"status": "error", "error_message": str(exc)[:500]}
        ).eq("id", demo_id).execute()

    finally:
        if dem_path and dem_path.exists():
            dem_path.unlink(missing_ok=True)
            logger.debug("Deleted temp file %s", dem_path)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _update(supabase, demo_id: str, **fields) -> None:
    supabase.table("demos").update(fields).eq("id", demo_id).execute()


def _download_demo_r2(r2, key: str) -> Path:
    logger.info("Downloading %s from R2…", key)
    tmp = tempfile.NamedTemporaryFile(suffix=".dem", delete=False)
    tmp.close()
    r2.download_file(R2_BUCKET_DEMOS, key, tmp.name)
    logger.info("Download complete → %s", tmp.name)
    return Path(tmp.name)


def _delete_demo_r2(r2, key: str) -> None:
    try:
        r2.delete_object(Bucket=R2_BUCKET_DEMOS, Key=key)
        logger.info("Deleted %s from R2.", key)
    except Exception as exc:
        logger.warning("Could not delete %s from R2: %s", key, exc)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    main()
