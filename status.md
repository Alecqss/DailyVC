# Highlight.gg — Status du projet

> Dernière mise à jour : 2026-05-24

---

## ✅ Terminé

### Frontend (Next.js)
- [x] App shell + navigation (sidebar desktop, bottom nav mobile)
- [x] Auth (inscription / connexion via Supabase Auth, modal, reset password)
- [x] Page d'upload : sélection du `.dem`, choix des highlights à détecter, durée des clips
- [x] Dashboard : liste des démos de l'utilisateur avec statut temps réel (Supabase Realtime)
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
- [x] Storage buckets : `demos` (privé, 500 MB) et `clips` (public, 500 MB)
- [ ] **⚠️ Migration `002_fix_ace_type.sql` à appliquer** — corrige `'ace'` → `'multikill_ace'` dans le CHECK constraint de `highlights.type`

### Infra / Déploiement
- [x] Frontend déployé sur Railway
- [x] `railway.toml` frontend configuré (`pnpm install && pnpm build` / `pnpm start`)
- [x] Fix `pnpm-workspace.yaml` (champ `packages` manquant → causait échec build)
- [x] Variables Railway frontend : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [x] Service Railway worker créé (`captivating-embrace`, root directory : `worker`)
- [x] Build worker Railway : OK (fix version demoparser2 `4.3.0` → `0.41.0`)
- [ ] **Variables Railway worker à ajouter** : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### Worker CS2 (Python)
- [x] Structure du service (`worker/`)
- [x] Dockerfile Python 3.11-slim
- [x] `worker/railway.toml` : restart ON_FAILURE, max 5 retries
- [x] Parsing des démos CS2 avec `demoparser2` (v0.41.x)
- [x] Détection : multikills (2K→ACE), knife kills
- [x] Détection : clutchs (1v1 → 1v5) avec confirmation victoire de round via `round_end`
- [x] Claim atomique : passage `uploaded` → `parsing` avant traitement (évite double-processing)
- [x] Mise à jour progressive (`progress` 0→100) + `map_name` depuis le header demo
- [x] Gestion d'erreur : statut `error` + `error_message` en cas d'échec

---

## 📋 À faire

### Priorité haute — prochaine session
1. **Ajouter les variables Railway worker** : `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (Railway → service captivating-embrace → Variables)
2. **Appliquer `supabase/migrations/002_fix_ace_type.sql`** dans Supabase SQL Editor
3. **Tester le pipeline complet** : upload d'un vrai `.dem` → vérifier highlights dans Supabase

### Priorité moyenne
4. **Génération vidéo MP4 (Phase 2)** — Les clips ont un `storage_path` mais aucune vidéo n'est générée
   - Option A : CS2 headless via SteamCMD + Xvfb (complexe, nécessite GPU)
   - Option B : Vignette statique (minimap + stats du highlight, pas de vidéo)
   - Option C : Service tiers (Faceit API, etc.)
   - → **Décision à prendre avant d'implémenter**
5. **Notifications email** — Alerter l'utilisateur quand sa démo est traitée (Resend ou Supabase Edge Functions)

### Priorité basse
6. **Cleanup automatique** — Supprimer le fichier `.dem` du Storage après traitement
7. **Rate limiting** — Limiter les uploads par utilisateur
8. **Métriques worker** — Temps de traitement, taux d'erreur

---

## 🏗️ Architecture

```
[Utilisateur]
     │ upload .dem (max 500 MB)
     ▼
[Supabase Storage — bucket "demos" (privé)]
     │ INSERT demos (status="uploaded")
     ▼
[Supabase DB]  ──── Realtime ────▶ [Frontend Next.js / Railway]
     │
     │ polling toutes les 10s
     ▼
[Worker Python / Railway — "captivating-embrace"]
     │ 1. claim  : status → "parsing",  progress = 5
     │ 2. download .dem depuis Storage
     │ 3. parse  : demoparser2 → player_death, round_end events
     │ 4. detect : multikills, knife, clutchs
     │             progress = 60
     │ 5. INSERT highlights[]
     │             progress = 80
     │ 6. UPDATE demos : status="done", progress=100, map_name
     │
     │ (Phase 2) génère MP4 → INSERT clips → Storage "clips"
     ▼
[Supabase DB]  ──── Realtime ────▶ [Frontend met à jour l'UI]
```

---

## 🔑 Variables d'environnement

### Frontend (Railway)
| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique anon (Settings → API) |

### Worker (Railway — service `captivating-embrace`)
| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (Settings → API) — ⚠️ ne jamais exposer côté client |
| `POLL_INTERVAL_SECONDS` | Optionnel, défaut : 10 |
