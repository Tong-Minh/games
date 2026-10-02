# Architecture

A web platform where players create public or private lobbies and play games from a growing catalog. Each game is a self-contained package; the platform owns everything around gameplay.

**Priorities, in order:** fast game development → low monthly hosting cost → low runtime footprint (CPU, memory, bandwidth per room).

---

## 1. Stack

| Piece | Choice | Why / cost notes |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Dev-only tooling; no runtime cost. |
| Web app | Next.js (App Router, TypeScript), Tailwind, deployed to Vercel | Mostly static/ISR pages. Data is read client-side from Supabase under RLS, so serverless invocations stay rare. Server routes only where a secret is needed (auth callback, account deletion, later Stripe). Vercel Hobby is non-commercial; move to Pro before monetizing. |
| Game server | Colyseus (Node/TypeScript) on one Fly.io machine (shared-cpu-1x, 512 MB) | Vercel can't hold long-lived WebSockets. `auto_stop`/`auto_start` scales to zero when nobody is connected. No Redis until a second instance is needed. |
| Auth + DB | Supabase (Auth, Postgres, RLS) | Free tier. One DB write per finished match; nothing during gameplay. |
| Payments | Stripe Checkout + webhooks (later phase) | Webhooks are the only writer of purchases. |
| Game clients | React (card, board, party games) or Phaser 4 (real-time/canvas), lazy-loaded | Phaser only downloads when a Phaser game is opened. |

Library versions are pinned to the latest stable release at scaffold time.

## 2. Repository layout

```
apps/web                 Next.js app: catalog, profiles, leaderboards, lobby browser, game shell
apps/game-server         Colyseus server; imports the generated games registry
packages/game-sdk        defineManifest(), defineGame(), platform GameRoom, client shell types, PhaserCanvas
packages/games/<id>      manifest.ts | server.ts | client.tsx | test/
packages/shared          entitlement logic (pure function), zod config schemas, shared types
packages/db              supabase/ (migrations, seed), generated types, query helpers
templates/game           template copied by `pnpm new-game <id>`
scripts/                 new-game.ts, gen-registry.ts
docs/                    this file
```

### Adding a game never touches platform code

- `pnpm new-game <id>` copies `templates/game` to `packages/games/<id>`, fills in the id and name, and regenerates the registry.
- `scripts/gen-registry.ts` scans `packages/games/*` and writes:
  - `apps/game-server/src/games.gen.ts`: every game's server module.
  - `apps/web/src/games.gen.ts`: every manifest, plus a `next/dynamic` import of every client module.
- The registry is regenerated on `predev` and `prebuild`. Generated files are committed so builds are reproducible.

### Three entry points per game

| File | Imported by | Contents |
|---|---|---|
| `manifest.ts` | everything | Pure data. Safe to import anywhere, including the catalog. |
| `server.ts` | game server only | `defineGame({...})`: state schema, setup, message handlers, end condition. |
| `client.tsx` | web app only, lazy | The game's UI component. |

Game packages are consumed as TypeScript source: `transpilePackages` in Next.js, `tsx` on the game server. There is no per-game build step.

## 3. Game SDK contract

Games don't subclass a Colyseus Room. They export a definition object, and the platform's single `GameRoom` runs it. That keeps lobby, chat, host and reconnection logic out of reach of game code. It also means game logic can be unit-tested without sockets.

```ts
// manifest.ts
export default defineManifest({
  id: 'liars-dice',
  name: "Liar's Dice",
  description: 'Bluff about the dice under your cup.',
  thumbnail: './thumb.png',
  version: 1,                          // bump on any protocol/state change
  minPlayers: 2,
  maxPlayers: 6,
  tier: 'free',                        // default only; the products table overrides
  features: [
    { id: 'wild-ones', scope: 'lobby' },   // applies to the whole lobby
    { id: 'gold-dice', scope: 'player' },  // per player (cosmetic)
  ],
  settings: z.object({ startingDice: z.number().min(3).max(6).default(5) }),
  realtime: false,                     // true → fixed tick; false → event-driven
});

// server.ts
export default defineGame({
  State: LiarsDiceState,               // Colyseus Schema; @view() for hidden fields
  setup(ctx) {},                       // ctx: state, players, settings, features, rng, clock
  messages: {
    bid: {
      schema: z.object({ count: z.number().int(), face: z.number().int().min(1).max(6) }),
      handle(ctx, player, msg) {},
    },
  },
  tick: undefined,                     // (ctx, dtMs) => void, only when realtime
  onPlayerLeave(ctx, player) {},       // forfeit / skip rule; reconnection is handled by the platform
  isOver(ctx) { return null },         // Results | null, checked after every message and tick
});

// client.tsx: rendered inside the platform's game shell
export default function Game({ state, me, players, send, settings, features }: GameProps<LiarsDiceState>) {}
```

