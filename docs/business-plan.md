# Highlight.gg — Business plan & vision

> Rédigé en session 8 (2026-07-06). Hypothèse de départ : le pipeline VM + CS2 headless + ffmpeg
> fonctionne (Phase 0 technique en cours de finalisation, voir `status.md`).
> Cadrage : **side project loisir** — budget ≤ 100 €/mois, objectif = **équilibre financier**, pas de levée, pas de pression de croissance.

---

## 1. Le marché et l'opportunité

- **CS2 ≈ 25-30 M de joueurs actifs/mois**, plus d'un million de joueurs simultanés en permanence.
  Chaque match MM/Premier génère une **démo gratuite téléchargeable** : la matière première est gratuite et infinie.
- **Le problème qu'on résout** : 99 % des joueurs ne clipperont jamais leur ace. Il faut ShadowPlay
  configuré *avant* l'action, ou savoir retrouver le tick dans une démo et faire du montage.
  Le moment de gloire est perdu → frustration universelle et récurrente, à chaque game.
- **Concurrent principal : Allstar.gg** (US, gros, freemium, très orienté Faceit et créateurs).
  Notre différenciation :
  1. **Simplicité radicale** — upload (puis lien de compte Steam) → clips. Pas de client à installer, pas d'overlay.
  2. **MM/casual first** — Allstar brille sur Faceit ; le joueur MM lambda est mal servi.
  3. **FR/EU** — langue, communauté, paiements locaux : un marché que les gros traitent en second.
  4. **Prix plancher assumé** — pas d'investisseurs = pas de pression sur les marges.
- **Timing** : CS2 est jeune, l'outillage communautaire de l'ère CSGO est en cours de reconstruction.
  Fenêtre pour s'installer sur la niche FR/EU casual.

---

## 2. Économie unitaire (la fondation de tout)

Mesuré/estimé sur la VM Scaleway L4 (~0,80 €/h) :

| Poste | Valeur |
|---|---|
| Warm-up CS2 + chargement démo | ~2 min |
| Capture 30-45 s de clip | ~1-3 min |
| ffmpeg + upload R2 | < 1 min |
| **Coût GPU par clip** | **≈ 0,07 – 0,11 €** |
| Socle fixe mensuel (R2 + disque VM stoppée ; Vercel/Supabase free) | **≈ 10-15 €/mois** |

