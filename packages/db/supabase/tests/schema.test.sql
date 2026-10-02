-- Behaviour and privilege checks for the base schema. Run with `pnpm --filter @games/db db:test`.
begin;
select plan(19);

-- Sign-ups create profiles.
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"full_name":"Alice Liddell"}', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', '{}', 'authenticated', 'authenticated');

select is((select count(*)::int from public.profiles), 2, 'sign-up creates a profile');
select is(
  array(select display_name from public.profiles order by id),
  array['Alice Liddell', 'bob'],
  'display name comes from the provider name, else the email prefix'
);

-- The game server records matches.
set local role service_role;
select isnt(public.record_match('{
  "gameId":"liars-dice","gameVersion":1,
  "startedAt":"2026-10-02T10:00:00Z","endedAt":"2026-10-02T10:10:00Z",
  "players":[
    {"userId":"11111111-1111-1111-1111-111111111111","name":"Alice","rank":1,"score":10,"stats":{}},
    {"userId":null,"name":"GuestFox","rank":2,"score":7,"stats":{}},
    {"userId":"22222222-2222-2222-2222-222222222222","name":"bob","rank":3,"score":3,"stats":{}}
  ]}'::jsonb), null, 'service role records a match');
select isnt(public.record_match('{
  "gameId":"liars-dice","gameVersion":1,
  "startedAt":"2026-10-02T11:00:00Z","endedAt":"2026-10-02T11:10:00Z",
  "players":[
    {"userId":"22222222-2222-2222-2222-222222222222","name":"bob","rank":1,"score":12,"stats":{}},
    {"userId":"11111111-1111-1111-1111-111111111111","name":"Alice","rank":2,"score":4,"stats":{}}
  ]}'::jsonb), null, 'service role records a second match');
select results_eq(
  'select user_id::text, games, wins, best_score from public.leaderboard_stats order by user_id',
  $$values ('11111111-1111-1111-1111-111111111111', 2, 1, 10), ('22222222-2222-2222-2222-222222222222', 2, 1, 12)$$,
  'leaderboards accumulate games, wins and best score; guests are excluded'
);
reset role;

-- Clients: exact privileges.
select is(
  (select string_agg(grantee || ':' || table_name || ':' || privilege_type, ' ' order by grantee, table_name, privilege_type)
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')),
  'anon:app_settings:SELECT anon:game_results:SELECT anon:leaderboard_stats:SELECT anon:products:SELECT anon:profiles:SELECT '
  'authenticated:app_settings:SELECT authenticated:entitlement_grants:SELECT authenticated:game_results:SELECT '
  'authenticated:leaderboard_stats:SELECT authenticated:products:SELECT authenticated:profiles:SELECT',
  'client roles can only read, and anon cannot read grants'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'id', 'update'),
  'users may edit profile fields but not the id'
);
select ok(
  not has_schema_privilege('anon', 'private', 'usage')
  and not has_schema_privilege('authenticated', 'private', 'usage'),
  'private schema is unreachable from clients'
);

-- anon
set local role anon;
select is((select count(*)::int from public.game_results), 2, 'anon reads match history');
select throws_ok($$select public.record_match('{}'::jsonb)$$, '42501', null, 'anon cannot call record_match');
select throws_ok(
  $$insert into public.game_results (game_id, game_version, started_at, ended_at, players) values ('x', 1, now(), now(), '[]')$$,
  '42501', null, 'anon cannot write results'
);
reset role;

-- authenticated as Alice
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update public.profiles set display_name = 'Alice L' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'hacked' where id = '22222222-2222-2222-2222-222222222222';
select is(
  array(select display_name from public.profiles order by id),
  array['Alice L', 'bob'],
  'users edit their own profile only'
);
select throws_ok(
  $$select public.get_access('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'clients cannot call get_access'
);
select throws_ok(
  $$insert into public.leaderboard_stats (game_id, user_id, wins) values ('liars-dice', '11111111-1111-1111-1111-111111111111', 999)$$,
  '42501', null, 'clients cannot write leaderboards'
);
reset role;

-- Grants and access.
insert into public.products (sku, is_paid, price_cents) values ('feature:liars-dice:wild-ones', true, 199);
insert into public.entitlement_grants (user_id, sku, reason)
values ('11111111-1111-1111-1111-111111111111', 'feature:liars-dice:wild-ones', 'test');

set local role service_role;
select is(
  public.get_access('11111111-1111-1111-1111-111111111111'),
  '{"ownedSkus":["feature:liars-dice:wild-ones"],"lifetimeSpendCents":0}'::jsonb,
  'get_access returns owned SKUs'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.entitlement_grants), 0, 'users cannot see other users'' grants');
reset role;

-- Account deletion.
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select ok(
  not exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111')
  and not exists (select 1 from public.leaderboard_stats where user_id = '11111111-1111-1111-1111-111111111111')
  and not exists (select 1 from public.entitlement_grants where user_id = '11111111-1111-1111-1111-111111111111'),
  'deleting a user removes profile, stats and grants'
);
select results_eq(
  $$select r.started_at, p.ord::int, p.value ->> 'name', p.value ->> 'userId'
    from public.game_results r, jsonb_array_elements(r.players) with ordinality as p(value, ord)
    order by 1, 2$$,
  $$values
    ('2026-10-02T10:00:00Z'::timestamptz, 1, 'Deleted player', null::text),
    ('2026-10-02T10:00:00Z'::timestamptz, 2, 'GuestFox', null),
    ('2026-10-02T10:00:00Z'::timestamptz, 3, 'bob', '22222222-2222-2222-2222-222222222222'),
    ('2026-10-02T11:00:00Z'::timestamptz, 1, 'bob', '22222222-2222-2222-2222-222222222222'),
    ('2026-10-02T11:00:00Z'::timestamptz, 2, 'Deleted player', null)$$,
  'deleted player is anonymized in match history; order and other players are kept'
);
select is(
  (select count(*)::int from public.game_results where '11111111-1111-1111-1111-111111111111' = any(player_ids)),
  0,
  'deleted player is removed from player_ids'
);

select * from finish();
rollback;
