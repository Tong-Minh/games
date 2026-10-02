# games

A multiplayer game lobby platform. Players create public or private lobbies and play games from a growing catalog. Accounts are optional.

- **Web app:** Next.js on Vercel (Phase 4)
- **Game server:** Colyseus, in `apps/game-server`
- **Auth and data:** Supabase, in `packages/db`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

## Quick start

```sh
pnpm install
pnpm db:start                                          # local Supabase (Docker)
cp apps/game-server/.env.example apps/game-server/.env # fill in keys from `npx supabase status` in packages/db
pnpm dev                                               # game server on http://localhost:2567
pnpm test
```

## Adding a game

```sh
pnpm new-game my-game "My Game"
```

This creates `packages/games/my-game`:
- `src/manifest.ts`: name, player counts and settings.
- `src/server.ts`: state, messages and win condition.
- `test/`: unit tests.

The game is registered with the server automatically, with no platform code to edit. Lobbies, chat, ready-up, host controls, reconnection, results and stats are handled by the platform.

## Layout

| Path | What |
|---|---|
| `apps/game-server` | Colyseus server: auth, HTTP routes, registered games |
| `packages/game-sdk` | `defineManifest`, `defineGame`, the platform `GameRoom`, test helpers |
| `packages/games/*` | One package per game |
| `packages/shared` | Entitlement rules and config schemas |
| `packages/db` | Supabase migrations, pgTAP tests, generated types |
| `templates/game` | Template used by `pnpm new-game` |

> Status: Phase 3 of 6. The SDK and game server are done; the web app comes next.
