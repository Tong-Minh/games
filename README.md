# games

A multiplayer game lobby platform. Players create public or private lobbies and play games from a growing catalog. Accounts are optional.

- **Web app:** Next.js on Vercel, in `apps/web`
- **Game server:** Colyseus, in `apps/game-server`
- **Auth and data:** Supabase, in `packages/db`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

## Quick start

```sh
pnpm install
pnpm db:start                                          # local Supabase (Docker)
cp apps/game-server/.env.example apps/game-server/.env # fill in keys from `npx supabase status` in packages/db
cp apps/web/.env.example apps/web/.env.local            # same keys
pnpm dev                                               # web on http://localhost:3000, game server on :2567
pnpm test
```

## Adding a game

```sh
pnpm new-game my-game "My Game"
```

This creates `packages/games/my-game`:
- `src/manifest.ts`: name, player counts and settings.
- `src/state.ts`: the synced state.
- `src/server.ts`: messages and win condition.
- `src/client.tsx`: the game UI.
- `test/`: unit tests.

The game is registered with the server automatically, with no platform code to edit. Lobbies, chat, ready-up, host controls, reconnection, results and stats are handled by the platform.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js site: catalog, lobbies, game shell, accounts, leaderboards |
| `apps/game-server` | Colyseus server: auth, HTTP routes, registered games |
| `packages/game-sdk` | `defineManifest`, `defineGame`, the platform `GameRoom`, test helpers |
| `packages/games/*` | One package per game |
| `packages/shared` | Entitlement rules and config schemas |
| `packages/db` | Supabase migrations, pgTAP tests, generated types |
| `templates/game` | Template used by `pnpm new-game` |

> Status: Phase 5 of 6. Liar's Dice is playable; the Phaser sample (Bumper Arena) comes next.
