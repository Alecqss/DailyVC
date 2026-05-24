-- ── Highlight.gg — Initial schema ────────────────────────────────────────────
-- Run this in the Supabase SQL editor or via the CLI.

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";  -- gen_random_uuid()


-- ── profiles ──────────────────────────────────────────────────────────────────
-- One row per auth.users entry, created automatically via trigger.
create table if not exists public.profiles (
  id             uuid primary key references auth.users on delete cascade,
  cs2_username   text,
  notify_email   boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── demos ──────────────────────────────────────────────────────────────────────
create table if not exists public.demos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  filename       text not null,
  storage_path   text not null,
  status         text not null default 'uploaded'
                   check (status in ('uploaded','parsing','rendering','done','error')),
  progress       integer not null default 0 check (progress between 0 and 100),
  map_name       text,
  match_date     date,
  action_types   text[],          -- e.g. ['multikill_3k','knife']
  pre_seconds    integer,
  post_seconds   integer,
  error_message  text,
  created_at     timestamptz not null default now()
);

create index if not exists demos_user_id_idx    on public.demos (user_id);
create index if not exists demos_status_idx     on public.demos (status);


-- ── highlights ────────────────────────────────────────────────────────────────
create table if not exists public.highlights (
  id          uuid primary key default gen_random_uuid(),
  demo_id     uuid not null references public.demos on delete cascade,
  type        text not null,
  tick_start  integer not null,
  tick_end    integer not null,
  round       integer not null default 0,
  kills       integer not null default 1,
  created_at  timestamptz not null default now()
);

create index if not exists highlights_demo_id_idx on public.highlights (demo_id);


-- ── clips ─────────────────────────────────────────────────────────────────────
create table if not exists public.clips (
  id             uuid primary key default gen_random_uuid(),
  highlight_id   uuid not null references public.highlights on delete cascade,
  user_id        uuid not null references auth.users on delete cascade,
  storage_path   text not null,
  share_token    text not null unique default encode(gen_random_bytes(12), 'hex'),
  is_public      boolean not null default false,
  duration_sec   integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists clips_user_id_idx      on public.clips (user_id);
create index if not exists clips_share_token_idx  on public.clips (share_token);


-- ── Row Level Security ────────────────────────────────────────────────────────

alter table public.profiles  enable row level security;
alter table public.demos      enable row level security;
alter table public.highlights enable row level security;
alter table public.clips      enable row level security;

-- profiles: users see/edit only their own
create policy "profiles: own row" on public.profiles
  for all using (auth.uid() = id);

-- demos: users see/edit only their own
create policy "demos: own rows" on public.demos
  for all using (auth.uid() = user_id);

-- highlights: readable if the parent demo belongs to the user
create policy "highlights: via demo ownership" on public.highlights
  for select using (
    exists (
      select 1 from public.demos d
      where d.id = demo_id and d.user_id = auth.uid()
    )
  );

-- clips: readable by owner or if public
create policy "clips: owner or public" on public.clips
  for select using (
    user_id = auth.uid() or is_public = true
  );

create policy "clips: own rows write" on public.clips
  for all using (auth.uid() = user_id);


-- ── Storage buckets (run once in Dashboard if not already created) ─────────────
-- Bucket "demos"  → private, only authenticated users can upload
-- Bucket "clips"  → public,  anyone can read; authenticated users upload

insert into storage.buckets (id, name, public)
values ('demos', 'demos', false)
on conflict do nothing;

insert into storage.buckets (id, name, public)
values ('clips', 'clips', true)
on conflict do nothing;

-- Storage policies for demos bucket
create policy "demos storage: authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'demos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "demos storage: owner read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'demos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "demos storage: owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'demos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Storage policies for clips bucket (public read)
create policy "clips storage: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'clips');

create policy "clips storage: authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'clips');
