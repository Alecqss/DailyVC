-- ============================================================
--  Migration 002 — Corriger le type 'ace' → 'multikill_ace'
--
--  PROBLÈME :
--    La migration 001 a créé la contrainte CHECK avec la valeur
--    'ace', mais le frontend (types.ts) et le worker utilisent
--    'multikill_ace' partout.  Sans ce fix, tout INSERT de type
--    ACE côté worker échoue silencieusement.
--
--  À APPLIQUER dans Supabase → SQL Editor → Run.
-- ============================================================

-- 1. Supprimer l'ancienne contrainte
alter table public.highlights
  drop constraint if exists highlights_type_check;

-- 2. Recréer avec les valeurs correctes (alignées sur types.ts)
alter table public.highlights
  add constraint highlights_type_check check (type in (
    'multikill_2k',
    'multikill_3k',
    'multikill_4k',
    'multikill_ace',   -- ← corrigé (était 'ace')
    'clutch_1v1',
    'clutch_1v2',
    'clutch_1v3',
    'clutch_1v4',
    'clutch_1v5',
    'knife'
  ));
