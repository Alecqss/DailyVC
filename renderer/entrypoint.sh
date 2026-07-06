#!/bin/bash
set -e

# ── Highlight.gg renderer — entrypoint (VM GPU à user namespaces, ex. Scaleway) ──
#
# Encode la recette découverte en session 6 pour faire tourner le CLIENT CS2 headless :
#   1. Active les user namespaces (bwrap/pressure-vessel en ont besoin)
#   2. Démarre Xvfb (display virtuel :99)
#   3. Télécharge CS2 (app 730) en login ANONYME si absent
#   4. Lance un CLIENT Steam loggé (compte dédié) en arrière-plan — CS2 exige
#      un Steam qui tourne et est connecté pour que SteamAPI_Init réussisse
#   5. Attend le login, puis lance le renderer (qui lancera le binaire cs2 brut)
#
# ⚠️ Doit tourner dans un conteneur PRIVILÉGIÉ sur une VM (docker run --privileged).

CS2_DIR="${CS2_DIR:-/data/cs2}"
STEAM_USERNAME="${STEAM_USERNAME:?STEAM_USERNAME manquant}"
STEAM_PASSWORD="${STEAM_PASSWORD:?STEAM_PASSWORD manquant}"
STEAM_LOGIN_TIMEOUT="${STEAM_LOGIN_TIMEOUT:-180}"

export XDG_RUNTIME_DIR=/tmp/xdg
LIB_DIR="${CS2_DIR}/game/bin/linuxsteamrt64"

log() { echo "[entrypoint] $*"; }

# ── 1. User namespaces (best effort : on est censé être --privileged sur la VM) ──
sysctl -w kernel.unprivileged_userns_clone=1 >/dev/null 2>&1 || \
    log "WARN: impossible d'activer unprivileged_userns_clone (déjà actif ? pas --privileged ?)"

# ── 2. Xvfb (idempotent) ────────────────────────────────────────────────────────
if xdpyinfo -display :99 >/dev/null 2>&1; then
    log "Xvfb déjà actif sur :99."
else
    rm -f /tmp/.X99-lock
    log "Démarrage de Xvfb sur :99…"
    Xvfb :99 -screen 0 1920x1080x24 &
    sleep 2
fi

# ── 3. Préparatifs steamuser + steamclient.so (requis par SteamAPI de CS2) ───────
mkdir -p "$XDG_RUNTIME_DIR" && chmod 777 "$XDG_RUNTIME_DIR"
mkdir -p /home/steamuser/.steam/sdk64
ln -sf /opt/steamcmd/linux64/steamclient.so /home/steamuser/.steam/sdk64/steamclient.so

# ── 4. Télécharge CS2 (anonyme) si absent ────────────────────────────────────────
if [ ! -f "${LIB_DIR}/cs2" ]; then
    log "CS2 absent — téléchargement via SteamCMD (anonyme, ~63 GB)…"
    /opt/steamcmd/steamcmd.sh \
        +force_install_dir "${CS2_DIR}" \
        +login anonymous \
        +app_update 730 validate \
        +quit
    log "Téléchargement CS2 terminé."
else
    log "CS2 présent dans ${CS2_DIR}."
fi

# Le client Steam et le renderer tournent en steamuser → accès aux fichiers CS2.
chown -R steamuser:steamuser "$CS2_DIR" 2>/dev/null || chmod -R a+rwX "$CS2_DIR" || true
chown -R steamuser:steamuser /home/steamuser 2>/dev/null || true

# ── 5. Lance le client Steam loggé en arrière-plan ───────────────────────────────
log "Démarrage du client Steam (compte ${STEAM_USERNAME})…"
STEAM_LOG=/home/steamuser/steam.log
rm -f "$STEAM_LOG"
su steamuser -c "DISPLAY=:99 XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR dbus-launch steam -silent -no-cef-sandbox -login '$STEAM_USERNAME' '$STEAM_PASSWORD' > '$STEAM_LOG' 2>&1 &"

# Attend un marqueur de login réussi dans les logs de connexion Steam.
CONN_LOG=/home/steamuser/.local/share/Steam/logs/connection_log.txt
log "Attente du login Steam (timeout ${STEAM_LOGIN_TIMEOUT}s)…"
deadline=$(( $(date +%s) + STEAM_LOGIN_TIMEOUT ))
logged_in=0
while [ "$(date +%s)" -lt "$deadline" ]; do
    if grep -qiE "Logon success|Assigned client|Logged On" "$CONN_LOG" 2>/dev/null; then
        logged_in=1
        break
    fi
    sleep 5
done
if [ "$logged_in" = "1" ]; then
    log "Client Steam connecté ✅"
else
    log "WARN: login Steam non confirmé après ${STEAM_LOGIN_TIMEOUT}s — on continue (à valider dans les logs)."
fi

# ── 6. Lance le renderer (en steamuser, avec l'env CS2/Steam) ────────────────────
log "Démarrage du renderer…"
exec su steamuser -c "DISPLAY=:99 XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR LD_LIBRARY_PATH=$LIB_DIR CS2_DIR=$CS2_DIR python3 -u /app/renderer.py"
