# Déploiement du renderer sur RunPod

## Prérequis

- Compte RunPod (runpod.io)
- Compte Steam dédié avec **Steam Guard désactivé** (Settings → Account → Steam Guard)
- Docker installé localement pour build + push l'image
- Compte Docker Hub (ou autre registry)

---

## Étape 1 — Build et push de l'image Docker

```bash
# Depuis la racine du repo
docker build -t ton-dockerhub/highlightgg-renderer:latest ./renderer

docker push ton-dockerhub/highlightgg-renderer:latest
```

> L'image fait ~2 GB (Ubuntu + SteamCMD + Xvfb + ffmpeg + Python).
> CS2 (~30 GB) est téléchargé au premier démarrage sur le volume persistant.

---

## Étape 2 — Créer un volume persistant sur RunPod

CS2 fait ~30 GB et met ~30 min à télécharger. On le stocke sur un volume persistant
pour ne pas le re-télécharger à chaque redémarrage du pod.

1. RunPod → **Storage** → **New Network Volume**
2. Nom : `cs2-install`
3. Taille : **40 GB** (CS2 + marge)
4. Région : choisir la même que le pod (ex: EU-RO-1)

---

## Étape 3 — Créer le pod RunPod

1. RunPod → **Pods** → **+ New Pod**
2. **GPU** : RTX 3080/3090 ou RTX 4090 (CS2 Vulkan a besoin d'un vrai GPU)
3. **Container Image** : `ton-dockerhub/highlightgg-renderer:latest`
4. **Container Disk** : 10 GB (logs, tmp)
5. **Volume** : attacher `cs2-install` → **Mount Path : `/workspace`**
6. **Expose HTTP ports** : laisser vide (le renderer ne sert pas de HTTP)

---

## Étape 4 — Variables d'environnement

Dans **Edit Pod → Environment Variables**, ajouter :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | URL Supabase (ex: `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role JWT (commence par `eyJ`) |
| `R2_ACCOUNT_ID` | `cd927c02767137b993fc0d51fc73682a` |
| `R2_ACCESS_KEY_ID` | Clé API R2 |
| `R2_SECRET_ACCESS_KEY` | Secret R2 |
| `R2_BUCKET_DEMOS` | `csplays-gg-demos` |
| `R2_BUCKET_CLIPS` | `csplays-gg-clips` |
| `STEAM_USERNAME` | Compte Steam dédié |
| `STEAM_PASSWORD` | Mot de passe Steam dédié |
| `CS2_DIR` | `/workspace/cs2` |

---

## Étape 5 — Premier démarrage

Au premier lancement, le renderer va :
1. Démarrer Xvfb
2. Télécharger CS2 via SteamCMD (~30 min, ~30 GB sur `/workspace/cs2`)
3. Démarrer la boucle de polling

Pour suivre les logs en live : **Pod → Logs** dans le dashboard RunPod.

```
[entrypoint] Starting Xvfb on :99…
[entrypoint] CS2 not found — downloading via SteamCMD (~30 min first run)…
...
[entrypoint] CS2 download complete.
[entrypoint] Starting renderer…
2026-XX-XX [INFO] renderer — Renderer started. Polling every 10s.
```

Les redémarrages suivants sautent le téléchargement CS2 (volume persistant).

---

## Coûts estimés

| Usage | Coût |
|---|---|
| RTX 3090 on-demand | ~$0.44/h |
| RTX 3080 on-demand | ~$0.34/h |
| Volume 40 GB | ~$0.07/h |
| **Total actif** | **~$0.40-0.51/h** |

Pour économiser : éteindre le pod quand la queue est vide. Le volume persistant conserve CS2.

---

## Dépannage

**CS2 crash au démarrage**
→ Vérifier que le GPU est bien détecté : `nvidia-smi` dans le terminal RunPod.
→ CS2 Source 2 nécessite Vulkan — ne fonctionne pas sur GPU virtuel/CPU.

**Steam Guard bloque le login**
→ Se connecter sur store.steampowered.com avec le compte dédié et désactiver Steam Guard dans les paramètres du compte.

**Aucune frame TGA générée**
→ Vérifier `DISPLAY=:99` dans les logs. Xvfb doit tourner avant CS2.
→ Augmenter `CS2_CAPTURE_TIMEOUT` si le clip est long.

**Upload R2 échoue**
→ Vérifier que le bucket `csplays-gg-clips` existe et que les credentials R2 sont corrects.
