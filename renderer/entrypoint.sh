#!/bin/bash
set -e

CS2_DIR="${CS2_DIR:-/opt/cs2}"
STEAM_USERNAME="${STEAM_USERNAME:-anonymous}"

# ── 1. Démarre Xvfb (display virtuel) ────────────────────────────────────────
echo "[entrypoint] Starting Xvfb on :99…"
Xvfb :99 -screen 0 1280x720x24 &
sleep 1

# ── 2. Télécharge CS2 via SteamCMD si absent ─────────────────────────────────
# CS2 App ID : 730
if [ ! -f "${CS2_DIR}/game/bin/linuxsteamrt64/cs2" ]; then
    echo "[entrypoint] CS2 not found — downloading via SteamCMD (this takes ~30 min)…"
    /opt/steamcmd/steamcmd.sh \
        +force_install_dir "${CS2_DIR}" \
        +login "${STEAM_USERNAME}" \
        +app_update 730 validate \
        +quit
    echo "[entrypoint] CS2 download complete."
else
    echo "[entrypoint] CS2 found at ${CS2_DIR}."
fi

# ── 3. Lance le renderer Python ───────────────────────────────────────────────
echo "[entrypoint] Starting renderer…"
exec python3 -u /app/renderer.py
