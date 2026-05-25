# Highlight.gg — Status du projet

> Dernière mise à jour : 2026-05-25 (session 4)

---

## ✅ Terminé

### Frontend (Next.js — déployé sur Vercel)
- [x] App shell + navigation (sidebar desktop, bottom nav mobile)
- [x] Auth (inscription / connexion via Supabase Auth, modal, reset password)
- [x] Page d'upload : sélection `.dem`, choix highlights, durée clips, **barre de progression upload**
- [x] Upload direct navigateur → Cloudflare R2 via URL pré-signée (API route `/api/upload-url`)
- [x] Dashboard : liste des démos avec statut temps réel (Supabase Realtime)
- [x] Page `/match/[id]` : détail d'une démo, liste des highlights détectés
- [x] **Bouton "Générer" branché** : insère un job dans `clips` (status=pending), suit l'état en temps réel
- [x] Page `/clips` : galerie de tous les clips générés (filtre `status=done` uniquement)
- [x] Page `/share/[token]` : lien public partageable pour un clip
- [x] Page `/settings` : profil utilisateur (pseudo CS2, notifications email)
- [x] Types TypeScript partagés (`Demo`, `Highlight`, `Clip`, `Profile`)

### Supabase
- [x] Tables : `profiles`, `demos`, `highlights`, `clips`
- [x] Row Level Security sur toutes les tables
- [x] Trigger `on_auth_user_created` (profil auto à l'inscription)
- [x] Realtime activé sur `demos` et `clips`
- [x] Migration `002_fix_ace_type.sql` appliquée (contrainte CHECK corrigée)
- [ ] **⚠️ Migration `003_clip_rendering.sql` à appliquer** — ajoute `status` / `progress` / `error_message` à `clips`

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

### Priorité haute — Phase 2 (génération vidéo MP4, Option A choisie)
1. **⚠️ Appliquer `supabase/migrations/003_clip_rendering.sql`** dans Supabase SQL Editor
2. **Étape 2.2 — Renderer worker scaffold** : Docker (SteamCMD + Xvfb + ffmpeg), polling Supabase `clips.status='pending'`
3. **Étape 2.3 — Intégration CS2** : `+playdemo`, console commands (`demo_goto`, `startmovie`), capture TGA frames
4. **Étape 2.4 — Encoding ffmpeg** : TGA → MP4, upload R2 bucket `clips`
5. **Étape 2.5 — Déploiement GPU host** : RunPod / Vast.ai / Lambda Labs (~$0.20-0.50/h)
6. **Bucket R2 `clips`** (public) — pour stocker les MP4 générés

### Priorité moyenne
7. **Worker actuel** : arrêter de supprimer le `.dem` après parsing (le renderer en a besoin) — OU stratégie de cleanup différée
8. **Notifications email** — Resend ou Supabase Edge Functions (quand un clip est prêt)

### Priorité basse
9. **Cleanup** : rate limiting, quotas uploads par utilisateur
10. **Métriques worker** : temps de traitement, taux d'erreur

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

(Phase 2 — Option A : CS2 headless rendering)
[Frontend "Générer"] → INSERT clips (status="pending")
                          │
                          ▼
[GPU Host — Renderer Python]  (RunPod / Vast.ai, à déployer)
     │ poll Supabase clips.status="pending"
     │ download .dem depuis R2
     │ lance CS2 + Xvfb : +playdemo / demo_goto / startmovie
     │ capture frames TGA pour la fenêtre [tick_start, tick_end]
     │ ffmpeg → MP4
     │ upload MP4 → R2 "clips" (public)
     │ UPDATE clips status="done", storage_path, duration_sec
     ▼
[Supabase DB]  ──── Realtime ────▶ [Vercel — affiche le clip dans /match/[id] et /clips]
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