Leviers de rentabilité :
- **Batcher la queue** : une session VM traite tous les clips en attente → warm-up amorti
  (plusieurs clips d'une même démo = un seul chargement).
- **Auto start/stop de la VM** selon la queue Supabase : la VM ne tourne QUE s'il y a du travail.
  C'est un prérequis absolu du modèle — sans ça, 0,80 €/h × 24 h × 30 j = 576 €/mois.

---

## 3. Sources de revenus

De la plus sûre à la plus exploratoire :

| # | Source | Description | Potentiel | Effort |
|---|--------|-------------|-----------|--------|
| 1 | **Abonnement Pro** ~4 €/mois (40 €/an) | 30 clips/mois, 1080p60, sans watermark, formats verticaux, file prioritaire | Cœur du modèle | Faible |
| 2 | **Packs de crédits** 2,50 € / 10 clips | Sans récurrence — clé pour les casual réfractaires à l'abonnement | Complément fort | Faible |
| 3 | **Add-ons one-shot** | Best-of du mois monté auto (2,99 €), rendu 4K, pack « fin de saison » | Panier moyen ↑ | Moyen |
| 4 | **Offre Communauté / Ligue** 15-30 €/mois | Serveurs Discord 5v5, ligues amateurs : clips auto de tous leurs matchs, watermark à LEUR logo, canal Discord dédié | 1 deal = 5 abos Pro | Moyen |
| 5 | **Affiliation** | Liens marketplaces de skins (Skinport…), périphériques gaming sur les pages `/share` (vues par des non-inscrits) | Passif, faible, gratuit | Faible |
| 6 | **Paiement par skins** (phase 3) | Via marketplace tierce — voir § 6 | Différenciant + marketing en soi | Moyen |
| 7 | **API / white-label** | Sites de stats ou coachs qui veulent « générer le clip » en 1 clic | Uniquement si demande inbound | — |

### Grille freemium

- **Gratuit** : 3 clips/mois, 720p30, **watermark "highlight.gg"**, page de partage publique.
  → Le gratuit EST le marketing : coût réel ~0,30 €/user/mois pour une pub permanente sur Discord/TikTok.
- **Pro 4 €/mois** : marge nette ≈ 0,6 € dans le pire cas (30 clips consommés + frais Stripe),
  ≈ 3 € en usage réel (médiane attendue 8-12 clips/mois).
- **Pack 10 clips 2,50 €** : marge ≈ 1,2-1,7 € après Stripe.

### Scénarios (réalistes, pas de hockey stick)

| Scénario | Composition | Revenu/mois | Verdict |
|---|---|---|---|
| **Survie** | 8 Pro | ~32 € | Socle couvert → **objectif « équilibre » atteint dès ~8 payants** ✅ |
| **Confort** | 50 Pro + 20 packs + 2 ligues | ~250 € | GPU à volonté + petit budget concours/prix |
| **Traction** | 200 Pro + 10 ligues | ~1 000 € | Se reposer la question du « side project sérieux » |

---

## 4. Features — le produit comme machine à acquisition

### Socle payant (Phase 1)
1. Quotas free (3 clips/mois) + watermark ffmpeg + compteur en DB
2. Stripe Checkout : abo Pro + packs de crédits
3. **Format vertical 9:16** (recadrage centré joueur) → TikTok/Shorts ready
4. Page `/share/[token]` niveau produit : preview Open Graph vidéo, bouton « Créer les miens », compteur de vues

### Boucle de croissance (Phase 2)
5. **Lien de compte Steam + share codes** : les démos arrivent toutes seules après chaque game
   → « tes clips t'attendent » = LA rétention. Plus d'upload manuel.
6. **Marquage de moment** (v1 du `!csplays`) : bouton « clip ça » web/mobile pendant la game (horodatage
   → le round correspondant est retrouvé dans la démo et priorisé). Le joueur peut aussi taper
   `!csplays` dans le chat pour **l'effet viral** — les 9 autres joueurs voient la commande —
   même si techniquement c'est l'horodatage qui fait foi (aucune interaction avec le client CS2 = zéro risque CGU).
7. **Bot Discord** : commande `/clip`, publication auto des nouveaux clips dans le serveur de la team
   → chaque Discord de team devient un canal de distribution.
8. **Profils publics** `/player/[steamid]` avec les meilleurs clips → SEO + fierté + partage.
9. Notifications email/Discord : « ton ace d'hier soir est prêt 🔥 »

### Différenciation & rétention (Phase 3)
10. **Best-of automatique** : montage multi-clips du mois, transitions + musique libre → add-on one-shot.
11. **Overlay kill-feed + sous-titres auto** sur les verticaux (les clips « nus » performent mal sur TikTok).
12. **Clip of the Week** : votes communautaires, le gagnant remporte un petit skin (10-20 €)
    → UGC, rétention, engagement récurrent pour le prix d'un kebab.
13. **Wrapped de fin d'année** (« ton année CS2 : 43 aces, ton meilleur clutch… ») → viral gratuit, coût quasi nul.
14. **Paiement par skins** (voir § 6).
15. Intégration Faceit (webhooks) **si la demande remonte** — ne pas attaquer Allstar frontalement sur son terrain.

---

## 5. Marketing — budget ~0 €, le produit se distribue lui-même

**Principe : chaque clip généré est une pub.** Trois boucles produit :
1. **Watermark** sur les clips free partagés → « c'est quoi cet outil ? »
2. **`!csplays` dans le chat** → 9 spectateurs par usage, dans le contexte exact où le produit est pertinent
3. **Pages `/share` + profils publics** → porte d'entrée web indexable

**Actions concrètes, dans l'ordre :**
1. **Lancement Reddit** — r/GlobalOffensive + r/cs2 (« I built a tool that turns your MM demos into
   clips automatically ») avec un clip démo irréprochable. Un seul bon post peut amener 1-2k visiteurs.
   Décliner sur jeuxvideo.com / forums & Discord FR.
2. **Compte TikTok/Shorts maison** — republier les meilleurs clips des utilisateurs (opt-in) :
   le contenu se crée tout seul, le watermark fait le reste. 3 posts/semaine, zéro tournage.
3. **Partenariats Discord FR** — offrir l'offre Communauté gratuite 3 mois aux ~10 plus gros serveurs
   5v5 / ligues amateurs FR → distribution ciblée immédiate.
4. **Micro-influenceurs CS FR** (5-50k) — Pro gratuit à vie contre une mention honnête. Coût : 0 €.
5. **Concours Clip of the Week** — prix en skin, engagement récurrent.
6. **SEO longue traîne** — profils publics + pages « meilleurs clips [map] » générées depuis le contenu existant.

**Anti-patterns à éviter** : pub payante (CAC > LTV garanti à nos prix) ; démarcher les pros/orgs
(cycle long, exigences élevées, hors cible).

**KPIs à suivre dès le jour 1** :
coût GPU/clip réel · taux de partage des clips · visiteurs venus d'une page `/share` (K-factor) ·
conversion free→payant · churn mensuel · % de démos auto-fetch vs upload manuel.

---

## 6. Paiement par trade de skins (l'idée différenciante)

**Pourquoi c'est pertinent pour la cible** : le joueur casual a souvent 5-20 € de skins (drops)
et zéro envie de sortir la CB pour 4 €. Payer avec un skin = coût perçu quasi nul → friction de
conversion minimale. Et « paie ton abo avec un drop » est un angle marketing très partageable.

**Comment le faire sans se brûler** :
- ❌ Bot de trade maison : marge max, mais risque de ban du compte bot (CGU Valve), gestion de la
  volatilité des prix, charge opérationnelle. Non compatible « side project loisir ».
- ✅ **Marketplace tierce** (Skinport, SkinBaron, passerelle skins→fiat) : commission 5-15 %,
  mais zéro risque de ban et zéro gestion de stock. Le joueur vend son skin sur la marketplace,
  le solde paie l'abonnement (ou lien d'affiliation + code promo équivalent).
