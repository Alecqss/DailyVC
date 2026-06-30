#!/bin/bash
set -e

CS2_DIR="${CS2_DIR:-/workspace/cs2}"   # /workspace = volume persistant RunPod
STEAM_USERNAME="${STEAM_USERNAME:?Variable STEAM_USERNAME manquante}"
STEAM_PASSWORD="${STEAM_PASSWORD:?Variable STEAM_PASSWORD manquante}"

# ── 1. Démarre Xvfb (display virtuel) ────────────────────────────────────────
echo "[entrypoint] Starting Xvfb on :99…"
Xvfb :99 -screen 0 1280x720x24 &
sleep 1

# ── 2. Télécharge CS2 via SteamCMD si absent ─────────────────────────────────
# CS2 App ID : 730 — ~30 GB, stocké sur le volume persistant RunPod.
# Steam Guard doit être DÉSACTIVÉ sur le compte dédié (impossible interactif en Docker).
if [ ! -f "${CS2_DIR}/game/bin/linuxsteamrt64/cs2" ]; then
    echo "[entrypoint] CS2 not found — downloading via SteamCMD (~30 min first run)…"
    /opt/steamcmd/steamcmd.sh \
        +force_install_dir "${CS2_DIR}" \
        +login "${STEAM_USERNAME}" "${STEAM_PASSWORD}" \
        +app_update 730 validate \
        +quit
    echo "[entrypoint] CS2 download complete."
else
    echo "[entrypoint] CS2 found at ${CS2_DIR}."
fi

# ── 3. Lance le renderer Python ───────────────────────────────────────────────
echo "[entrypoint] Starting renderer…"
exec python3 -u /app/renderer.py
