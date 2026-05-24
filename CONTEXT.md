# Highlight.gg — Contexte du projet (pour futures sessions)

> Ce document capture les décisions techniques, l'historique des sessions et les pièges à éviter.
> À lire en début de session pour reprendre le contexte rapidement.

---

## 🎯 C'est quoi le projet

**Highlight.gg** — Application web qui détecte et génère des highlights CS2 depuis des fichiers `.dem`.

1. L'utilisateur upload son fichier `.dem` via le frontend
2. Le frontend le stocke dans Supabase Storage et crée une ligne `demos`
3. Le worker Python détecte les highlights (multi-kills, clutchs, knife)
4. Le frontend affiche les résultats en temps réel via Supabase Realtime
5. (Phase 2) Des clips MP4 sont générés et stockés

---

## 🗂️ Structure du repo

```
DailyVC/
├── src/                      # Frontend Next.js 16 (App Router)
│   ├── app/                  # Pages : /, /dashboard, /upload, /match/[id], /clips, /share/[token], /settings
│   ├── components/           # app-shell, auth-modal, clip-card, highlight-list, processing-status, demo-upload-zone
│   └── lib/                  # supabase.ts, supabase-realtime.ts, types.ts, utils.ts
├── worker/                   # Service Python (Railway)
│   ├── worker.py             # Boucle de polling principale
│   ├── supabase_client.py    # Client service-role
│   ├── parser/
│   │   └── highlight_detector.py  # Parsing CS2 + détection
│   ├── Dockerfile
│   ├── railway.toml
│   └── requirements.txt
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql   # Schéma de référence (déjà appliqué)
│       └── 002_fix_ace_type.sql  # ⚠️ À APPLIQUER (ace → multikill_ace)
├── railway.toml              # Config Railway frontend
├── pnpm-workspace.yaml       # packages: ['.'] requis pour Railway
├── status.md                 # État actuel du projet
└── CONTEXT.md                # Ce fichier
```

---

## 🚀 Services déployés

| Service | Plateforme | Nom | Branch |
|---|---|---|---|
| Frontend Next.js | Railway | (nom auto) | `master` |
| Worker Python | Railway | `captivating-embrace` | `master`, root dir: `worker` |
| Base de données | Supabase | — | — |

---

## ⚠️ Pièges connus et décisions importantes

### 1. `highlights.type` — contrainte CHECK
La migration initiale utilisait `'ace'` mais **tout le reste du code utilise `'multikill_ace'`** (types.ts, worker, upload).  
→ Migration `002_fix_ace_type.sql` écrite mais **peut-être pas encore appliquée**.  
→ Toujours vérifier avant de tester le pipeline complet.

### 2. `pnpm-workspace.yaml` doit avoir le champ `packages`
Sans `packages: ['.']`, Railway échoue à l'install. Ne jamais le retirer.

### 3. Worker : clé `SUPABASE_SERVICE_ROLE_KEY` obligatoire
Le worker bypass le RLS avec la clé `service_role`. Sans elle, il ne peut ni lire les demos ni écrire les highlights.  
Ne jamais utiliser la clé `anon` côté worker.

### 4. `demoparser2` version : `0.41.x`
La librairie est versionnée `0.x.x` (pas `4.x.x`). La version actuelle dans `requirements.txt` est `>=0.41.0`.

### 5. Pas de génération vidéo pour l'instant
Les tables `clips` sont en place mais **aucun clip MP4 n'est généré**. Le worker insère seulement des `highlights`. La page `/clips` sera vide jusqu'à la Phase 2.

### 6. Branches Claude Code
Les sessions Claude Code créent des branches `claude/xxx-yyy-ZZZZ`. Toujours merger dans `master` et ne pas laisser de branches orphelines.

---

## 📦 Schéma Supabase

### Tables
| Table | Colonnes clés |
|---|---|
| `profiles` | `id` (= auth.users.id), `cs2_username`, `notify_email` |
| `demos` | `id`, `user_id`, `storage_path`, `status` (uploaded/parsing/rendering/done/error), `progress` (0-100), `action_types[]`, `pre_seconds`, `post_seconds` |
| `highlights` | `id`, `demo_id`, `type` (voir liste), `tick_start`, `tick_end`, `round`, `kills` |
| `clips` | `id`, `highlight_id`, `user_id`, `storage_path`, `share_token`, `is_public`, `duration_sec` |

### Types de highlights (`highlights.type`)
```
multikill_2k, multikill_3k, multikill_4k, multikill_ace
clutch_1v1, clutch_1v2, clutch_1v3, clutch_1v4, clutch_1v5
knife
```

### Storage
- Bucket `demos` : privé, fichiers `.dem` uploadés par l'utilisateur (`{user_id}/{timestamp}_{filename}.dem`)
- Bucket `clips` : public, MP4 générés (Phase 2)

---

## 🔄 Historique des sessions

### Session — 2026-05-24 (soir)
**Problèmes résolus :**
- Fix build Railway frontend : `pnpm-workspace.yaml` manquait `packages: ['.']` + suppression `dockerfilePath` dans le dashboard Railway
- Découverte que le worker n'existait pas encore

**Réalisations :**
- Worker Python créé de zéro (`worker/`) avec parsing CS2 via `demoparser2`
- Migration SQL de référence + fix `002_fix_ace_type.sql`
- `status.md` et `CONTEXT.md` créés
- Service Railway `captivating-embrace` configuré (root: `worker`)
- Fix version `demoparser2` (`4.3.0` → `0.41.0`) après échec build Railway

**PRs mergées :** #4 (Railway config), #5 (worker + migrations), #6 (fix demoparser2)

**Reste à faire au prochain démarrage :**
1. Ajouter `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` dans Railway → service `captivating-embrace` → Variables
2. Appliquer `supabase/migrations/002_fix_ace_type.sql` dans Supabase SQL Editor
3. Tester en uploadant un vrai fichier `.dem`
