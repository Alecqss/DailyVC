# Highlight.gg — Contexte du projet (pour futures sessions)

> Ce document capture les décisions techniques, l'historique des sessions et les pièges à éviter.
> À lire en début de session pour reprendre le contexte rapidement.

---

## 🎯 C'est quoi le projet

**Highlight.gg** — Application web qui détecte et génère des highlights CS2 depuis des fichiers `.dem`.

1. L'utilisateur upload son fichier `.dem` via le frontend
2. Le fichier va dans **Cloudflare R2** (pas Supabase Storage — trop limité)
3. Le worker Python détecte les highlights (multi-kills, clutchs, knife)
4. Le worker **supprime le `.dem`** de R2 après traitement
5. Le frontend affiche les résultats en temps réel via Supabase Realtime
6. (Phase 2) Des clips MP4 sont générés et stockés dans R2

---

## 🗂️ Structure du repo

```
DailyVC/
├── src/                          # Frontend Next.js 16 (App Router)
│   ├── app/
│   │   ├── api/upload-url/       # ← À CRÉER : route API pour URL pré-signée R2
│   │   ├── page.tsx + home-content.tsx
│   │   ├── dashboard/
│   │   ├── upload/               # upload-content.tsx ← À MODIFIER pour R2
│   │   ├── match/[id]/
│   │   ├── clips/
│   │   ├── share/[token]/
│   │   └── settings/
│   ├── components/
│   └── lib/                      # supabase.ts, supabase-realtime.ts, types.ts
├── worker/                       # Service Python (Railway "captivating-embrace")
│   ├── worker.py                 # ← À MODIFIER pour download/delete R2
│   ├── supabase_client.py
│   ├── parser/highlight_detector.py
│   ├── Dockerfile
│   ├── railway.toml
│   └── requirements.txt          # ← Ajouter boto3
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql       # Référence schéma (déjà appliqué)
│       └── 002_fix_ace_type.sql  # ⚠️ À APPLIQUER si pas encore fait
├── railway.toml                  # Config Railway frontend
├── pnpm-workspace.yaml           # packages: ['.'] — ne pas retirer
├── status.md
└── CONTEXT.md
```

---

## 🚀 Services déployés

| Service | Plateforme | Nom | État |
|---|---|---|---|
| Frontend Next.js | **Vercel** | DailyVC | ✅ En ligne |
| ~~Frontend Next.js~~ | ~~Railway~~ | ~~DailyVC~~ | **supprimé** (doublon) |
| Worker Python | Railway | `captivating-embrace` | ✅ Poll toutes les 10s |
| Base de données | Supabase | — | ✅ Opérationnel |
| Storage démos | Cloudflare R2 | `csplays-gg-demos` | ✅ Opérationnel |
| Storage clips | Cloudflare R2 | à créer (Phase 2) | ❌ Phase 2 |

---

## 🏛️ Décisions d'architecture

### Pourquoi Cloudflare R2 pour le storage (et pas Supabase Storage)

**Problème découvert :** Supabase Storage limite les uploads à **50 MB sur le free tier**. Les démos CS2 font ~400 MB → upload impossible.

**Calcul de charge pour un joueur actif :**
- 8-10 games/jour × ~400 MB = ~4 GB/jour de démos
- 8-10 games/jour × 10 clips × ~10 MB = ~1 GB/jour de clips MP4

**Pourquoi R2 :**
- ✅ Pas de limite de taille de fichier
- ✅ **Egress gratuit** (critique : le worker télécharge des démos, les utilisateurs lisent des clips)
- ✅ 10 GB gratuits, $0.015/GB après
- ✅ Compatible S3 (boto3 dans le worker)

**Stratégie stockage démos :** supprimer le `.dem` dès que le worker termine → stockage en rotation, jamais plus de quelques GB simultanément.

### Architecture upload (sécurité)

