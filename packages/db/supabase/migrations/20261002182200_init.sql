-- Initial schema: profiles, monetization config (dormant), match results, leaderboards.
-- Live game/lobby state never touches the database; only finished matches are written,
-- by the game server using the service role.
--
-- New tables are not exposed to the Data API automatically, so every table gets explicit
-- grants below, and RLS on every table decides which rows each role can see.

-- Functions that must bypass RLS live in an unexposed schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ─── profiles ────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint display_name_length check (char_length(display_name) between 1 and 32)
);

create unique index profiles_username_key on public.profiles (lower(username));

alter table public.profiles enable row level security;

create policy "Profiles are public"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Create a profile for every new auth user (Google or email sign-up).
-- The name from the identity provider is only a display default, never used for authorization.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    'player_' || substr(replace(new.id::text, '-', ''), 1, 12),
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1),
      'Player'
    ), 32),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ─── monetization config (dormant: monetization_enabled = false) ─────────────

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy "Settings are public"
  on public.app_settings for select
  to anon, authenticated
  using (true);

insert into public.app_settings (key, value) values
  ('monetization_enabled', 'false'),
  ('unlock_all_threshold_cents', 'null'),
  ('host_pass_public', 'false');

-- A SKU with no row here is free.
create table public.products (
  sku text primary key,
  price_cents integer not null default 0,
  is_paid boolean not null default false,
  active boolean not null default true,
  lobby_access text not null default 'host',
  updated_at timestamptz not null default now(),
  constraint sku_format check (sku ~ '^(game:[a-z0-9-]+|feature:[a-z0-9-]+:[a-z0-9-]+)$'),
  constraint price_nonnegative check (price_cents >= 0),
  constraint lobby_access_values check (lobby_access in ('host', 'everyone'))
);

alter table public.products enable row level security;

create policy "Products are public"
  on public.products for select
  to anon, authenticated
  using (true);

-- Manual grants (comps, promos, testing). Purchases join this in the Stripe phase.
create table public.entitlement_grants (
  user_id uuid not null references public.profiles (id) on delete cascade,
  sku text not null references public.products (sku) on update cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (user_id, sku)
);

alter table public.entitlement_grants enable row level security;

create policy "Users see their own grants"
  on public.entitlement_grants for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ─── match results & leaderboards ────────────────────────────────────────────

-- One row per finished match. `players` is
-- [{ "userId": uuid|null, "name": text, "rank": int, "score": int|null, "stats": {} }]
-- with userId null for guests. `player_ids` mirrors the registered players for indexing.
create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  game_version integer not null,
  mode text,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  players jsonb not null,
  player_ids uuid[] not null default '{}',
  constraint players_is_array check (jsonb_typeof(players) = 'array'),
  constraint ended_after_started check (ended_at >= started_at)
);

create index game_results_game_ended_idx on public.game_results (game_id, ended_at desc);
create index game_results_player_ids_idx on public.game_results using gin (player_ids);

alter table public.game_results enable row level security;

-- Match history appears on public profiles, so results are publicly readable.
-- Only guest nicknames and registered players' public ids are stored.
create policy "Results are public"
  on public.game_results for select
  to anon, authenticated
  using (true);

create table public.leaderboard_stats (
  game_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  games integer not null default 0,
  wins integer not null default 0,
  best_score integer,
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create index leaderboard_stats_wins_idx on public.leaderboard_stats (game_id, wins desc);
create index leaderboard_stats_user_idx on public.leaderboard_stats (user_id);

alter table public.leaderboard_stats enable row level security;

create policy "Leaderboards are public"
  on public.leaderboard_stats for select
  to anon, authenticated
  using (true);

-- ─── account deletion ────────────────────────────────────────────────────────

-- Deleting an auth user cascades to profiles. Before the profile goes, anonymize the user's
-- entries in match history so other players' results stay intact.
create function private.anonymize_deleted_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.game_results r
  set
    players = (
      select jsonb_agg(
        case when p ->> 'userId' = old.id::text
          then p || '{"userId": null, "name": "Deleted player"}'::jsonb
          else p
        end
        order by ord
      )
      from jsonb_array_elements(r.players) with ordinality as e(p, ord)
    ),
    player_ids = array_remove(r.player_ids, old.id)
  where r.player_ids @> array[old.id];
  return old;
end;
$$;

create trigger on_profile_deleted
  before delete on public.profiles
  for each row execute function private.anonymize_deleted_player();

-- ─── game server API (service role only) ─────────────────────────────────────

-- Records a finished match and updates leaderboards in one round trip.
-- Runs as the caller (service_role, which bypasses RLS); not callable by clients.
create function public.record_match(result jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  match_id uuid;
begin
  if jsonb_typeof(result -> 'players') is distinct from 'array' then
    raise exception 'record_match: players must be an array';
  end if;

  insert into public.game_results (game_id, game_version, mode, started_at, ended_at, players, player_ids)
  values (
    result ->> 'gameId',
    (result ->> 'gameVersion')::integer,
    result ->> 'mode',
    (result ->> 'startedAt')::timestamptz,
    (result ->> 'endedAt')::timestamptz,
    result -> 'players',
    array(
      select distinct (p ->> 'userId')::uuid
      from jsonb_array_elements(result -> 'players') p
      where p ->> 'userId' is not null
    )
  )
  returning id into match_id;

  -- Registered players only; a player who deleted their account mid-match is skipped.
  insert into public.leaderboard_stats as s (game_id, user_id, games, wins, best_score)
  select
    result ->> 'gameId',
    pr.id,
    1,
    case when (p ->> 'rank')::integer = 1 then 1 else 0 end,
    (p ->> 'score')::integer
  from jsonb_array_elements(result -> 'players') p
  join public.profiles pr on pr.id = (p ->> 'userId')::uuid
  on conflict (game_id, user_id) do update set
    games = s.games + 1,
    wins = s.wins + excluded.wins,
    best_score = greatest(s.best_score, excluded.best_score),
    updated_at = now();

  return match_id;
end;
$$;

-- What a player owns, for the game server's access checks. Purchases are added in the
-- Stripe phase; until then lifetime spend is always 0.
create function public.get_access(user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ownedSkus', coalesce((
      select jsonb_agg(g.sku)
      from public.entitlement_grants g
      where g.user_id = get_access.user_id
    ), '[]'::jsonb),
    'lifetimeSpendCents', 0
  );
$$;

revoke execute on function public.record_match(jsonb) from public, anon, authenticated;
revoke execute on function public.get_access(uuid) from public, anon, authenticated;
grant execute on function public.record_match(jsonb) to service_role;
grant execute on function public.get_access(uuid) to service_role;

-- ─── table privileges ────────────────────────────────────────────────────────

-- Older stacks grant client roles everything on new tables by default; newer ones grant
-- nothing. Start from nothing in both cases, then grant exactly what the policies above use.
revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.profiles,
  public.app_settings,
  public.products,
  public.game_results,
  public.leaderboard_stats
to anon, authenticated;

grant select on public.entitlement_grants to authenticated;

-- Column-level: users can edit their profile but never its id or created_at.
grant update (username, display_name, avatar_url) on public.profiles to authenticated;

-- The game server and server-side routes use the service role, which bypasses RLS.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
