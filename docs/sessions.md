# Highlight.gg — Historique des sessions

> Une entrée par session. Ajouter en haut (plus récent en premier).

---

## Session 8 — 2026-07-06

### Contexte de départ
- Obstacle session 7 : `startmovie` produit 0 frame TGA malgré netcon fonctionnel

### 🔑 Découverte majeure : `startmovie` N'EXISTE PAS sur Linux
Après une série de fixes netcon (tous utiles mais insuffisants), le verdict est tombé
via `find startmovie` envoyé en live à CS2 : **"no results"**. La commande n'est pas
dans le binaire Linux, et aucune alternative de rendu offline n'existe (`find movie/
demo_/record` vérifiés). Elle ne renvoyait ni erreur ni frame — un no-op silencieux.
→ **Pivot : capture temps réel du display Xvfb via `ffmpeg -f x11grab`**, validée
en live (60 fps constants). Windows/HLAE évalué et écarté (provider + coût +30-50 %,
réinstallation complète, HLAE à maintenir à chaque MAJ CS2) tant que la qualité
x11grab suffit pour la cible MM/TikTok.

### Bugs trouvés + fixés (dans l'ordre)
1. **Netcon muet** : port 29000 = port par défaut de **VConsole2** (console binaire
   Source 2, ouverte quelle que soit la valeur de `-netconport`). Collision → nos
   commandes parlaient à VConsole. Fix : `NETCON_PORT=47201`. Diagnostic :
   `renderer/tools/netcon_probe.py`.
2. **Thread lecteur netcon mourait après 5 s** : `socket.create_connection(timeout=5)`
   laisse un timeout persistant sur le socket → `sock.settimeout(None)`.
3. **ffmpeg crashait (symbol lookup libavfilter)** : le `LD_LIBRARY_PATH` des libs CS2
   (exporté par l'entrypoint) fait charger les libav* de CS2 → env nettoyé pour tout
   subprocess ffmpeg/ffprobe.
4. **NVENC indisponible** : lib `libnvidia-encode` absente de l'HÔTE (même piège que
   Vulkan session 7, driver headless). Fix hôte : `apt-get install libnvidia-encode-580-server`
   + `docker restart`. Encodage GPU `h264_nvenc` → CS2 garde son CPU.
5. **Clip au mauvais moment (freeze time)** : `demo_gototick` attend des **ticks de
   démo**, le parser fournit des **game ticks** (démo enregistrée à partir du game
   tick ~12094, warmup exclu). CS2 loggue `skipping to demo tick X (game tick Y)` →
   on lit l'offset et on re-seek corrigé (`cs2_capture.py`).
6. **Faux multikills** (2 kills du même joueur à 50 s d'écart dans le même round
   comptés comme 2K) : découpage en rafales avec gap max 15 s entre kills consécutifs
   (`worker/parser/highlight_detector.py`) — fix côté worker Railway, actif après merge.

### Réalisations
- **✅ PIPELINE COMPLET VALIDÉ DE BOUT EN BOUT** : claim → download .dem → CS2 + seek
  → capture x11grab 1080p60 NVENC → remux faststart → upload R2 → `status='done'`.
- Refonte `cs2_capture.py` (x11grab, `demo_pauseatservertick`, `demo_ui_mode 0`,
  correction offset ticks), `ffmpeg_encode.py` (remux + ffprobe au lieu de concat TGA),
  entrypoint (Xvfb 1920x1080), token R2 élargi au bucket clips (AccessDenied corrigé).
- `docs/business-plan.md` créé (marché, freemium, économie unitaire, roadmap 4 phases).

### Reste à faire (prochaine session)
- Merger la PR de session 8 → déploie le worker corrigé (Railway) + rebuild image GHCR.
- Re-uploader une démo, générer un clip d'un vrai multikill, juger la qualité finale.
- Audio des clips (PulseAudio null-sink → ffmpeg), qualité/fluidité fine, timing pads.
- Auto start/stop de la VM selon la queue (prérequis coût, cf. business plan).

---

## Session 7 — 2026-07-05

### Contexte de départ
- PR #20 mergée (pivot Scaleway : Dockerfile client Steam, entrypoint userns, guide déploiement)
- Objectif : provisionner la VM Scaleway et valider le pipeline de bout en bout

### Réalisations
- **VM Scaleway créée** : `scw-pedantic-fermi`, `L4-1-24G`, `fr-par-1`, image "Ubuntu Noble GPU OS 13 (Nvidia) passthrough", IP `51.15.195.123`. SSH avec clé `csplays`. Disque système 125 Go (largement suffisant, pas de second volume nécessaire).
- **Conteneur renderer lancé** : `docker run -d --gpus all --privileged --env-file /data/renderer.env -v /data:/data --restart unless-stopped ghcr.io/alecqss/highlightgg-renderer:latest`
- **✅ LE LOGIN STEAM CLIENT FONCTIONNE SUR SCALEWAY** (contrairement à RunPod) : `steamwebhelper` tourne, logs `[entrypoint] Client Steam connecté ✅`. Le mur des user namespaces qui bloquait tout sur RunPod est confirmé résolu par le passage à une VM avec conteneur `--privileged`.
- **Bug Vulkan trouvé + corrigé** : l'image GPU Scaleway installe un driver NVIDIA **headless** (compute-only, pour CUDA/IA) sans aucune lib graphique. CS2 plantait sur "Failed to initialize Vulkan". Fix : `apt-get install libnvidia-gl-580-server` sur l'**hôte** + `reboot` (sinon `NVML: Driver/library version mismatch`). Piège de diagnostic : l'ICD Vulkan est monté dans `/etc/vulkan/icd.d/`, pas `/usr/share/vulkan/icd.d/`.
- **`libavresample.so.4` résolu** : CS2 l'embarque, il manquait juste `LD_LIBRARY_PATH=/data/cs2/game/bin/linuxsteamrt64` (déjà présent dans `cs2_capture.py`, confirmé nécessaire).
- **"A game file appears missing/corrupted"** : le téléchargement CS2 était incomplet → `steamcmd +login anonymous +app_update 730 validate` (`Success! App '730' fully installed`).
- **✅✅ CS2 SE LANCE ET REND EN HEADLESS** : `Demo playback finished ( 496.9 seconds, 47371 render frames, 95.33 fps )`. **C'était LA grosse inconnue de toute l'archi — elle est levée.** Le GPU rend bien la démo.
- **Pipeline complet déclenché depuis le frontend** : claim job → download .dem R2 → génère cfg → lance CS2 → séquence les commandes → (ffmpeg + upload restent à valider).

### ⚠️ Obstacle actuel (reprendre ICI) : `startmovie` produit 0 frame TGA
Diagnostic accumulé :
1. **Les commandes dans le cfg ne marchent pas** : `playdemo` charge la démo de façon asynchrone (~7-90s selon cache). `demo_goto`/`spec_*`/`startmovie` exécutés depuis le cfg partent AVANT le chargement → ignorés, la démo joue en entier sans enregistrer. → Fix : pilotage via **`-netconport 29000`** après détection de `Host activate: Playing Demo` dans `console.log`.
2. **`console.log` est tronqué à chaque lancement** → le `seek(offset)` sautait le contenu. Fix : `unlink` avant lancement + lecture complète.
3. **Le netcon en connexion-par-commande ne délivre pas les commandes** : `startmovie` n'apparaît même pas dans `console.log`, 0 frame. Le netcon est **bidirectionnel**, CS2 lie sa console au socket. → Fix (dernier commit, PAS ENCORE TESTÉ) : **connexion persistante unique** + thread lecteur qui logue `netcon ← ...` + renvoi `sv_cheats 1`/`host_framerate` après le load.

**Prochaine action immédiate à la reprise** : patch à chaud + re-clic "Générer", et lire les lignes `netcon ← ...` autour du `startmovie` pour voir enfin la réponse de CS2. Filtrer : `docker logs -f renderer 2>&1 | grep -iE 'netcon|Rendering|Capture|frame|error|Démo'`. Astuce : relancer le conteneur avec `-e CS2_CAPTURE_TIMEOUT=120` pour itérer vite (au lieu de 600s).

### Piste si le netcon persistant ne suffit pas
Vérifier que `startmovie` accepte un **chemin absolu** (sinon écrire dans un chemin relatif à `csgo/`). Vérifier aussi si la démo n'est pas en pause après `demo_goto` (ajouter `demo_resume` / `demo_timescale 1`).

### Commits de la session (branche `claude/highlight-gg-work-p7gr32`, PAS de PR encore)
- `7eefd02` netcon (1re version, cfg → netcon)
- `00f4845` fix console.log tronqué
- `1135a6a` netcon connexion persistante + lecture réponses (⚠️ à tester)
- Dockerfile : `libvulkan1` ajouté ; `docs/scaleway-deploy.md` : étape `libnvidia-gl` + reboot documentée.

### Autre point relevé (non bloquant)
- Certains highlights n'ont **pas de `player_steamid`** → `spec_mode 5` (chase) au lieu de `spec_mode 4` (1re personne). À investiguer côté worker/détection une fois le rendu validé.

### Reste à faire (prochaine reprise)
1. Tester le netcon persistant (`1135a6a`) : lire la réponse de CS2 à `startmovie`, corriger jusqu'à obtenir des TGA.
2. Une fois des frames capturées → valider ffmpeg + upload R2 + `clips.status='done'` + affichage `/clips`.
3. Investiguer les highlights sans `player_steamid`.
4. Créer une PR pour les commits de session 7.
5. Éteindre la VM entre les sessions : `docker stop renderer` + `shutdown -h now`, PUIS **Power off dans la console Scaleway** (sinon facturation continue). Le disque `/data` persiste.

---

## Session 6 — 2026-07-04

### Contexte de départ
- Tout le code Phase 2 mergé, image GHCR OK, compte Steam `csplaysgg` prêt
- Objectif : déployer le renderer sur RunPod et faire un 1er rendu réel

### Déroulé — déploiement RunPod (échec) puis pivot Scaleway
Longue session de debug live dans un pod RunPod (RTX 3090). Murs franchis successivement :
1. **Login Steam compte → `Account Logon Denied`** : le Steam Guard **email** reste actif même sans authentificateur mobile. → bascule sur `+login anonymous` (l'app 730 se télécharge sans compte). Fix poussé (PR #19, déjà mergée).
2. CS2 se télécharge bien (~63 GB, pas 30). Build **contient le rendu client** (`librendersystemvulkan.so`) → le risque "build serveur only" est levé.
3. Lancé par le renderer, `cs2` tourne mais **0 frame** en 600s. Cause : on était aveugles (`stdout` → DEVNULL) + lancement du binaire brut sans env.
4. En manuel : `cs2.sh` exige le **runtime sniper** (bwrap) → on lance le **binaire brut** (`bin/linuxsteamrt64/cs2`). Il charge le moteur (Vulkan) mais **se fige** : `SteamAPI_Init` échoue → il faut un **client Steam loggé** qui tourne.
5. Faire tourner le client Steam : user non-root (`steamuser`), `dbus-x11`, libs i386, neutraliser `steamdeps` interactif, désactiver le check `steam-runtime-check-requirements`… **puis MUR FINAL : le client Steam exige les USER NAMESPACES** (`steamwebhelper` via bwrap/pressure-vessel), que **RunPod bloque au niveau kernel**. Infranchissable sur RunPod.

### Décision — pivot vers VM GPU
- **RunPod (et tout conteneur non-privilégié) abandonné.** Il faut une **VM** où on contrôle le kernel + conteneur `--privileged`.
- Options comparées : Vast.ai (moins cher mais aléatoire par machine) vs VM complète (déterministe). **→ Scaleway** retenu (VM complète, EU/France, facturation entreprise, GPU L4 Ada).

### Réalisations (code)
- **`renderer/Dockerfile`** : ajoute le **client Steam** (deb + licence non-interactive), `dbus-x11`, libs i386, user `steamuser`, stub `steamdeps`.
- **`renderer/entrypoint.sh`** : recette VM complète — active `unprivileged_userns_clone`, Xvfb, symlink `steamclient.so`, download CS2 anonyme, **lance un client Steam loggé en fond + attend le login**, puis renderer en `steamuser` (avec `LD_LIBRARY_PATH`).
- **`renderer/cs2_capture.py`** : `CS2_DIR=/data/cs2`, `LD_LIBRARY_PATH` sur le launch, `-condebug`, sortie CS2 loggée dans un fichier (fini l'aveugle), tail du log dans l'erreur.
- **`renderer/.env.example`** : réintègre `STEAM_USERNAME/PASSWORD`, `CS2_DIR=/data/cs2`.
- **`docs/scaleway-deploy.md`** (nouveau) : guide VM L4 + `docker run --privileged` + section validation live.
- **`docs/runpod-deploy.md`** : marqué OBSOLÈTE.

### ⚠️ Point non validé (à finir sur la VM)
Le login Steam n'a jamais abouti sur RunPod (bloqué avant par les namespaces). Donc le bloc « attente login » de l'entrypoint **et** la question « `startmovie` produit-il vraiment des frames » restent à valider en live sur Scaleway.

### Reste à faire
1. Provisionner la VM GPU Scaleway (L4, fr-par) + block storage 80 GB
2. `docker run --privileged` de l'image, valider login Steam (`steamwebhelper` doit tourner) puis 1er rendu
3. Le mot de passe Steam a fuité en clair dans le chat de debug → **le changer**

---

## Session 5 — 2026-06-30

### Contexte de départ
- Migration `003_clip_rendering.sql` en attente d'application
- Étape 2.1 (bouton Générer + états realtime) déjà faite
- Scaffold renderer 2.2 (Dockerfile + entrypoint + boucle polling) déjà fait

### Réalisations

**Migration appliquée :**
- `003_clip_rendering.sql` : `status`, `progress`, `error_message` sur `clips` ; `storage_path` nullable ✅

**Étape 2.3 — CS2 headless render + capture TGA frames :**
- `renderer/cs2_capture.py` (nouveau) : orchestration CS2 headless
  - `accountid_from_steamid` : steamid64 → accountid 32 bits pour `spec_lock_to_accountid`
  - Génère `render.cfg` : `demo_goto`, `spec_lock_to_accountid` + `spec_mode 4` (POV 1ère pers.), `host_framerate`, `startmovie tga`
  - Lance CS2 sous Xvfb (hérite `DISPLAY=:99` de `entrypoint.sh`)
  - Détection de fin par comptage de frames (indépendant du GPU) + timeout
  - `CS2_CMD` et cvars pilotables par env (ajustables sur host GPU en 2.5)
- `renderer/renderer.py` : `_render_cs2_frames` branché sur `cs2_capture`
- `worker/parser/highlight_detector.py` : capture `player_steamid` pour multikills, knife et clutchs
- `worker/worker.py` : insère `player_steamid` dans la table `highlights`
- Migration `004_highlight_player.sql` : ajoute `highlights.player_steamid` (text, nullable)

**Étape 2.4 — Encoding ffmpeg + bucket clips :**
- `renderer/ffmpeg_encode.py` : concat demuxer, H.264/yuv420p/faststart, CRF configurable
- Bucket R2 `csplays-gg-clips` créé (public, Western Europe, CORS GET)
- `NEXT_PUBLIC_R2_CLIPS_URL` configurée sur Vercel
- `src/lib/types.ts` : `getClipUrl()` — URL R2 publique depuis `storage_path`
- `clips-content.tsx` + `share-content.tsx` : player vidéo branché sur R2

**Étape 2.5 — Build CI + préparation déploiement RunPod :**
- Compte Steam dédié créé (`csplaysgg`), Steam Guard désactivé (requis pour login non-interactif SteamCMD)
- `renderer/entrypoint.sh` : login Steam via `STEAM_USERNAME`/`STEAM_PASSWORD`, `CS2_DIR=/workspace` (volume persistant)
- `renderer/.env.example` : toutes les variables d'env du renderer documentées
- `docs/runpod-deploy.md` : guide de déploiement complet (volume, pod, vars, coûts, dépannage)
- **Décision build image** : analysé build local+Docker Hub vs CI→GHCR vs CI→Docker Hub → **GitHub Actions → GHCR** retenu (pas de Docker local, auth intégrée, gratuit, repo public)
- **Décision mode RunPod** : analysé serverless vs pod 24/7 vs pod on-demand → **pod persistant on-demand** retenu (CS2 démarre trop lentement pour le serverless ; 24/7 trop cher pour une queue intermittente)
- `.github/workflows/build-renderer.yml` : build + push `ghcr.io/alecqss/highlightgg-renderer` sur merge master (paths `renderer/**`) ou manuel
- Premier build CI ✅ réussi (run #1, succès en ~2min20)
- Package GHCR rendu public par l'utilisateur

### Décision
- POV 1ère personne choisi pour les clips (via `spec_lock_to_accountid`) → `player_steamid` stocké sur `highlights`

### PRs
- #14 mergée (2.2 scaffold renderer)
- #15 mergée (2.3 + 2.4 + R2 clips bucket)
- #16 mergée (2.5 — entrypoint Steam, .env.example, guide RunPod)
- #17 mergée (2.5 — CI build GHCR, mise à jour guide RunPod)

### Reste à faire
1. **Action manuelle (hors code)** : créer le pod RunPod (volume persistant 40 GB, image `ghcr.io/alecqss/highlightgg-renderer:latest`, variables d'env, premier démarrage ~30min pour télécharger CS2) — voir `docs/runpod-deploy.md`
2. Tester le pipeline de bout en bout sur un vrai clip une fois le pod up

---

## Session 4 — 2026-05-25 (soir)

### Contexte de départ
- Pipeline end-to-end fonctionnel : upload R2 → worker détecte highlights → affichage `/match/[id]` ✅
- Bouton "Générer" sur les highlights : ne faisait qu'un `console.log` (placeholder Phase 2)

### Problèmes résolus pendant cette session
- **URL R2 malformée** (`csplays-gg-demos.https//...`) → ajout de `forcePathStyle: true` dans `S3Client` (route `/api/upload-url`)
- **409 Conflict sur INSERT demos** → profil utilisateur absent dans `profiles` (trigger raté) → upsert du profil avant l'INSERT, + meilleure remontée d'erreur Supabase
- **Worker download foiré** (`https://https:/...`) → variables Railway mal configurées (`R2_ACCOUNT_ID` avec `https://`, `R2_BUCKET_DEMOS` avec `.r2.cloudflarestorage.com`) → corrigées côté Railway ET Vercel

### Décision majeure — Phase 2 : Option A (CS2 headless rendering)
Trois options évaluées pour la génération vidéo :
- A) CS2 headless avec GPU host (~$50-300/mois, 2-4 semaines de dev) ← **choisie**
- B) Vignette statique 2D (simple, hébergeable Railway)
- C) Service tiers

Plan en 5 étapes incrémentales (2.1 → 2.5).

### Réalisations — Étape 2.1 (fondation, sans GPU)
- **Migration `003_clip_rendering.sql`** : ajout `status` (pending/rendering/done/error), `progress`, `error_message` sur `clips` ; `storage_path` rendu nullable
- **Type TS `Clip`** : nouveaux champs + `ClipStatus` exporté
- **Hook `useUserClips(userId)`** dans `supabase-realtime.ts` : suivi temps réel des clips de l'utilisateur
- **`HighlightList`** : remplace `clipMap: Record<string, string>` par `Record<string, Clip>` ; nouveau sous-composant `HighlightAction` qui rend 4 états (no-clip / pending / rendering avec %, done, error)
- **`match-content.tsx`** : bouton "Générer" branché → INSERT `clips` (status=pending) ; bouton "Voir le clip" → navigation vers `/share/{token}`
- **`/clips` et `/share/[token]`** : filtrés sur `status='done'` (clips non-rendus invisibles)

### Reste à faire (prochaines sessions)
1. Appliquer migration `003_clip_rendering.sql` dans Supabase
2. **Étape 2.2** : créer `renderer/` (Dockerfile SteamCMD + Xvfb + ffmpeg + boucle polling)
3. **Étape 2.3** : intégration CS2 (replay + capture)
4. **Étape 2.4** : encoding MP4 + upload R2 bucket `clips`
5. **Étape 2.5** : déploiement GPU host (RunPod / Vast.ai)

---

## Session 3 — 2026-05-25 (journée)

### Contexte de départ
- Worker opérationnel sur Railway, poll Supabase toutes les 10s ✅
- Problème : upload des démos bloqué à cause de la limite 50 MB de Supabase Storage

### Problèmes résolus
- **Limite upload Supabase Storage (50 MB)** → décision de migrer vers Cloudflare R2
- **Doublon de déploiement frontend** → Railway "DailyVC" supprimé, Vercel est le seul frontend
- **Variables mal configurées sur le worker** : `NEXT_PUBLIC_SUPABASE_URL` → `SUPABASE_URL` ; mauvaise clé (`sb_secret_` au lieu de la `service_role` JWT)

### Réalisations
- **Migration storage vers Cloudflare R2**
  - API route Next.js `POST /api/upload-url` : génère une URL pré-signée R2 (auth JWT Supabase vérifié côté serveur)
  - `upload-content.tsx` : upload direct navigateur → R2 via URL pré-signée, barre de progression temps réel
  - Worker : télécharge depuis R2 (boto3), supprime le `.dem` après traitement
  - `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` ajoutés au frontend
  - `boto3` ajouté au worker
- **CORS** configuré sur le bucket R2 `csplays-gg-demos` (AllowedMethods: PUT)
- **Architecture clarifiée** : Vercel (frontend) + Railway worker only + Supabase + R2
- **CLAUDE.md** créé avec instructions permanentes pour futures sessions
- **docs/sessions.md** créé (ce fichier)
- `status.md` et `CONTEXT.md` mis à jour

### PRs mergées
- #8 (docs R2 decision)
- #9 (migration R2 storage) — en cours de merge

### État en fin de session
- ✅ Worker tourne sur Railway, poll toutes les 10s
- ✅ Upload frontend → R2 (en attente merge PR #9 + variables Vercel)
- ⚠️ Migration `002_fix_ace_type.sql` à appliquer dans Supabase (si pas encore fait)
- ❌ Pipeline complet pas encore testé end-to-end

### Variables d'environnement configurées
**Vercel (frontend)** : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_DEMOS`  
**Railway worker** : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_DEMOS`

---

## Session 2 — 2026-05-25 (matin)

### Contexte de départ
- Worker Python créé mais pas encore configuré sur Railway
- Variables Railway worker manquantes

### Problèmes résolus
- Worker crashait : variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` manquantes
- Découverte : `SUPABASE_SERVICE_ROLE_KEY` ≠ "Secret keys" Supabase → c'est la clé JWT dans Settings → API → Project API keys

### Réalisations
- Worker opérationnel : poll Supabase toutes les 10s, `HTTP/2 200 OK` ✅
- Variables Railway worker configurées
- Découverte limite 50 MB Supabase Storage → bloque upload démos
- Décision architecture : migrer vers Cloudflare R2 (no egress, no size limit)
- `status.md` + `CONTEXT.md` mis à jour avec décision R2

### PRs mergées
- #7 (docs status + context)

---

## Session 1 — 2026-05-24 (soir)

### Contexte de départ
- Frontend Next.js existant (Vercel), Supabase configuré
- Build Railway échouait : `Dockerfile.worker` inexistant + `pnpm-workspace.yaml` mal formé
- Worker inexistant

### Problèmes résolus
- `pnpm-workspace.yaml` manquait le champ `packages: ['.']`
- `dockerfilePath: Dockerfile.worker` à supprimer du dashboard Railway
- Version `demoparser2` : `4.3.0` → `0.41.0` (la lib est versionnée `0.x.x`)
- Schéma Supabase : contrainte `'ace'` → `'multikill_ace'` (migration 002)

### Réalisations
- Worker Python créé de zéro (`worker/`)
  - Parsing CS2 avec `demoparser2`
  - Détection : multikills (2K→ACE), knife, clutchs 1v1→1v5 avec confirmation round gagné
  - Claim atomique, mise à jour progressive (progress 0→100)
- Migrations SQL : `001_initial.sql` (référence) + `002_fix_ace_type.sql` (fix contrainte)
- Service Railway `captivating-embrace` créé (root: `worker`)
- `status.md` + `CONTEXT.md` créés

### PRs mergées
- #4 (Railway config fix)
- #5 (worker Python + migrations)
- #6 (fix demoparser2 version)
