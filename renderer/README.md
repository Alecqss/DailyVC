# Highlight.gg — CS2 Clip Renderer

> Worker Python qui génère des clips MP4 depuis les démos CS2 en utilisant
> un rendu headless (CS2 + Xvfb + ffmpeg). Requiert un GPU dédié.

---

## ⚠️ Prérequis GPU

Railway n'a pas de GPU → ce service **ne peut pas tourner sur Railway**.

Plateformes cibles :
| Plateforme | GPU | Prix estimé |
|---|---|---|
| [RunPod](https://runpod.io) | RTX 3090 / A100 | ~$0.20–0.50/h |
| [Vast.ai](https://vast.ai) | RTX 3090 / A100 | ~$0.15–0.40/h |
| [Lambda Labs](https://lambdalabs.com) | A100 | ~$1.10/h |

---

## 🗺️ État d'avancement

| Étape | Statut | Description |
|---|---|---|
| 2.1 | ✅ Fait | DB schema + bouton "Générer" + realtime UI |
| **2.2** | ✅ **En cours** | Scaffold Docker + boucle polling |
| 2.3 | ❌ À faire | Intégration CS2 : +playdemo, capture TGA |
| 2.4 | ❌ À faire | Encoding ffmpeg TGA→MP4 + upload R2 |
| 2.5 | ❌ À faire | Déploiement GPU host |

---

## 🚀 Déploiement (Step 2.5)

### RunPod

1. Créer un **Pod** avec GPU (RTX 3090 ou mieux)
2. Choisir **Custom Docker Image** → `ghcr.io/alecqss/dailyvc-renderer:latest`
3. Monter un volume persistant `/opt/cs2` (pour CS2 ~30 GB)
4. Configurer les variables d'environnement (voir ci-dessous)
5. Démarrer

### Variables d'environnement requises

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
R2_ACCOUNT_ID=<32-char hex hash>
R2_ACCESS_KEY_ID=<clé API R2>
R2_SECRET_ACCESS_KEY=<secret R2>
R2_BUCKET_DEMOS=csplays-gg-demos
R2_BUCKET_CLIPS=csplays-gg-clips
POLL_INTERVAL_SECONDS=15
```

---

## 🏗️ Architecture interne

```
renderer.py
│
├── _pick_clip()          → poll Supabase, claim atomique (pending → rendering)
│
└── _process_clip()
    ├── _download_demo_r2()       → télécharge le .dem
    ├── _render_cs2()             → (TODO 2.3) CS2 headless + Xvfb + TGA capture
    ├── _encode_ffmpeg()          → (TODO 2.4) TGA frames → MP4
    ├── _upload_clip_r2()         → (TODO 2.4) upload MP4 → R2 csplays-gg-clips
    └── _maybe_delete_dem()       → supprime le .dem si tous les clips du match sont finis
```

### Séquence de rendu CS2 (Step 2.3)

```
Xvfb :99 -screen 0 1920x1080x24 &
cs2 -display :99 \
    -novid -fullscreen \
    +map cs_office \
    +playdemo /path/to/match.dem \
    +demo_goto <tick_start> \
    +demo_setspeed 1.0 \
    +startmovie /tmp/renders/<clip_id> tga \
    +demo_goto <tick_end> \
    +stopmovie \
    +quit
ffmpeg -framerate 64 -i /tmp/renders/<clip_id>%05d.tga -c:v libx264 -preset fast output.mp4
```

---

## 📝 Notes techniques

- **CS2 + Vulkan** : Source 2 utilise Vulkan → **GPU réel obligatoire**
  (lavapipe/llvmpipe = rendu logiciel = inutilisable pour 64 fps)
- **CS2 installation** : ~30 GB → à monter en volume persistant (pas dans l'image Docker)
- **Steam authentification** : CS2 peut nécessiter un compte Steam connecté
  pour `+playdemo` (à tester — potentiel blocage VAC)
- **ToS Steam** : vérifier les conditions d'usage commercial avant production
