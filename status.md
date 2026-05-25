# Highlight.gg — Status du projet

> Dernière mise à jour : 2026-05-25

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
- [x] Storage buckets créés (seront remplacés par R2 — voir décisions)
- [ ] **⚠️ Migration `002_fix_ace_type.sql` à appliquer** — corrige `'ace'` → `'multikill_ace'`

### Infra / Déploiement
- [x] Frontend déployé sur Railway
- [x] Service Railway worker `captivating-embrace` (root: `worker`, branch: `master`)
- [x] Variables Railway worker configurées (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- [x] Worker opérationnel — poll Supabase toutes les 10s ✅

### Worker CS2 (Python)
- [x] Boucle de polling + claim atomique (`uploaded` → `parsing`)
- [x] Détection multikills (2K→ACE), knife kills, clutchs (1v1→1v5)
- [x] Mise à jour progressive Supabase (status, progress, map_name)
- [ ] Téléchargement depuis R2 *(à migrer depuis Supabase Storage)*
- [ ] Suppression du `.dem` après traitement

---

## 🚧 En cours — Phase R2 Storage

### Étape 1 — Upload démos vers R2 (priorité immédiate)
> Problème actuel : Supabase Storage limite les fichiers à 50 MB (free tier). Les démos font ~400 MB.

- [ ] Créer compte Cloudflare + bucket R2 `demos` (privé)
- [ ] API Route Next.js `POST /api/upload-url` → génère une URL pré-signée R2
- [ ] Modifier `upload-content.tsx` : upload direct navigateur → R2 via URL pré-signée
- [ ] Variables Railway frontend : `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_DEMOS`
- [ ] Supprimer les buckets Supabase Storage (ou les laisser vides)

### Étape 2 — Worker télécharge depuis R2
- [ ] Ajouter `boto3` dans `worker/requirements.txt` (SDK S3-compatible R2)
- [ ] Modifier `worker.py` : download R2 au lieu de Supabase Storage
- [ ] Après traitement : **supprimer le `.dem` de R2** (économie de stockage)
- [ ] Variables Railway worker : `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_DEMOS`

### Étape 3 — Clips MP4 dans R2 (Phase 2, génération vidéo)
- [ ] Créer bucket R2 `clips` (public, URL directe)
- [ ] Worker génère MP4 et uploade dans R2
- [ ] Frontend lit les clips depuis l'URL R2 publique

---

## 📋 À faire (suite)

### Après R2
4. **Tester le pipeline complet** : upload `.dem` → parsing → highlights affichés
5. **Appliquer `002_fix_ace_type.sql`** si pas encore fait
6. **Génération vidéo MP4** — décision d'architecture à prendre (voir CONTEXT.md)
7. **Notifications email** — Resend ou Supabase Edge Functions
8. **Cleanup** — Rate limiting, quotas par utilisateur
9. **Métriques worker** — Temps de traitement, taux d'erreur

---

## 🏗️ Architecture cible (après migration R2)

```
[Navigateur]
     │ 1. POST /api/upload-url → URL pré-signée R2
     │ 2. PUT direct → R2 bucket "demos" (privé)
     │ 3. INSERT demos (storage_path = clé R2, status="uploaded")
     ▼
[Supabase DB]  ──── Realtime ────▶ [Frontend Next.js]
     │
     │ polling 10s
     ▼
[Worker Python / Railway — "captivating-embrace"]
     │ 1. claim demo (status → "parsing")
     │ 2. download .dem depuis R2
     │ 3. parse + détecter highlights
     │ 4. INSERT highlights[]
     │ 5. DELETE .dem dans R2  ← important pour garder le stockage bas
     │ 6. UPDATE demos status="done"
     │
     │ (Phase 2) générer MP4 → upload R2 "clips" → INSERT clips
     ▼
[R2 bucket "clips" public]  ────▶ [Page /share/[token]]
```

---

## 🔑 Variables d'environnement

### Frontend (Railway)
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique anon |
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | Clé R2 (à créer dans R2 → Manage API tokens) |
| `R2_SECRET_ACCESS_KEY` | Secret R2 |
| `R2_BUCKET_DEMOS` | Nom du bucket (ex: `highlight-gg-demos`) |

### Worker (Railway — `captivating-embrace`)
| Variable | Description |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role ✅ configurée |
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | Clé R2 |
| `R2_SECRET_ACCESS_KEY` | Secret R2 |
| `R2_BUCKET_DEMOS` | Nom du bucket demos |
| `POLL_INTERVAL_SECONDS` | Optionnel, défaut : 10 |