**The platform `GameRoom` owns:**
- Lobby phase, chat, ready-up and host controls (kick, change settings, start).
- Host migration and reconnection (30-second window).
- Message validation and rate limiting.
- Entitlement checks.
- The results screen, and writing results with `record_match`.

**Testing:** game logic is tested by calling `setup`, the handlers and `isOver` directly on a state object. Each game also gets one smoke test through `@colyseus/testing`.

**Escape hatch:** an optional `hooks` field exposes raw room lifecycle callbacks for unusual games. Use it sparingly. If several games need the same hook, promote it into the SDK.

**Phaser games** render `<PhaserCanvas scenes={...} />` from the SDK inside their client component. It creates and destroys the Phaser instance with the component, and passes room state and `send` into the scene.

## 4. Lobbies

- **One Colyseus room per lobby.** The lobby phase and the match run in the same room, so there is no hand-off between rooms. "Play again" resets game state in place.
- **Public lobby browser:**
  - The web app calls `GET /lobbies?game=&minSlots=&players=` on the game server. This is plain HTTP, filtered from Colyseus room metadata.
  - It polls every 10 seconds while the tab is visible, which avoids holding an idle WebSocket per browsing user.
- **Private lobbies:**
  - The room is marked private and gets a 6-character join code (Crockford base32, no ambiguous characters).
  - The invite link is `/join/<CODE>`.
  - Join-by-code is rate-limited per IP to prevent code enumeration.
- **Host controls:**
  - The host can kick players, change settings and start the game.
  - Kicked players go on a per-room ban list.
  - If the host leaves, host passes to the longest-connected player, preferring one who owns the game (see §6).
- **Room lifetime:**
  - Empty rooms are disposed immediately.
  - A lobby that never starts is disposed after 15 minutes idle.
  - Each process has a hard cap on rooms.
- **Version check:** room metadata carries the game's manifest `version`. A client with a mismatched version is told to reload.

## 5. Accounts and guests

**Signing in is optional.** Anyone can play without an account. An account keeps stats, match history and leaderboard placement (and later, purchases).

### Sign-in
- Google OAuth.
- Email + password, with email confirmation and password reset.
- Both are Supabase Auth. The web app uses `@supabase/ssr` cookies, and the game server verifies Supabase JWTs locally with `jose` against the project's JWKS. Keys are cached, so there is no network call per join.

### Account deletion
Profile → Danger zone, behind a typed confirmation.
1. A Next.js server route verifies the session and calls `auth.admin.deleteUser` with the service role. The service-role key only exists server-side.
2. `profiles` and `leaderboard_stats` rows are deleted by cascade.
3. A trigger anonymizes the user's entries in `game_results.players` to `{ userId: null, name: "Deleted player" }`, so other players' match history stays intact.
4. (Stripe phase) `purchases.user_id` is set to null rather than deleted, because those records are needed for accounting.
5. If the user is connected to a room, the game server drops the session.

### Guests: ephemeral, no stats saved
- Guests pick a nickname and play free games, and host-owned paid games where config allows (§6).
- The game server issues a short-lived signed guest token. Guests create no `auth.users` row and cause no database writes.
- Results show on the end screen but aren't stored. The results screen offers "Sign up to keep your stats".
- *Considered and rejected for now:* Supabase anonymous sign-in. It would let guest history carry over on sign-up, but it creates a database row and needs a cleanup job for every visitor.

## 6. Monetization and entitlements

### Status: built in, switched off
One flag controls all of it: `app_settings.monetization_enabled`, mirrored as `NEXT_PUBLIC_MONETIZATION_ENABLED` for the UI. While it's `false` (the default):
- `canAccess()` returns true for everything.
- The game server skips ownership checks.
- The web app shows **no** prices, lock icons, "paid" badges or buy buttons.

