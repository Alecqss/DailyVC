# Highlight.gg — Status du projet

> Dernière mise à jour : 2026-05-25

---

## ✅ Terminé

### Frontend (Next.js — déployé sur Vercel)
- [x] App shell + navigation (sidebar desktop, bottom nav mobile)
- [x] Auth (inscription / connexion via Supabase Auth, modal, reset password)
- [x] Page d'upload : sélection `.dem`, choix highlights, durée clips, **barre de progression upload**
- [x] Upload direct navigateur → Cloudflare R2 via URL pré-signée (API route `/api/upload-url`)
- [x] Dashboard : liste des démos avec statut temps réel (Supabase Realtime)
- [x] Page `/match/[id]` : détail d'une démo, liste des highlights détectés
- [x] Page `/clips` : galerie de tous les clips générés
- [x] Page `/share/[token]` : lien public partageable pour un clip
- [x] Page `/settings` : profil utilisateur (pseudo CS2, notifications email)
- [x] Types TypeScript partagés (`Demo`, `Highlight`, `Clip`, `Profile`)

### Supabase
- [x] Tables : `profiles`, `demos`, `highlights`, `clips`
- [x] Row Level Security sur toutes les tables
- [x] Trigger `on_auth_user_created` (profil auto à l'inscription)
- [x] Realtime activé sur `demos` et `clips`
- [ ] **⚠️ Migration `002_fix_ace_type.sql` à appliquer** — corrige `'ace'` → `'multikill_ace'`

### Infra / Déploiement
- [x] **Vercel** : frontend en ligne, variables `NEXT_PUBLIC_SUPABASE_*` + `R2_*` configurées
- [x] **Railway** : worker uniquement (`captivating-embrace`, root: `worker`)
- [x] ~~Railway "DailyVC"~~ → **supprimé** (était un doublon de Vercel)
- [x] Variables Railway worker : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_*`
- [x] Worker opérationnel — poll Supabase toutes les 10s ✅

### Storage (Cloudflare R2)
- [x] Bucket `csplays-gg-demos` créé (privé, Western Europe)
- [x] CORS configuré sur le bucket (PUT autorisé)
- [x] API route `/api/upload-url` : URL pré-signée PUT, auth JWT Supabase
- [x] Worker : download depuis R2 (boto3), supprime le `.dem` après traitement

### Worker CS2 (Python — Railway `captivating-embrace`)
- [x] Boucle de polling + claim atomique (`uploaded` → `parsing`)
- [x] Download `.dem` depuis R2, suppression après traitement
- [x] Détection multikills (2K→ACE), knife kills, clutchs (1v1→1v5)
- [x] Mise à jour progressive Supabase (status, progress 0→100, map_name)
- [x] Gestion d'erreurs (status `error` + message)

---

## 📋 À faire

### Priorité haute
1. **⚠️ Appliquer `supabase/migrations/002_fix_ace_type.sql`** dans Supabase SQL Editor
2. **Tester le pipeline complet** : upload `.dem` → worker détecte highlights → affichage `/match/[id]`

### Priorité moyenne
3. **Génération vidéo MP4 (Phase 2)** — décision d'approche à prendre (voir CONTEXT.md)
4. **Bucket R2 `clips`** (public) — pour stocker les MP4 générés
5. **Notifications email** — Resend ou Supabase Edge Functions

### Priorité basse
6. **Cleanup** : rate limiting, quotas uploads par utilisateur
7. **Métriques worker** : temps de traitement, taux d'erreur

---

## 🏗️ Architecture finale

```
[Navigateur]
     │ POST /api/upload-url → URL pré-signée R2
     │ PUT direct → R2 "csplays-gg-demos" (privé)
     │ INSERT demos (storage_path = clé R2, status="uploaded")
     ▼
[Supabase DB]  ──── Realtime ────▶ [Vercel — Next.js]
     │
     │ polling 10s
     ▼
[Railway — Worker Python "captivating-embrace"]
     │ download .dem depuis R2
     │ parse → highlights
     │ INSERT highlights[]
     │ DELETE .dem dans R2
     │ UPDATE demos status="done"
     ▼
[Supabase DB]  ──── Realtime ────▶ [Vercel — affiche les highlights]

(Phase 2)
     └─▶ génère MP4 → R2 "clips" (public) → INSERT clips[]
```

---

## 🔑 Variables d'environnement

### Vercel (frontend)
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon Supabase |
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | Clé API R2 |
| `R2_SECRET_ACCESS_KEY` | Secret R2 |
| `R2_BUCKET_DEMOS` | `csplays-gg-demos` |

### Railway worker (`captivating-embrace`)
| Variable | Description |
|---|---|
| `SUPABASE_URL` | URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (JWT) |
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | Clé API R2 |
| `R2_SECRET_ACCESS_KEY` | Secret R2 |
| `R2_BUCKET_DEMOS` | `csplays-gg-demos` |
| `POLL_INTERVAL_SECONDS` | Optionnel, défaut : 10 |
