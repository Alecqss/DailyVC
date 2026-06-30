-- ============================================================
--  Highlight.gg — Migration 004 : joueur d'un highlight
--
--  Stocke le steamid (steamid64) du joueur qui a réalisé le
--  highlight. Le renderer s'en sert pour verrouiller la caméra
--  sur ce joueur en première personne (spec_lock_to_accountid).
--
--  Nullable : les highlights déjà en base n'ont pas l'info, et
--  certains clutchs gagnés sans frag (défuse/temps) restent sans
--  joueur identifié.
--
--  À appliquer dans Supabase → SQL Editor.
-- ============================================================

alter table public.highlights
  add column if not exists player_steamid text;
