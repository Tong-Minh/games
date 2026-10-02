/**
 * End-to-end against the local Supabase stack (`pnpm --filter @games/db db:start`):
 * real Supabase sign-in tokens, guest tokens, join codes, the lobby list, match recording
 * and account deletion. Skipped when the local stack isn't running.
 */
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { schema, t } from '@colyseus/schema';
import { ColyseusTestServer } from '@colyseus/testing';
import { defineGame, defineManifest, LobbyMessage } from '@games/game-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAuth } from '../src/auth';
import { createGameServer } from '../src/server';
import { createSupabaseApi } from '../src/supabase';

const manifest = defineManifest({
  id: 'coin',
  name: 'Coin',
  description: 'First to grab the coin wins',
  version: 1,
  minPlayers: 2,
  maxPlayers: 4,
});
const CoinState = schema({ winner: t.string().default('') }, 'CoinState');
const coinGame = defineGame(manifest, {
  State: CoinState,
  setup() {},
  messages: {
    grab: {
      schema: z.object({}).optional(),
      handle(ctx, playerId) {
        ctx.state.winner ||= playerId;
      },
    },
  },
  isOver(ctx) {
    if (!ctx.state.winner) return null;
    return {
      players: ctx.players.map((p) => ({
        playerId: p.id,
        rank: p.id === ctx.state.winner ? 1 : 2,
        score: p.id === ctx.state.winner ? 1 : 0,
      })),
    };
  },
});

function localSupabase() {
  try {
    const out = execSync('npx supabase status -o json', {
      cwd: join(import.meta.dirname, '../../../packages/db'),
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
    });
    const status = JSON.parse(out.toString());
    return {
      url: status.API_URL as string,
      secretKey: status.SECRET_KEY as string,
      publishableKey: status.PUBLISHABLE_KEY as string,
    };
  } catch {
    return null;
  }
}

// biome-ignore lint/suspicious/noExplicitAny: loosely typed test responses
const json = (response: Response): Promise<any> => response.json();

const local = localSupabase();
const origin = 'http://localhost:3000';

