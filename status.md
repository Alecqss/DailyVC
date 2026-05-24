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

### Supabase (déjà en place)
- [x] Tables : `profiles`, `demos`, `highlights`, `clips`
- [x] Row Level Security sur toutes les tables
- [x] Trigger `on_auth_user_created` (profil auto à l'inscription)
- [x] Realtime activé sur `demos` et `clips`
- [x] Storage buckets : `demos` (privé, 500 MB) et `clips` (public, 500 MB)

### Infra / Déploiement
- [x] Configuration Railway frontend (`railway.toml`)
- [x] Fix `pnpm-workspace.yaml` (champ `packages` manquant)
- [x] Variables d'environnement Railway frontend ajoutées (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

---

## 🚧 En cours

### Worker CS2 (Python)
- [x] Structure du service (`worker/`)
- [x] Dockerfile Python 3.11
- [x] Parsing des démos CS2 avec `demoparser2`
- [x] Détection des highlights : multikills (2K→ACE), knife
- [x] Détection des clutchs (1v1 → 1v5) avec confirmation victoire de round
- [x] Mise à jour Supabase (status, progress, highlights)
- [ ] Génération vidéo MP4 (Phase 2 — voir ci-dessous)
- [ ] Configuration Railway service worker (variables d'env)

### Base de données Supabase
- [x] Migration SQL écrite (`supabase/migrations/001_initial.sql`)
- [ ] Migration appliquée sur le projet Supabase

---

## 📋 À faire

### Priorité haute
1. **⚠️ Appliquer la migration `002_fix_ace_type.sql`** — corrige le CHECK constraint `'ace'` → `'multikill_ace'` (sinon les ACE ne peuvent pas être insérés par le worker)
2. **Configurer le service Railway worker** :
   - Ajouter variables : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - Root directory : `worker/`
   - Aucun `dockerfilePath` à renseigner (Dockerfile à la racine du service)
3. **Tester le pipeline complet** : upload démo → parsing → highlights affichés

### Priorité moyenne
4. **Génération vidéo (Phase 2)** — Rendre les clips CS2 en MP4
   - Option A : CS2 headless via SteamCMD + Xvfb (lourd, nécessite GPU ou CPU puissant)
   - Option B : Générer une "vignette" statique avec minimap + stats (sans vidéo)
   - Option C : Utiliser l'API d'un service tiers (ex: Faceit)
   - → **À décider avant d'implémenter**
5. **Notifications email** — Envoyer un email quand la démo est traitée (Resend ou Supabase Edge Functions)
6. **Bucket Supabase Storage** — Créer les buckets `demos` (privé) et `clips` (public)

### Priorité basse
7. **Rate limiting / quotas** — Limiter les uploads par utilisateur
8. **Cleanup automatique** — Supprimer les fichiers `.dem` après traitement
9. **Métriques worker** — Temps de traitement, taux d'erreur

---

## 🏗️ Architecture

```
[Utilisateur]
     │ upload .dem
     ▼
[Supabase Storage]  ←──  demos bucket (privé)
     │ insert row status="uploaded"
     ▼
[Supabase DB]  ──── Realtime ────▶ [Frontend Next.js / Railway]
     │
     │ polling toutes les 10s
     ▼
[Worker Python / Railway]
     │ 1. télécharge le .dem
     │ 2. parse avec demoparser2
     │ 3. détecte les highlights
     │ 4. insère dans `highlights`
     │ 5. (Phase 2) génère MP4 → insère dans `clips`
     ▼
[Supabase Storage]  ←──  clips bucket (public, Phase 2)
```

---

## 🔑 Variables d'environnement

### Frontend (Railway)
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique anon |

### Worker (Railway)
| Variable | Description |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role (contourne le RLS) |
| `POLL_INTERVAL_SECONDS` | Intervalle de polling (défaut : 10) |
