"""
Highlight.gg — CS2 clip renderer worker (Phase 2).

Pipeline (une fois complète — Steps 2.3 / 2.4) :
  1. Poll Supabase pour les clips avec status = "pending"
  2. Claim atomique → status = "rendering"
  3. Récupère le highlight + la démo associée
  4. Télécharge le .dem depuis R2
  5. (Step 2.3) Lance CS2 headless + Xvfb → +playdemo + demo_goto/startmovie → capture TGA
  6. (Step 2.4) Encode les frames TGA → MP4 avec ffmpeg
  7. (Step 2.4) Upload MP4 dans le bucket R2 "clips"
  8. Met à jour le clip : status="done", storage_path, duration_sec
  9. Supprime le .dem si plus aucun clip "pending" pour ce match

ÉTAPE 2.2 — Scaffold : le polling + claim sont fonctionnels.
  La partie rendering (étapes 5–8) est un placeholder NotImplementedError.
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

load_dotenv()  # no-op en prod ; utile pour dev local avec .env

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("renderer")

POLL_INTERVAL   = int(os.getenv("POLL_INTERVAL_SECONDS", "15"))
R2_BUCKET_DEMOS = os.getenv("R2_BUCKET_DEMOS", "csplays-gg-demos")
R2_BUCKET_CLIPS = os.getenv("R2_BUCKET_CLIPS", "csplays-gg-clips")


# ── R2 client ──────────────────────────────────────────────────────────────────

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


# ── Main loop ──────────────────────────────────────────────────────────────────

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


# ── Clip processing ────────────────────────────────────────────────────────────

def _pick_clip(supabase) -> dict | None:
    """
    Récupère un clip "pending" et le claim immédiatement (status → "rendering").
    Retourne None si la queue est vide.

    La jointure highlight → demo récupère tout ce dont on a besoin en un seul appel.
    """
    result = (
        supabase.table("clips")
        .select("*, highlight:highlights(*, demo:demos(id, storage_path, map_name))")
        .eq("status", "pending")
        .order("created_at")
        .limit(1)
        .execute()
    )
    clips = result.data or []
    if not clips:
        return None

    clip = clips[0]

    # Claim atomique : le filtre .eq("status", "pending") évite le double-claim
    # si deux instances du renderer tournent en parallèle.
    updated = (
        supabase.table("clips")
        .update({"status": "rendering", "progress": 5})
        .eq("id", clip["id"])
        .eq("status", "pending")   # guard
        .execute()
    )
    if not (updated.data or []):
        # Un autre renderer a claimé ce clip entre-temps — passer au suivant
        logger.info("Clip %s already claimed by another renderer, skipping.", clip["id"])
        return None

    logger.info(
        "Claimed clip %s  (highlight %s, type=%s)",
        clip["id"],
        clip.get("highlight_id"),
        (clip.get("highlight") or {}).get("type", "?"),
    )
    return clip


def _process_clip(clip: dict, supabase, r2) -> None:
    """Traite un clip du début à la fin. Gère les erreurs proprement."""
    clip_id   = clip["id"]
    highlight = clip.get("highlight") or {}
    demo      = highlight.get("demo") or {}

    dem_storage_path = demo.get("storage_path")
    demo_id          = demo.get("id")
    tick_start       = highlight.get("tick_start")
    tick_end         = highlight.get("tick_end")
    highlight_type   = highlight.get("type", "unknown")

    logger.info(
        "Processing clip %s — type=%s ticks[%s→%s] dem=%s",
        clip_id, highlight_type, tick_start, tick_end, dem_storage_path,
    )

    dem_path: Path | None = None
    try:
        # ── 1. Télécharge le .dem depuis R2 ──────────────────────────────────
        if not dem_storage_path:
            raise RuntimeError(
                "Impossible de rendre le clip : aucun storage_path pour la démo "
                f"(demo_id={demo_id}). Le .dem a peut-être été supprimé."
            )

        _update_clip(supabase, clip_id, progress=10)
        dem_path = _download_demo_r2(r2, dem_storage_path)
        logger.info("Downloaded .dem for clip %s → %s", clip_id, dem_path)
        _update_clip(supabase, clip_id, progress=20)

        # ── 2. Rendering CS2 headless (Step 2.3) ─────────────────────────────
        # TODO (Step 2.3) :
        #   mp4_path = _render_cs2(dem_path, tick_start, tick_end, supabase, clip_id)
        raise NotImplementedError(
            "CS2 headless rendering not yet implemented — coming in Step 2.3"
        )

        # ── 3. Upload MP4 → R2 clips bucket (Step 2.4) ───────────────────────
        # TODO (Step 2.4) :
        #   clip_key, duration_sec = _upload_clip_r2(r2, mp4_path, clip_id)
        #   _update_clip(supabase, clip_id,
        #       status="done", progress=100,
        #       storage_path=clip_key, duration_sec=duration_sec)
        #   logger.info("Clip %s done → R2 key %s", clip_id, clip_key)

        # ── 4. Cleanup .dem si plus aucun clip pending pour ce match ─────────
        # TODO (Step 2.4) :
        #   _maybe_delete_dem(r2, supabase, dem_storage_path, demo_id)

    except NotImplementedError as exc:
        # Placeholder attendu en Step 2.2 — pas un vrai crash
        logger.warning("Clip %s placeholder (step 2.3 needed): %s", clip_id, exc)
        supabase.table("clips").update(
            {
                "status": "error",
                "progress": 0,
                "error_message": str(exc),
            }
        ).eq("id", clip_id).execute()

    except Exception as exc:
        logger.exception("Error processing clip %s: %s", clip_id, exc)
        supabase.table("clips").update(
            {
                "status": "error",
                "progress": 0,
                "error_message": str(exc)[:500],
            }
        ).eq("id", clip_id).execute()

    finally:
        if dem_path and dem_path.exists():
            dem_path.unlink(missing_ok=True)
            logger.debug("Deleted temp .dem file %s", dem_path)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _update_clip(supabase, clip_id: str, **fields) -> None:
    supabase.table("clips").update(fields).eq("id", clip_id).execute()


def _download_demo_r2(r2, key: str) -> Path:
    logger.info("Downloading %s from R2 (bucket: %s)…", key, R2_BUCKET_DEMOS)
    tmp = tempfile.NamedTemporaryFile(suffix=".dem", delete=False)
    tmp.close()
    r2.download_file(R2_BUCKET_DEMOS, key, tmp.name)
    size_mb = Path(tmp.name).stat().st_size / 1024 / 1024
    logger.info("Download complete → %s (%.1f MB)", tmp.name, size_mb)
    return Path(tmp.name)


def _maybe_delete_dem(r2, supabase, dem_storage_path: str, demo_id: str) -> None:
    """
    Supprime le .dem dans R2 si tous les clips de ce match sont terminés
    (status IN ('done', 'error')) — plus aucun clip n'en a besoin.

    Appelé par le renderer après chaque clip traité (Step 2.4).
    """
    # Récupère tous les highlights de la démo
    highlights_res = (
        supabase.table("highlights")
        .select("id")
        .eq("demo_id", demo_id)
        .execute()
    )
    highlight_ids = [h["id"] for h in (highlights_res.data or [])]
    if not highlight_ids:
        # Pas de highlights → rien ne peut en avoir besoin
        _delete_demo_r2(r2, dem_storage_path)
        return

    # Vérifie si des clips sont encore en cours
    pending_res = (
        supabase.table("clips")
        .select("id")
        .in_("highlight_id", highlight_ids)
        .in_("status", ["pending", "rendering"])
        .execute()
    )
    if pending_res.data:
        logger.info(
            "Keeping .dem %s — %d clip(s) still pending/rendering.",
            dem_storage_path, len(pending_res.data),
        )
        return

    # Tous les clips sont done ou error → on peut supprimer le .dem
    _delete_demo_r2(r2, dem_storage_path)


def _delete_demo_r2(r2, key: str) -> None:
    try:
        r2.delete_object(Bucket=R2_BUCKET_DEMOS, Key=key)
        logger.info("Deleted .dem %s from R2.", key)
    except Exception as exc:
        logger.warning("Could not delete .dem %s from R2: %s", key, exc)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    main()