- **Quand** : phase 3, uniquement une fois qu'il existe des payants Stripe (preuve de demande d'abord).

---

## 7. Risques & garde-fous

| Risque | Réalité | Mitigation |
|--------|---------|------------|
| Allstar passe MM-first/EU | Possible | Vitesse d'exécution, niche FR, prix plancher, relation communauté directe |
| CGU Valve (skins, chat) | Zone grise réelle | Skins via marketplace tierce uniquement ; `!csplays` v1 = horodatage, aucune interaction avec le client CS2 |
| Coût GPU si pic viral | Bon problème | Queue plafonnée pour les free ; la file prioritaire payante absorbe ; hard cap budget 100 €/mois |
| Valve change le format démo | Déjà vécu (CSGO→CS2) | Le parsing est isolé dans le worker : un seul composant à adapter |
| **Burnout side project** | **Le vrai risque n°1** | Une feature à la fois ; chaque phase rentable avant la suivante ; kill switch VM |

**Garde-fous « side project loisir »** :
- Jamais plus d'une feature en cours à la fois.
- Chaque phase doit être à l'équilibre avant d'attaquer la suivante.
- Hard cap : si coûts > 100 €/mois sans revenus en face → pause et analyse.
- La VM ne tourne QUE quand il y a une queue.

---

## 8. Roadmap consolidée

| Phase | Contenu | Critère de sortie |
|---|---|---|
| **0 — Finir le pipeline** (en cours) | startmovie/netcon, auto start/stop VM, fiabilisation (retry, steamid manquants) | 10 clips d'affilée sans intervention |
| **1 — Monétiser** | Quotas + watermark, Stripe (Pro 4 € + packs), vertical 9:16, page /share soignée. Lancement Reddit + TikTok maison | **8 payants = équilibre atteint** |
| **2 — Boucle de croissance** | Share codes auto-fetch, marquage de moment (!csplays v1), bot Discord, profils publics, offre Communauté | 50 % des clips issus de démos auto-fetch |
| **3 — Différencier** | Best-of auto, overlays verticaux, Clip of the Week, paiement skins, Wrapped | Conversion ou panier moyen en hausse mesurable |
