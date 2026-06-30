#!/bin/bash
set -e

CS2_DIR="${CS2_DIR:-/workspace/cs2}"   # /workspace = volume persistant RunPod

# ── 1. Démarre Xvfb (display virtuel) ────────────────────────────────────────
# En cas de restart du conteneur, un lock résiduel peut subsister → on nettoie
# et on ne relance Xvfb que s'il ne tourne pas déjà.
if xdpyinfo -display :99 >/dev/null 2>&1; then
    echo "[entrypoint] Xvfb already running on :99."
else
    rm -f /tmp/.X99-lock
    echo "[entrypoint] Starting Xvfb on :99…"
    Xvfb :99 -screen 0 1280x720x24 &
    sleep 2
fi

# ── 2. Télécharge CS2 via SteamCMD (login anonyme) ───────────────────────────
# App 730 se télécharge en anonyme : aucun compte Steam ni Steam Guard requis.
# ~30 GB, stocké sur le volume persistant RunPod.
if [ ! -f "${CS2_DIR}/game/bin/linuxsteamrt64/cs2" ]; then
    echo "[entrypoint] CS2 not found — downloading via SteamCMD (anonymous)…"
    /opt/steamcmd/steamcmd.sh \
        +force_install_dir "${CS2_DIR}" \
        +login anonymous \
        +app_update 730 validate \
        +quit
    echo "[entrypoint] CS2 download complete."
else
    echo "[entrypoint] CS2 found at ${CS2_DIR}."
fi

# ── 3. Lance le renderer Python ───────────────────────────────────────────────
echo "[entrypoint] Starting renderer…"
exec python3 -u /app/renderer.py
