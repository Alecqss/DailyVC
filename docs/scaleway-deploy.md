# Déploiement du renderer sur une VM GPU Scaleway

> **Pourquoi une VM et pas RunPod** : le client Steam moderne exige les *user
> namespaces* (bwrap/pressure-vessel). RunPod (et tout conteneur non-privilégié)
> les bloque au niveau kernel. Sur une VM on contrôle le kernel → on lance le
> conteneur en `--privileged` et Steam/CS2 fonctionnent. Voir `CONTEXT.md` pour
> l'historique du diagnostic (session 6).

---

## Prérequis
- Compte Scaleway
- Compte Steam dédié `csplaysgg` (Steam Guard **email désactivé**)
- L'image renderer publiée sur GHCR : `ghcr.io/alecqss/highlightgg-renderer:latest`

---

## Étape 1 — Créer l'instance GPU

Scaleway Console → **GPU** → **Create instance** :
- **Type** : instance **L4** (ex. `L4-1-24G`) — GPU Ada Lovelace, Vulkan OK.
  Éviter la gamme `RENDER-S` (Tesla P100, trop vieille).
- **Image** : *Ubuntu ML / GPU OS* (drivers NVIDIA + Docker + nvidia-container-toolkit préinstallés).
- **Zone** : `fr-par` (Paris) — proche de R2/Supabase (Europe de l'Ouest).
- **Block Storage** : ajouter un volume **~80 GB** (CS2 fait ~63 GB) → il servira de disque persistant CS2.

---

## Étape 2 — Préparer le disque persistant

En SSH sur la VM, monte le volume additionnel sur `/data` (adapter le device, ex. `/dev/sdb`) :

```bash
sudo mkfs.ext4 -F /dev/sdb           # UNE seule fois (efface le volume)
sudo mkdir -p /data
sudo mount /dev/sdb /data
echo '/dev/sdb /data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
```

Vérifie que le GPU est vu par Docker :
```bash
sudo docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```

---

## Étape 3 — Lancer le renderer

Crée `/data/renderer.env` avec tes variables (voir `renderer/.env.example`) :

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
R2_ACCOUNT_ID=cd927c02767137b993fc0d51fc73682a
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_DEMOS=csplays-gg-demos
R2_BUCKET_CLIPS=csplays-gg-clips
STEAM_USERNAME=csplaysgg
STEAM_PASSWORD=...
CS2_DIR=/data/cs2
```

Puis lance le conteneur (**`--privileged` obligatoire** pour les user namespaces) :

```bash
sudo docker run -d --name renderer \
  --gpus all \
  --privileged \
  --env-file /data/renderer.env \
  -v /data:/data \
  --restart unless-stopped \
  ghcr.io/alecqss/highlightgg-renderer:latest
```

Suivre les logs :
```bash
sudo docker logs -f renderer
```

Au 1er démarrage : Xvfb → téléchargement CS2 (~63 GB, long) → client Steam se logge → renderer poll Supabase.

---

## Étape 4 — ⚠️ Validation du premier run (à faire en live)

Le bloc « attente du login Steam » de l'entrypoint **n'a pas encore été validé de bout en bout** (on a buté sur les namespaces RunPod avant d'y arriver). Pour le 1er run, valider pas à pas dans le conteneur :

```bash
# 1. Le client Steam s'est-il loggé ?
sudo docker exec renderer tail -30 /home/steamuser/.local/share/Steam/logs/connection_log.txt

# 2. steamwebhelper tourne-t-il (preuve que les namespaces marchent) ?
sudo docker exec renderer bash -c "ps aux | grep -i steamwebhelper | grep -v grep"

# 3. Génère un clip depuis le frontend, puis regarde le renderer :
sudo docker logs --tail 50 renderer
```

Si un rendu échoue, le log CS2 complet est dans le work_dir temporaire du clip (chemin indiqué dans l'erreur `CS2 n'a produit aucune frame TGA`) — c'est là qu'on verra la cause exacte.

---

## Mettre à jour le renderer
1. Merger sur `master` (change dans `renderer/`) → CI rebuild `:latest` sur GHCR
2. Sur la VM :
```bash
sudo docker pull ghcr.io/alecqss/highlightgg-renderer:latest
sudo docker rm -f renderer && sudo docker run -d ... (même commande qu'étape 3)
```
CS2 reste sur `/data` → pas de re-téléchargement.

---

## Coûts
- Instance L4 Scaleway : ~€0.75–1/h (à vérifier sur la grille Scaleway)
- Block Storage 80 GB : quelques €/mois
- **Éteindre l'instance quand la file est vide** pour ne payer que l'usage. Le volume `/data` (donc CS2) persiste.

---

## Dépannage
- **`bwrap: Operation not permitted` / zenity "user namespaces"** → le conteneur n'est pas `--privileged`, ou `kernel.unprivileged_userns_clone` désactivé sur l'hôte (`sudo sysctl -w kernel.unprivileged_userns_clone=1`).
- **`Cannot run as root`** → normal, l'entrypoint lance Steam en `steamuser` ; ne pas contourner.
- **CS2 : 0 frame** → vérifier que le client Steam est bien loggé (étape 4) ; sans Steam loggé, `SteamAPI_Init` échoue et CS2 reste bloqué.
- **GPU absent** (`nvidia-smi` KO dans le conteneur) → vérifier `--gpus all` + nvidia-container-toolkit sur la VM.
