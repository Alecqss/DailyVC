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

from dotenv import load_dotenv

from parser import detect_highlights
from supabase_client import get_supabase_client

load_dotenv()  # no-op in production; useful for local dev with a .env file

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("worker")

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "10"))
DEMOS_BUCKET  = "demos"


# ── Main loop ─────────────────────────────────────────────────────────────────

def main() -> None:
    supabase = get_supabase_client()
    logger.info("Worker started. Polling every %ds.", POLL_INTERVAL)

    while True:
        try:
            demo = _pick_demo(supabase)
            if demo:
                _process_demo(demo, supabase)
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


def _process_demo(demo: dict, supabase) -> None:
    demo_id      = demo["id"]
    storage_path = demo["storage_path"]
    action_types = demo.get("action_types") or []

    logger.info("Processing demo %s  (file: %s)", demo_id, storage_path)

    dem_path: Path | None = None
    try:
        # ── 1. Download ──────────────────────────────────────────────────────
        _update(supabase, demo_id, progress=10)
        dem_path = _download_demo(supabase, storage_path)

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


def _download_demo(supabase, storage_path: str) -> Path:
    logger.debug("Downloading %s from storage…", storage_path)
    file_bytes: bytes = supabase.storage.from_(DEMOS_BUCKET).download(storage_path)

    tmp = tempfile.NamedTemporaryFile(suffix=".dem", delete=False)
    tmp.write(file_bytes)
    tmp.close()
    return Path(tmp.name)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    main()