Le navigateur ne peut pas avoir les credentials R2 directement. Le flux est :
1. Frontend appelle `POST /api/upload-url` (route Next.js serveur)
2. La route génère une **URL pré-signée PUT** valable 1h
3. Le navigateur upload directement vers R2 avec cette URL
4. Frontend insère la row `demos` dans Supabase avec le `storage_path` (= clé R2)

Les credentials R2 restent côté serveur uniquement (variables Railway).

### Phase 2 — Génération vidéo : Option A choisie

**Décidé en session 4 :** on part sur **Option A — CS2 headless rendering**.
- Stack : SteamCMD + CS2 + Xvfb + ffmpeg dans une image Docker
- Host : GPU obligatoire (Railway n'a pas de GPU) → RunPod / Vast.ai / Lambda Labs (~$0.20-0.50/h)
- Coût récurrent estimé : $50-300/mois selon usage
- Pas d'outil officiel headless pour CS2 (contrairement à HLAE pour CS:GO) → développement custom

**Plan en 5 étapes incrémentales :**
1. **2.1** ✅ (session 4) — Fondation : DB schema + bouton "Générer" + état realtime
2. **2.2** ✅ (session 5) — Renderer worker scaffold : Dockerfile (SteamCMD + Xvfb + ffmpeg) + boucle polling
3. **2.3** ✅ (session 5) — CS2 headless render : `cs2_capture.py` (`render.cfg`, `spec_lock_to_accountid`, comptage frames, subprocess + timeout)
4. **2.4** ✅ (session 5) — ffmpeg_encode.py (concat demuxer, H.264 + faststart), bucket R2 `csplays-gg-clips` créé, frontend `getClipUrl()` branché
5. **2.5** ✅ (session 5) — CI GitHub Actions build l'image → GHCR (`ghcr.io/alecqss/highlightgg-renderer:latest`, package public). Compte Steam dédié créé, Steam Guard désactivé. **Reste : créer le pod RunPod manuellement** (voir `docs/runpod-deploy.md`)

**Architecture du renderer :**
- Séparé du worker actuel (qui reste sur Railway pour le parsing)
- Polling Supabase : `clips.status='pending'` → claim atomique → render → `status='done'`
- Le `.dem` est conservé dans R2 (worker ne supprime plus) — cleanup différé après rendu prévu en 2.5
- Caméra POV 1ère personne via `spec_lock_to_accountid <accountid>` + `spec_mode 4` — nécessite `player_steamid` sur `highlights`
- `CS2_CMD` et cvars (`CS2_DIR`, `CS2_CFG_DIR`, `CS2_FPS`, etc.) pilotables par variables d'env → ajustables sur le host GPU sans changer le code
- Image buildée par CI (GitHub Actions → GHCR) à chaque merge touchant `renderer/` — pas de Docker local nécessaire
- **Déploiement (révisé session 6) : VM GPU Scaleway (L4, fr-par), conteneur `--privileged`.** RunPod abandonné — voir pièges ci-dessous. Le binaire `cs2` est lancé BRUT (pas `cs2.sh`) + un client Steam loggé tourne en fond.

### Pièges potentiels Option A (à anticiper)
- Source 2 Vulkan ne marche pas sur lavapipe/llvmpipe (rendu logiciel inutilisable) → vrai GPU requis
- ToS Steam à vérifier pour usage commercial

### 🧱 Leçons du déploiement (session 6) — RUNPOD ABANDONNÉ
Longue session de debug live sur RunPod. Murs franchis un par un, puis mur final infranchissable :
1. **CS2 (app 730) se télécharge en `+login anonymous`** — pas besoin de compte pour le download (~63 GB, pas 30). Le build contient bien le rendu client (`librendersystemvulkan.so` présent).
2. **Lancer `cs2.sh` échoue** : il exige le runtime "sniper" (bwrap). Le **binaire `cs2` brut** se lance sans ce garde-fou → c'est lui qu'on lance.
3. Le binaire brut a besoin de : `LD_LIBRARY_PATH=<cs2>/game/bin/linuxsteamrt64`, `steamclient.so` (symlink `~/.steam/sdk64/`), `XDG_RUNTIME_DIR`.
4. **MAIS CS2 (client) exige un CLIENT Steam loggé qui tourne** (sinon `SteamAPI_Init` échoue et CS2 se fige — 0 frame). SteamCMD ne suffit pas.
5. Faire tourner le client Steam a demandé : user non-root (`steamuser`), `dbus-x11`, libs i386, neutraliser `steamdeps` interactif… **puis mur final : le client Steam exige les USER NAMESPACES** (bwrap/pressure-vessel pour `steamwebhelper`). **RunPod les bloque au niveau kernel** → impossible dans un conteneur RunPod.
6. **Conclusion : il faut une VM (kernel contrôlé) + conteneur `--privileged`.** Tout le code (renderer, capture, ffmpeg) reste valable ; seul l'hébergement change. **Point encore NON validé** : que `startmovie` produise réellement des frames une fois Steam loggé (à confirmer sur la VM Scaleway).

### Steam Guard (rappel)
Désactiver l'authentificateur mobile ≠ désactiver le Steam Guard email. Pour un login SteamCMD/compte non-interactif il faut désactiver le Steam Guard **email** aussi. (Contourné pour le download via `anonymous`, mais le client a besoin du compte `csplaysgg`.)

### 🖥️ VM Scaleway déployée (session 7, en cours)
- Instance : `scw-pedantic-fermi`, type `L4-1-24G`, zone `fr-par-1`, image **"Ubuntu Noble GPU OS 13 (Nvidia) passthrough"**, IP `51.15.195.123`, disque système 125 Go (suffisant, CS2 fait ~63 Go — pas besoin de second volume).
- Docker déjà configuré avec `Default Runtime: nvidia` sur cette image — pas d'install manuelle du toolkit nécessaire.
- Le login Steam client **fonctionne** sur cette VM (contrairement à RunPod) : `docker run --privileged --gpus all` suffit à débloquer les user namespaces → `steamwebhelper` tourne, `[entrypoint] Client Steam connecté ✅` confirmé dans les logs.

### 🧱 NOUVEAU mur trouvé + résolu (session 7) : Vulkan absent sur l'image GPU Scaleway
Une fois le client Steam loggé, CS2 se lançait mais échouait avec une popup (`zenity --title "Unable To Start Game" --text "Failed to initialize Vulkan..."`). Cette popup elle-même plantait à cause d'un conflit `libpangocairo` (piste qui a fait perdre du temps), mais **le vrai problème était en amont** :

- L'image Scaleway **"GPU OS Passthrough"** installe `nvidia-headless-580-server-open` — un driver **compute-only** (CUDA/NVML), **sans aucune lib graphique** (`libnvidia-gl-*` absent → pas de GLX, pas d'EGL, pas d'ICD Vulkan). Logique pour une image pensée IA/compute, mais bloquant pour du rendu.
- **Fix appliqué sur l'HÔTE** (pas dans le conteneur) :
  ```bash
  apt-get install -y libnvidia-gl-580-server
  reboot   # nécessaire : sinon "NVML: Driver/library version mismatch"
  ```
- Après reboot, `nvidia-ctk cdi generate` monte correctement les libs graphiques + `nvidia_icd.json` dans les conteneurs `--gpus all --privileged`.
- **Piège de diagnostic** : l'ICD Vulkan est monté par le toolkit dans **`/etc/vulkan/icd.d/nvidia_icd.json`**, PAS dans `/usr/share/vulkan/icd.d/` (qui reste vide/absent côté conteneur). Vérifier le bon chemin sinon on croit que rien n'est monté alors que si.
- Une fois ce fix posé : **CS2 dépasse l'init Vulkan sans erreur** et charge tout le moteur (materialsystem2, worldrenderer, scenesystem, particles...). La popup zenity/pango n'apparaît plus (c'était une conséquence de l'échec Vulkan, pas un problème indépendant).

### 🎬 Capture des clips : x11grab, PAS startmovie (session 8 — décision structurante)
- **`startmovie` n'existe pas dans le binaire Linux de CS2** (vérifié : `find startmovie` → "no results" via netcon). Aucune commande de rendu offline alternative. Ne pas re-tenter.
- La capture est faite en **temps réel** : `ffmpeg -f x11grab` sur le display Xvfb pendant la lecture, encodage **NVENC** (`h264_nvenc`) sur le GPU. Alternative Windows/HLAE écartée (coût, provider, maintenance) tant que la qualité suffit.
- **Pièges associés (tous rencontrés et corrigés)** :
  - `-netconport` : ne JAMAIS utiliser le port 29000 (port par défaut de VConsole2, protocole binaire — collision silencieuse). On utilise 47201. Protocole = texte brut + `\n`.
  - `demo_gototick` attend des **ticks de démo** ; le parser fournit des **game ticks** (offset = début d'enregistrement, ~12094 sur les démos MM). L'offset est lu dans la réponse `skipping to demo tick X (game tick Y)` puis corrigé par re-seek.
  - Le `LD_LIBRARY_PATH` des libs CS2 casse le ffmpeg système (libav* embarquées par CS2) → env nettoyé pour tout subprocess ffmpeg/ffprobe.
  - Sur l'HÔTE, le driver headless Scaleway n'a ni les libs GL (session 7) **ni libnvidia-encode** (session 8) : `apt-get install libnvidia-gl-580-server libnvidia-encode-580-server`.
  - Le token R2 doit couvrir les DEUX buckets (`csplays-gg-demos` + `csplays-gg-clips`).
- Détection multikills (worker) : kills du même joueur découpés en **rafales** (gap max 15 s entre kills consécutifs) — sinon 2 kills aux extrémités d'un round comptaient comme un 2K.

### ⚠️ Obstacle suivant (résolu en session 8 — conservé pour l'historique, session 7)
CS2 avance plus loin mais un nouveau dlopen échoue : `libavresample.so.4: cannot open shared object file`. Cette lib **est bien présente** dans `/data/cs2/game/bin/linuxsteamrt64/` (embarquée par CS2 lui-même — ffmpeg l'a retirée des dépôts Ubuntu récents, remplacée par `libswresample`), mais le loader ne la trouve pas sans `LD_LIBRARY_PATH` explicite pour ce dlopen à la volée (RPATH du binaire principal ne suffit pas pour les libs chargées dynamiquement par un module comme `libpanoramauiclient.so`).
- **Test en cours** : relancer avec `LD_LIBRARY_PATH=/data/cs2/game/bin/linuxsteamrt64` explicite.
- **Point de vigilance** : c'est cette même variable qui avait été ajoutée puis **retirée** dans `renderer/cs2_capture.py` (session 6) en pensant qu'elle causait le crash zenity/pango — en réalité, ce crash était consécutif à l'échec Vulkan (résolu ci-dessus), pas causé par `LD_LIBRARY_PATH`. Il faudra très probablement **la remettre** dans le code une fois le test manuel validé.

### 📝 TODO code une fois le rendu confirmé (session 7)
1. `renderer/cs2_capture.py` : remettre `LD_LIBRARY_PATH = CS2_LIB_DIR` dans l'env de lancement de `cs2`
2. `renderer/Dockerfile` : ajouter `libvulkan1` (et vérifier `mesa-vulkan-drivers` n'est pas nécessaire côté conteneur puisque l'ICD vient de l'hôte via CDI)
3. `docs/scaleway-deploy.md` : ajouter l'étape obligatoire `apt-get install libnvidia-gl-<version>-server` + `reboot` sur l'hôte avant le premier `docker run`
4. Vérifier si `libpangoft2-1.0.so` a aussi besoin d'être résolu (a eu un fallback réussi dans les logs, donc probablement pas bloquant)

---

## ⚠️ Pièges connus

### 1. `highlights.type` — contrainte CHECK mal initialisée
Migration 001 utilisait `'ace'`, tout le code utilise `'multikill_ace'`.
→ **Appliquer `002_fix_ace_type.sql`** avant tout test complet.

### 2. `pnpm-workspace.yaml` — champ `packages` obligatoire
Sans `packages: ['.']`, Railway échoue au build. Ne jamais le retirer.

### 3. Worker — `SUPABASE_SERVICE_ROLE_KEY` ≠ `anon key`
La clé `service_role` bypass le RLS. Elle est dans Supabase → Settings → API → **Project API keys** (pas "Secret keys").
Elle commence par `eyJ...` (JWT). La "Secret key" (`sb_secret_...`) est pour la Management API, pas pour le worker.

### 4. `demoparser2` version `0.41.x`
La lib est versionnée `0.x.x`. Ne pas mettre `>=4.x.x` (n'existe pas sur PyPI).

### 5. Worker variable `SUPABASE_URL` (pas `NEXT_PUBLIC_SUPABASE_URL`)
Le worker n'est pas Next.js. Sa variable s'appelle `SUPABASE_URL` sans préfixe.

### 6. Branches Claude Code
Les sessions créent des branches `claude/xxx-yyy-ZZZZ`. Toujours merger dans `master`.

---

## 📦 Schéma Supabase

### Tables
| Table | Colonnes clés |
|---|---|
| `profiles` | `id` (= auth.users.id), `cs2_username`, `notify_email` |
| `demos` | `id`, `user_id`, `storage_path` (clé R2), `status`, `progress`, `action_types[]`, `pre_seconds`, `post_seconds` |
| `highlights` | `id`, `demo_id`, `type`, `tick_start`, `tick_end`, `round`, `kills` |
| `clips` | `id`, `highlight_id`, `user_id`, `storage_path` (clé R2, **nullable**), `share_token`, `is_public`, `duration_sec` (nullable), **`status` (pending/rendering/done/error)**, **`progress` 0-100**, **`error_message`** |
| `highlights` | + **`player_steamid`** (text, nullable) — steamid64 du joueur à filmer (migration 004) |

### Types de highlights valides
```
multikill_2k, multikill_3k, multikill_4k, multikill_ace
clutch_1v1, clutch_1v2, clutch_1v3, clutch_1v4, clutch_1v5
knife
```

---

## 🔄 Historique des sessions

### Session — 2026-05-24 (soir)
**Réalisations :**
- Fix build Railway frontend (`pnpm-workspace.yaml` + `railway.toml`)
- Worker Python créé (`worker/`) avec parsing CS2 via `demoparser2`
- Migrations SQL de référence + fix `002_fix_ace_type.sql`
- Service Railway `captivating-embrace` configuré
- Fix version `demoparser2` (`4.3.0` → `0.41.0`)

**PRs mergées :** #4, #5, #6, #7

---

### Session — 2026-05-25 (matin)
**Réalisations :**
- Worker opérationnel : démarre, poll Supabase toutes les 10s ✅
- Découverte limite Supabase Storage 50 MB → bloque upload démos (~400 MB)
- Décision : migrer storage vers **Cloudflare R2** (démos + clips)

### Session — 2026-05-25 (journée)
**Réalisations :**
- Migration upload → Cloudflare R2 (bucket `csplays-gg-demos`)
  - API route `/api/upload-url` (URL pré-signée, auth JWT)
  - Upload direct navigateur → R2, barre de progression
  - Worker : download + delete depuis R2 avec boto3
- Architecture clarifiée : **Vercel = frontend**, Railway = worker only
- Railway "DailyVC" (frontend doublon) → supprimé
- CLAUDE.md + docs/sessions.md créés

**Reste à faire :**
1. ⚠️ Appliquer `002_fix_ace_type.sql` dans Supabase SQL Editor
2. Merger PR #9 (migration R2) après ajout variables Vercel
3. Tester pipeline complet end-to-end
4. Phase 2 : génération vidéo MP4
