-- ============================================================
--  Highlight.gg — Migration initiale (référence exacte)
--  ⚠️  DÉJÀ APPLIQUÉE sur le projet Supabase.
--  Ce fichier sert de documentation — ne pas rejouer.
-- ============================================================

-- ─── 1. PROFILES ─────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  cs2_username    text,
  notify_email    boolean not null default true,
  created_at      timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── 2. DEMOS ─────────────────────────────────────────────────
create table if not exists public.demos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  filename        text not null,
  storage_path    text not null,
  status          text not null default 'uploaded'
                  check (status in ('uploaded','parsing','rendering','done','error')),
  progress        int  not null default 0 check (progress between 0 and 100),
  map_name        text,
  match_date      timestamptz,
  action_types    text[] not null default array['multikill','clutch','knife'],
  pre_seconds     int  not null default 10,
  post_seconds    int  not null default 5,
  error_message   text,
  created_at      timestamptz not null default now()
);

create index if not exists demos_user_id_idx on public.demos(user_id);
create index if not exists demos_status_idx  on public.demos(status);

-- ─── 3. HIGHLIGHTS ────────────────────────────────────────────
-- ⚠️  NOTE : la valeur 'ace' dans ce CHECK est incorrecte.
--     Le frontend utilise 'multikill_ace'. Voir migration 002.
create table if not exists public.highlights (
  id              uuid primary key default gen_random_uuid(),
  demo_id         uuid not null references public.demos(id) on delete cascade,
  type            text not null
                  check (type in (
                    'multikill_2k','multikill_3k','multikill_4k','ace',
                    'clutch_1v1','clutch_1v2','clutch_1v3','clutch_1v4','clutch_1v5',
                    'knife'
                  )),
  tick_start      int  not null,
  tick_end        int  not null,
  round           int  not null,
  kills           int  not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists highlights_demo_id_idx on public.highlights(demo_id);

-- ─── 4. CLIPS ─────────────────────────────────────────────────
create table if not exists public.clips (
  id              uuid primary key default gen_random_uuid(),
  highlight_id    uuid not null references public.highlights(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  storage_path    text not null,
  share_token     text not null unique default replace(gen_random_uuid()::text, '-', ''),
  is_public       boolean not null default false,
  duration_sec    int,
  created_at      timestamptz not null default now()
);

create index if not exists clips_user_id_idx     on public.clips(user_id);
create index if not exists clips_share_token_idx on public.clips(share_token);

-- ─── 5. ROW LEVEL SECURITY ────────────────────────────────────
alter table public.profiles  enable row level security;
alter table public.demos      enable row level security;
alter table public.highlights enable row level security;
alter table public.clips      enable row level security;

create policy "profiles: own read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: own update" on public.profiles for update using (auth.uid() = id);
create policy "profiles: own insert" on public.profiles for insert with check (auth.uid() = id);

create policy "demos: own all" on public.demos
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "highlights: via demo" on public.highlights
  using (
    exists (
      select 1 from public.demos
      where demos.id = highlights.demo_id
        and demos.user_id = auth.uid()
    )
  );

create policy "clips: public read" on public.clips
  for select using (is_public = true or auth.uid() = user_id);

create policy "clips: own write" on public.clips
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── 6. REALTIME ──────────────────────────────────────────────
alter publication supabase_realtime add table public.demos;
alter publication supabase_realtime add table public.clips;

-- ─── 7. STORAGE BUCKETS ───────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('demos', 'demos', false, 524288000, null)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clips', 'clips', true, 524288000, array['video/mp4', 'video/webm'])
on conflict (id) do nothing;

create policy "demos storage: own upload" on storage.objects for insert
  with check (bucket_id = 'demos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "demos storage: own read" on storage.objects for select
  using (bucket_id = 'demos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "demos storage: own delete" on storage.objects for delete
  using (bucket_id = 'demos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "clips storage: public read" on storage.objects for select
  using (bucket_id = 'clips');

create policy "clips storage: service write" on storage.objects for insert
  with check (bucket_id = 'clips');
