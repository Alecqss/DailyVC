# Highlight.gg — Renderer worker
# Base : Ubuntu 22.04 (requis pour SteamCMD + CS2 + Vulkan drivers)
#
# Couches installées ici :
#   - SteamCMD  (pour télécharger CS2 au 1er démarrage)
#   - Xvfb      (framebuffer virtuel — CS2 a besoin d'un display)
#   - ffmpeg    (encoding TGA → MP4)
#   - Python 3.11 + deps renderer
#
# CS2 (~30 GB) est téléchargé au démarrage du conteneur via un entrypoint
# (voir entrypoint.sh) pour ne pas le bake dans l'image Docker.

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
    && rm -rf /var/lib/apt/lists/*

# ── SteamCMD ──────────────────────────────────────────────────────────────────
RUN mkdir -p /opt/steamcmd \
    && curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" \
       | tar zxf - -C /opt/steamcmd \
    && /opt/steamcmd/steamcmd.sh +quit || true

ENV PATH="/opt/steamcmd:${PATH}"

# ── Python deps ───────────────────────────────────────────────────────────────
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

# ── Entrypoint ────────────────────────────────────────────────────────────────
# entrypoint.sh : démarre Xvfb, télécharge CS2 si absent, lance renderer.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
