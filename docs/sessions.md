# Highlight.gg — Historique des sessions

> Une entrée par session. Ajouter en haut (plus récent en premier).

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