The code paths, tables and tests exist, and tests run with the flag on. Turning monetization on is a configuration change, not a rewrite.

### Rules
- **SKUs:** `game:<gameId>` and `feature:<gameId>:<featureId>`.
- **Access rule** (one pure function, `canAccess` in `packages/shared`, used by both the game server and the web app; the database only reports what a player owns, through `get_access(user_id)`): a player can use a SKU if it is free, **or** they purchased it and it wasn't refunded, **or** they hold a manual grant, **or** their lifetime net spend is ≥ `app_settings.unlock_all_threshold_cents`.
- **Configuration is data, not code:**
  - `products(sku, price_cents, is_paid, active, lobby_access)` and `app_settings` are the source of truth.
  - Edit them in the Supabase dashboard for now; an admin UI comes later.
  - A sync script inserts default rows from manifests for new games and never overwrites existing rows.
- **Enforcement is server-side only:**
  - The game server checks access on room create, join, settings change and game start. It fetches access once per join through an RPC and caches it for the room's lifetime.
  - The web UI only reflects locked state.
  - RLS blocks clients from writing anything entitlement-related.

### Decision: mixed lobbies

| Option | Pros | Cons |
|---|---|---|
| A. Every player must own the game | Most revenue per player | Breaks mixed friend groups; guests never try paid games |
| B. Host owns → everyone plays ("host pass") | Strong funnel; one buyer brings friends | Fewer sales per player; public host-pass lobbies give the game away |
| C. Configurable per game | Tune per game without code changes | Slightly more config |

**Chosen: C, defaulting to host pass.**
- `products.lobby_access` is `'host'` or `'everyone'`, default `'host'`.
- Host-pass lobbies are private-only by default (`app_settings.host_pass_public = false`).
- **Features:**
  - `scope: 'lobby'` features (modes, larger lobbies) follow the host's ownership and apply to everyone.
  - `scope: 'player'` features (cosmetics) require each player's own ownership.
- **Host leaves mid-match:** the match continues. "Play again" then requires the new host to own the game, which is why host migration prefers owners.

### Stripe (later phase, designed now)
- `purchases` has unique Stripe ids, `amount_cents`, `refunded_cents` and `status`.
- `stripe_events` (event id as primary key) makes webhooks idempotent: insert the event id first and stop on conflict.
- Refund events update `refunded_cents`.
- Lifetime spend is a view, `sum(amount_cents - refunded_cents)`, so it's always recomputed and never a drifting counter.

## 7. Data model

Every table has RLS enabled. Only the game server (service role) writes match results.

| Table | Purpose | RLS |
|---|---|---|
| `profiles(id → auth.users, username unique, display_name, avatar_url, created_at)` | Public identity; created by trigger on sign-up | Public read; owner updates own row |
| `products(sku, price_cents, is_paid, active, lobby_access)` | Pricing and gating config | Public read; no client writes |
| `app_settings(key, value jsonb)` | `monetization_enabled`, `unlock_all_threshold_cents`, `host_pass_public` | Public read; no client writes |
| `entitlement_grants(user_id, sku, reason, created_at)` | Manual grants: comps, promos, testing | Owner reads own; no client writes |
| `game_results(id, game_id, game_version, mode, started_at, ended_at, players jsonb, player_ids uuid[])` | One row per finished match; `players` = `[{ userId \| null, name, rank, score, stats }]`; `player_ids` indexes the registered players | Public read (match history shows on public profiles); service-role insert only |
| `leaderboard_stats(game_id, user_id, games, wins, best_score, updated_at)`, PK `(game_id, user_id)` | Per-game standings, updated in the same transaction as the result | Public read; service-role write only |
| *Stripe phase:* `purchases`, `stripe_events`, `user_spend` view | | Owner reads own purchases |

**`record_match(result jsonb)`** and **`get_access(user_id)`** can only be executed by `service_role`. They run as the caller, and the service role bypasses RLS. `record_match` inserts the `game_results` row and upserts `leaderboard_stats` for registered players in one round trip. Leaderboards are a table maintained by this function rather than a materialized view, so there is no refresh job and reads stay cheap. A skill rating (such as Elo) can be added as a column later.

