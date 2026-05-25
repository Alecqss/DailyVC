# Highlight.gg — Historique des sessions

> Une entrée par session. Ajouter en haut (plus récent en premier).

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
