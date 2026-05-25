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
1. **2.1** (fait, session 4) — Fondation : DB schema + bouton "Générer" + état realtime
2. **2.2** — Renderer worker scaffold : Dockerfile (SteamCMD + Xvfb + ffmpeg) + boucle polling
3. **2.3** — Intégration CS2 : `+playdemo`, `demo_goto`, `startmovie`, capture TGA frames
4. **2.4** — Encoding ffmpeg TGA → MP4 + upload R2 bucket `clips`
5. **2.5** — Déploiement GPU host

**Architecture du renderer :**
- Sépare du worker actuel (qui reste sur Railway pour le parsing)
- Polling Supabase : `clips.status='pending'` → claim atomique → render → `status='done'`
- Le `.dem` doit rester disponible dans R2 pendant la génération (le worker actuel le supprime trop tôt → à revoir)

### Pièges potentiels Option A (à anticiper)
- CS2 nécessite peut-être Steam logged-in pour `+playdemo` (anti-cheat VAC)
- Source 2 Vulkan ne marche pas sur lavapipe/llvmpipe (rendu logiciel inutilisable) → vrai GPU requis
- ToS Steam à vérifier pour usage commercial
- CS2 ~30 GB à pré-installer dans l'image Docker (ou monter en volume persistant)

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
