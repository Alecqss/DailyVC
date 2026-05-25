-- ============================================================
--  Highlight.gg — Migration 003 : statut de rendering des clips
--
--  Permet de mettre un clip en file d'attente avant que le
--  renderer GPU ne l'ait généré.
--
--  À appliquer dans Supabase → SQL Editor.
-- ============================================================

-- Le storage_path n'est pas connu tant que le clip n'est pas rendu
alter table public.clips alter column storage_path drop not null;

-- Statut du rendering : pending → rendering → done (ou error)
alter table public.clips
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'rendering', 'done', 'error')),
  add column if not exists progress int not null default 0
    check (progress between 0 and 100),
  add column if not exists error_message text;

create index if not exists clips_status_idx on public.clips(status);
