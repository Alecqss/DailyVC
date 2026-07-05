# Highlight.gg — Renderer worker (cible : VM GPU avec user namespaces, ex. Scaleway)
#
# ⚠️ Ne fonctionne PAS sur un conteneur qui bloque les user namespaces (ex. RunPod).
# Le client Steam moderne exige les userns (bwrap/pressure-vessel). Doit tourner sur
# une VM où on contrôle le kernel, lancée avec `docker run --privileged` (voir
# docs/scaleway-deploy.md).
#
# Couches installées ici :
#   - SteamCMD      → télécharge CS2 (app 730) en login anonyme
#   - Client Steam  → un client loggé DOIT tourner pour que CS2 (SteamAPI) démarre
#   - Xvfb          → framebuffer virtuel (CS2 a besoin d'un display)
#   - ffmpeg        → encoding TGA → MP4
#   - Python 3.11   → renderer
#
# CS2 (~63 GB) est téléchargé au 1er démarrage sur le disque persistant (pas dans l'image).

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99

# ── System deps ───────────────────────────────────────────────────────────────
RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        # SteamCMD
        lib32gcc-s1 \
        ca-certificates \
        curl \
        # Xvfb (display virtuel)
        xvfb \
        x11-utils \
        # ffmpeg
        ffmpeg \
        # Python
        python3.11 \
        python3-pip \
        python3.11-dev \
        # Utilitaires
        procps \
        # Session bus + libs requises par le client Steam
        dbus-x11 \
        libgl1 \
        libgl1:i386 \
        libstdc++6:i386 \
    && rm -rf /var/lib/apt/lists/*

# ── SteamCMD ──────────────────────────────────────────────────────────────────
RUN mkdir -p /opt/steamcmd \
    && curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" \
       | tar zxf - -C /opt/steamcmd \
    && /opt/steamcmd/steamcmd.sh +quit || true

ENV PATH="/opt/steamcmd:${PATH}"

# ── Client Steam ────────────────────────────────────────────────────────────────
# Accepte la licence en non-interactif, installe le .deb, puis neutralise
# `steamdeps` (sinon il ouvre un xterm interactif au 1er lancement, bloquant).
RUN echo "steam steam/question select 'I AGREE'" | debconf-set-selections \
    && echo "steam steam/license note ''" | debconf-set-selections \
    && apt-get update \
    && curl -sqL -o /tmp/steam.deb https://repo.steampowered.com/steam/archive/stable/steam_latest.deb \
    && apt-get install -y /tmp/steam.deb \
    && rm -f /tmp/steam.deb \
    && printf '#!/bin/sh\nexit 0\n' > /usr/bin/steamdeps \
    && chmod +x /usr/bin/steamdeps \
    && rm -rf /var/lib/apt/lists/*

# ── Utilisateur non-root (Steam refuse de tourner en root) ──────────────────────
RUN useradd -m -s /bin/bash steamuser

# ── Python deps ───────────────────────────────────────────────────────────────
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

# ── Entrypoint ────────────────────────────────────────────────────────────────
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