describe.skipIf(!local)('game server + local Supabase', () => {
  const { url, secretKey, publishableKey } = local!;
  const admin = { apikey: secretKey, 'content-type': 'application/json' };
  const email = `test-${Date.now()}@example.com`;
  const password = 'correct-horse-battery-staple';
  let userId = '';
  let userToken = '';
  let colyseus: ColyseusTestServer;
  const supabase = createSupabaseApi(url, secretKey);
  const auth = createAuth({ supabaseUrl: url, guestSecret: 'x'.repeat(32), supabase });

  beforeAll(async () => {
    const created = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Ada Lovelace' },
      }),
    }).then(json);
    userId = created.id;
    const session = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: publishableKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(json);
    userToken = session.access_token;

    const server = createGameServer({
      games: [coinGame],
      webOrigins: [origin],
      issueGuestToken: auth.issueGuestToken,
      services: {
        authenticate: auth.authenticate,
        getMonetizationConfig: supabase.getMonetizationConfig,
        getPlayerAccess: supabase.getPlayerAccess,
        recordMatch: supabase.recordMatch,
        log: () => {},
      },
    });
    // See the note in game-sdk tests: boot() ignores the port for Server instances.
    await server.listen(2571);
    colyseus = new ColyseusTestServer(server);
  });

  afterAll(async () => {
    await colyseus?.shutdown();
    // Always clear test matches, even if the last test already deleted the user.
    await fetch(`${url}/rest/v1/game_results?game_id=eq.coin`, {
      method: 'DELETE',
      headers: admin,
    });
    if (userId) {
      await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: admin });
    }
  });

  it('authenticates Supabase users from their profile', async () => {
    expect(await auth.authenticate(userToken)).toEqual({
      id: userId,
      userId,
      name: 'Ada Lovelace',
      avatarUrl: '',
    });
    await expect(auth.authenticate(`${userToken.slice(0, -4)}AAAA`)).rejects.toThrow();
    await expect(auth.authenticate(undefined)).rejects.toThrow();
  });

  it('issues guest tokens over HTTP and validates names', async () => {
    const ok = await colyseus.http.post('/auth/guest', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '  Gus‮  ' }),
    });
    expect(ok.data.name).toBe('Gus');
    expect(await auth.authenticate(ok.data.token)).toMatchObject({ userId: null, name: 'Gus' });

    const bad = await colyseus.http
      .post('/auth/guest', {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x' }),
      })
      .catch((e: { statusCode: number }) => e);
    expect(bad.statusCode).toBe(400);
  });

  it('plays a private match end to end and records it in Postgres', async () => {
    colyseus.sdk.auth.token = userToken;
    const host = await colyseus.sdk.create('coin', { private: true });
    await host.waitForInitialState();
    const code: string = host.state.code;

    const { data: lobbies } = await colyseus.http.get('/lobbies');
    expect(
      lobbies.lobbies.find((l: { roomId: string }) => l.roomId === host.roomId),
    ).toBeUndefined();

    const { data: found } = await colyseus.http.get(`/lobbies/code/${code.toLowerCase()}`);
    expect(found).toEqual({ roomId: host.roomId, gameId: 'coin', code });
    const missing = await colyseus.http
      .get('/lobbies/code/ZZZZZZ')
      .catch((e: { statusCode: number }) => e);
    expect(missing.statusCode).toBe(404);

    const { data: guest } = await colyseus.http.post('/auth/guest', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Gus' }),
    });
    colyseus.sdk.auth.token = guest.token;
    const other = await colyseus.sdk.joinById(found.roomId, { code });
    await other.waitForInitialState();

    other.send(LobbyMessage.Ready, { ready: true });
    await new Promise((r) => setTimeout(r, 50));
    host.send(LobbyMessage.Start);
    await new Promise((r) => setTimeout(r, 50));
    host.send('grab');
    await new Promise((r) => setTimeout(r, 300));
    expect(host.state.phase).toBe('results');

    const rows = await fetch(
      `${url}/rest/v1/game_results?game_id=eq.coin&player_ids=cs.{${userId}}&select=players`,
      {
        headers: admin,
      },
    ).then(json);
    expect(rows).toHaveLength(1);
    expect(rows[0].players).toEqual([
      expect.objectContaining({ userId, name: 'Ada Lovelace', rank: 1 }),
      expect.objectContaining({ userId: null, name: 'Gus', rank: 2 }),
    ]);
    const stats = await fetch(
      `${url}/rest/v1/leaderboard_stats?game_id=eq.coin&user_id=eq.${userId}&select=games,wins`,
      { headers: admin },
    ).then(json);
    expect(stats).toEqual([{ games: 1, wins: 1 }]);
  });

  it('lists public lobbies and restricts CORS to the web app', async () => {
    colyseus.sdk.auth.token = userToken;
    const room = await colyseus.sdk.create('coin', {});
    const res = await colyseus.http.get('/lobbies?game=coin', { headers: { origin } });
    expect(res.data.lobbies).toContainEqual(
      expect.objectContaining({
        roomId: room.roomId,
        hostName: 'Ada Lovelace',
        players: 1,
        maxPlayers: 4,
      }),
    );
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    const evil = await colyseus.http.get('/lobbies', {
      headers: { origin: 'https://evil.example' },
    });
    expect(evil.headers['access-control-allow-origin']).toBe(origin);
    await room.leave();
  });

  it('rejects tokens of deleted accounts', async () => {
    const fresh = createAuth({
      supabaseUrl: url,
      guestSecret: 'x'.repeat(32),
      supabase: createSupabaseApi(url, secretKey),
    });
    await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: admin });
    await expect(fresh.authenticate(userToken)).rejects.toThrow(/Account not found/);
    userId = '';
  });
});