**Privileges are explicit.** The migration revokes everything from `anon` and `authenticated`, then grants exactly what the policies use. That way, local stacks (old default: grant everything) and hosted projects (new default: grant nothing) behave the same. `packages/db/supabase/tests/schema.test.sql` (pgTAP, `pnpm --filter @games/db db:test`) checks these privileges and the sign-up, match-recording and account-deletion behaviour.

**Migrations** live in `packages/db/supabase/migrations`, and every schema change goes through a migration file. The file version must match the version recorded on the hosted project.

## 8. Security and anti-cheat basics

- **Server-authoritative.**
  - Clients send intents, never outcomes.
  - Every message is validated against its zod schema.
  - The platform enforces turn order.
  - Results are computed only on the server.
- **Hidden information** uses Colyseus `StateView` / `@view()`. Fields such as another player's dice are never sent to clients who shouldn't see them.
- **Real-time games** send inputs, not positions. The server clamps speed and validates movement.
- **Rate limiting:**
  - Game server, per client: a token bucket (roughly 30 messages/second for real-time games, 5/second for turn-based) and a 4 KB maximum message size.
  - Game server, per IP or user: connection caps, room-creation caps and join-by-code throttling.
  - Web: Vercel's built-in protection for now. Add Upstash rate limiting only if abuse appears.
- **Chat:** length limits, a basic profanity filter, and host mute and kick. Player reports come later.
- **Secrets:** the Supabase service-role key is only on the game server and in Next.js server routes, never in client bundles.

## 9. Runtime footprint

- **Turn-based games** are event-driven: no tick, and state patches go out only when something changes.
- **Real-time games** simulate at 20 Hz and send delta patches at 20 Hz, and clients interpolate between them.
- **Colyseus schema delta encoding** keeps payloads small.
- **Rooms are disposed promptly** (§4).
- **The lobby browser polls over HTTP** rather than holding a WebSocket per browsing user.

## 10. Scaling and deploys

- **Scaling:**
  - Start with one game-server process.
  - When more are needed, add Colyseus `RedisPresence` + `RedisDriver`. Matchmaking, the lobby list and join-code lookup then work across processes, and each process advertises its `publicAddress` so clients connect directly to the right one.
  - Game code doesn't change.
- **Deploys:**
  - On shutdown the game server drains. It stops creating rooms and waits for running matches to finish, up to Fly's `kill_timeout`.
  - Live state is in memory, so a match still running after the timeout is lost. That is an accepted trade-off.
  - Deploy the game server before the web app when the protocol changes; the manifest `version` check catches stragglers.
- **Observability:** structured logs to start; Sentry (free tier) later.

## 11. Local development

```sh
corepack enable          # provides pnpm
pnpm install
pnpm db:start            # supabase start (needs Docker)
pnpm dev                 # web on :3000, game server on :2567, both hot-reloading
```

- Each app has a `.env.example`.
- `packages/db/supabase/seed.sql` creates test users, products and one paid feature.
- The Colyseus monitor is available at `http://localhost:2567/monitor` in development only.
- Email/password sign-in works locally out of the box (Supabase's local mail catcher receives confirmation mail). Google sign-in needs an OAuth client from Google Cloud, configured in Supabase Auth settings.

## 12. Roadmap

Each phase ends with a review and one commit.

| Phase | Scope |
|---|---|
| 0 | This document and the README |
| 1 | Monorepo skeleton: pnpm, Turborepo, TypeScript config, Biome, Vitest, `packages/shared` with the entitlement function |
| 2 | Supabase: migrations for §7 (minus Stripe tables), RLS, `record_match`, seed, generated types |
| 3 | Game SDK and game server: `GameRoom`, auth and guest tokens, lobbies, join codes, `/lobbies`, registry codegen, `pnpm new-game` |
| 4 | Web: optional auth (Google, email/password), account deletion, catalog, lobby browser, create/join, lobby UI, game shell, results, leaderboards, profiles |
| 5 | Sample game: Liar's Dice (React, turn-based, hidden information) |
| 6 | Sample game: Bumper Arena (Phaser, real-time) |
| Later | Stripe, admin UI, Redis scaling, Sentry |
