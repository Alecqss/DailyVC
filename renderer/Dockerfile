# ─────────────────────────────────────────────────────────────────────────────
# Highlight.gg — CS2 Clip Renderer (Phase 2)
#
# Stack :
#   - Python 3.11        → boucle de polling + orchestration
#   - SteamCMD           → installera CS2 au 1er démarrage (Step 2.3)
#   - Xvfb               → framebuffer virtuel pour CS2 headless
#   - ffmpeg             → encoding TGA frames → MP4 (Step 2.4)
#
# Déploiement :
#   ⚠️  Railway n'a PAS de GPU — ce service doit tourner sur un GPU host.
#   Cibles : RunPod / Vast.ai / Lambda Labs (~$0.20–0.50/h sur GPU A100/3090)
#   Voir README.md pour les instructions de déploiement.
#
# Step 2.2 : image construite et fonctionnelle, CS2 non encore installé.
# Step 2.3 : ajout du script d'install CS2 via SteamCMD.
# ─────────────────────────────────────────────────────────────────────────────

FROM ubuntu:22.04

# Évite les prompts interactifs apt
ENV DEBIAN_FRONTEND=noninteractive

# ── Architecture i386 (requis pour SteamCMD et CS2) ─────────────────────────
RUN dpkg --add-architecture i386

# ── Dépendances système ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    # Python 3.11
    python3.11 python3.11-venv python3-pip \
    # SteamCMD — librairies 32-bit
    lib32gcc-s1 libsdl2-2.0-0:i386 \
    ca-certificates \
    # Xvfb — framebuffer virtuel pour CS2 headless
    xvfb x11-utils xauth \
    # Outils X11 supplémentaires (Step 2.3)
    libgl1-mesa-dri libglib2.0-0 \
    # ffmpeg — encoding vidéo
    ffmpeg \
    # Utilitaires réseau
    curl wget \
    # Outils divers
    procps \
    && rm -rf /var/lib/apt/lists/*

# ── SteamCMD ─────────────────────────────────────────────────────────────────
# Installé dans /opt/steamcmd. CS2 sera téléchargé dans /opt/cs2 au 1er run
# (Step 2.3 — ~30 GB, non inclus dans l'image pour ne pas exploser la taille).
RUN mkdir -p /opt/steamcmd && \
    curl -sSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz \
    | tar -xz -C /opt/steamcmd && \
    # Initialise SteamCMD une première fois pour télécharger ses dépendances
    /opt/steamcmd/steamcmd.sh +quit || true

ENV PATH="/opt/steamcmd:$PATH"

# ── Application Python ────────────────────────────────────────────────────────
WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

# ── Répertoires de travail ────────────────────────────────────────────────────
# /tmp/renders  → frames TGA temporaires par clip
# /opt/cs2      → installation CS2 (montée en volume persistant en prod)
RUN mkdir -p /tmp/renders /opt/cs2

# ── Démarrage ─────────────────────────────────────────────────────────────────
CMD ["python3", "-u", "renderer.py"]
