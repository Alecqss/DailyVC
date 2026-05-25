# CLAUDE.md — Instructions permanentes pour toutes les sessions

## 📌 Règle absolue : tenir les fichiers de suivi à jour

**À chaque fin de session (ou dès qu'une décision importante est prise), mettre à jour :**

1. **`status.md`** — État actuel du projet (ce qui est fait, ce qui reste)
2. **`CONTEXT.md`** — Décisions d'architecture, pièges connus, variables d'env, services déployés
3. **`docs/sessions.md`** — Historique des sessions (ajouter une entrée à chaque session)

Ces fichiers sont la mémoire du projet entre les sessions. Sans eux, chaque session repart de zéro.

---

## 🏗️ Architecture actuelle

```
Vercel                       → Frontend Next.js (le site)
Railway (captivating-embrace) → Worker Python CS2
Supabase                     → PostgreSQL + Auth + Realtime
Cloudflare R2                → Storage (démos .dem + clips MP4 Phase 2)
```

**⚠️ Railway n'héberge QUE le worker.** Le frontend est sur Vercel uniquement.

---

## 📋 Conventions du projet

- Langage UI : **français**
- Branch de travail : créée automatiquement par Claude Code (`claude/xxx-yyy-ZZZZ`)
- Toujours merger dans `master` et ne pas laisser de branches orphelines
- Le `pnpm-workspace.yaml` doit toujours avoir `packages: ['.']`
- Les variables R2/Supabase ne sont jamais dans le code, uniquement dans Railway/Vercel

---

## 📂 Fichiers clés à lire en début de session

1. `CLAUDE.md` (ce fichier)
2. `status.md` — ce qui est fait / ce qui reste
3. `CONTEXT.md` — architecture, pièges, schéma DB
4. `docs/sessions.md` — historique des sessions
