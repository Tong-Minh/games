import { matchMaker } from '@colyseus/core';
import { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LobbyMessage, type MatchResults } from '../src';
import { createTestServer, type FakeServices, fakeServices, join, paidConfig } from './fixtures';

let colyseus: ColyseusTestServer;
let services: FakeServices;

beforeAll(async () => {
  services = fakeServices();
  // boot() ignores its port argument for Server instances, so listen directly. Each test
  // package uses its own port because Turbo runs them in parallel.
  const server = createTestServer(services);
  await server.listen(2570);
  colyseus = new ColyseusTestServer(server);
});
afterAll(() => colyseus.shutdown());
beforeEach(async () => {
  await colyseus.cleanup();
  services.recorded.length = 0;
  services.owned.clear();
  services.config = fakeServices().config;
});

// Server-side room state is untyped in tests.
// biome-ignore lint/suspicious/noExplicitAny: test access to room internals
const serverRoom = (roomId: string): any => colyseus.getRoomById(roomId);

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

async function lobbyOfTwo(create: Record<string, unknown> = {}) {
  const alice = await join(colyseus, 'user:alice:Alice', { create });
  const server = serverRoom(alice.roomId);
  const bob = await join(colyseus, 'guest:bob:Bob', {
    roomId: alice.roomId,
    code: server.state.code,
  });
  await settle();
  return { alice, bob, server };
}

async function startMatch({ alice, bob }: Awaited<ReturnType<typeof lobbyOfTwo>>) {
  bob.send(LobbyMessage.Ready, { ready: true });
  await settle();
  alice.send(LobbyMessage.Start);
  await settle();
}

describe('lobby', () => {
  it('makes the creator host and assigns a join code', async () => {
    const alice = await join(colyseus, 'user:alice:Alice', {});
    const server = serverRoom(alice.roomId);
    expect(server.state.hostId).toBe(alice.sessionId);
    expect(server.state.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(server.state.phase).toBe('lobby');
    expect(server.metadata).toMatchObject({ gameId: 'race', hostName: 'Alice', isPrivate: false });
  });

  it('requires the code for private lobbies', async () => {
    const alice = await join(colyseus, 'user:alice:Alice', { create: { private: true } });
    const { code } = serverRoom(alice.roomId).state;
    await expect(join(colyseus, 'guest:bob:Bob', { roomId: alice.roomId })).rejects.toThrow(
      /Invalid lobby code/,
    );
    const bob = await join(colyseus, 'guest:bob:Bob', {
      roomId: alice.roomId,
      code: code.toLowerCase(),
    });
    expect(bob.sessionId).toBeTruthy();
  });

  it('rejects unauthenticated clients and duplicate identities', async () => {
    await expect(join(colyseus, 'nonsense', {})).rejects.toThrow(/Not authenticated/);
    expect(await matchMaker.query({})).toHaveLength(0); // no room was created
    const alice = await join(colyseus, 'user:alice:Alice', {});
    await expect(join(colyseus, 'user:alice:Alice', { roomId: alice.roomId })).rejects.toThrow(
      /already in this lobby/,
    );
  });

  it('hides internal errors from players', async () => {
    const original = services.getMonetizationConfig;
    services.getMonetizationConfig = async () => {
      throw new Error('Supabase GET app_settings: 401 Invalid API key');
    };
    try {
      const error = await join(colyseus, 'user:alice:Alice', {}).catch((e: Error) => e);
      expect(String(error)).toMatch(/Something went wrong on our side/);
      expect(String(error)).not.toMatch(/Supabase|API key/);
    } finally {
      services.getMonetizationConfig = original;
    }
  });

  it('rejects invalid settings on create and validates updates', async () => {
    await expect(
      join(colyseus, 'user:alice:Alice', { create: { settings: { target: 99 } } }),
    ).rejects.toThrow();
    const { alice, server } = await lobbyOfTwo();
    alice.send(LobbyMessage.Settings, { settings: { target: 5 } });
    await settle();
    expect(JSON.parse(server.state.settings)).toEqual({ target: 5 });
    alice.send(LobbyMessage.Settings, { settings: { target: 'x' } });
    const error = await alice.waitForMessage(LobbyMessage.Error);
    expect(error.message).toBe('Invalid settings');
    expect(JSON.parse(server.state.settings)).toEqual({ target: 5 });
  });

  it('broadcasts cleaned chat messages', async () => {
    const { alice, bob } = await lobbyOfTwo();
    alice.send(LobbyMessage.Chat, { text: '  hi\u202e   there\n ' });
    const message = await bob.waitForMessage(LobbyMessage.Chat);
    expect(message).toMatchObject({ from: alice.sessionId, name: 'Alice', text: 'hi there' });
  });

  it('only lets the host start, and only when everyone is ready', async () => {
    const { alice, bob, server } = await lobbyOfTwo();
    bob.send(LobbyMessage.Start);
    alice.send(LobbyMessage.Start);
    const error = await alice.waitForMessage(LobbyMessage.Error);
    expect(error.message).toBe('Not everyone is ready');
    expect(server.state.phase).toBe('lobby');
    await startMatch({ alice, bob, server });
    expect(server.state.phase).toBe('playing');
    expect(server.locked).toBe(true);
  });

  it('kicks and bans', async () => {
    const { alice, bob, server } = await lobbyOfTwo();
    const left = new Promise<number>((resolve) => bob.onLeave((code) => resolve(code)));
    alice.send(LobbyMessage.Kick, { playerId: bob.sessionId });
    expect(await left).toBe(4100);
    await settle();
    expect(server.state.players.size).toBe(1);
    await expect(
      join(colyseus, 'guest:bob:Bob', { roomId: alice.roomId, code: server.state.code }),
    ).rejects.toThrow(/removed/);
  });

  it('migrates host when the host leaves', async () => {
    const { alice, bob, server } = await lobbyOfTwo();
    await alice.leave();
    await settle();
    expect(server.state.hostId).toBe(bob.sessionId);
    expect(server.metadata.hostName).toBe('Bob');
  });
});

describe('match', () => {
  it('runs a game to completion and records registered players only', async () => {
    const lobby = await lobbyOfTwo();
    const { alice, bob, server } = lobby;
    await startMatch(lobby);

    bob.send('point');
    await settle();
    for (let i = 0; i < 3; i++) alice.send('point');
    await settle();

    expect(server.state.phase).toBe('results');
    expect(server.locked).toBe(false);
    const results: MatchResults = JSON.parse(server.state.results);
    expect(results.players[0]).toMatchObject({ playerId: alice.sessionId, rank: 1, score: 3 });
    expect(results.names[bob.sessionId]).toBe('Bob');

    expect(services.recorded).toHaveLength(1);
    expect(services.recorded[0]).toMatchObject({
      gameId: 'race',
      gameVersion: 1,
      players: [
        { userId: 'alice', name: 'Alice', rank: 1, score: 3 },
        { userId: null, name: 'Bob', rank: 2, score: 1 },
      ],
    });

    alice.send(LobbyMessage.Again);
    await settle();
    expect(server.state.phase).toBe('lobby');
    expect(server.state.results).toBe('');
  });

  it('does not store all-guest matches', async () => {
    const host = await join(colyseus, 'guest:a:Ann', {});
    const server = serverRoom(host.roomId);
    const other = await join(colyseus, 'guest:b:Ben', { roomId: host.roomId });
    await settle();
    await startMatch({ alice: host, bob: other, server });
    for (let i = 0; i < 3; i++) host.send('point');
    await settle();
    expect(server.state.phase).toBe('results');
    expect(services.recorded).toHaveLength(0);
  });

  it('keeps hidden state hidden from other players', async () => {
    const lobby = await lobbyOfTwo();
    const { alice, bob } = lobby;
    await startMatch(lobby);

    const aliceView = alice.state.game.hands;
    expect(aliceView.get(alice.sessionId).secret).toBeGreaterThanOrEqual(100);
    expect(aliceView.get(bob.sessionId).secret).toBeUndefined();
    expect(aliceView.get(bob.sessionId).score).toBe(0);
    expect(bob.state.game.hands.get(alice.sessionId).secret).toBeUndefined();
  });

  it('ignores messages that fail validation or come outside a match', async () => {
    const lobby = await lobbyOfTwo();
    const { alice, server } = lobby;
    alice.send('point');
    await settle();
    await startMatch(lobby);
    alice.send('point', 'not an object');
    await settle();
    expect(server.state.game.hands.get(alice.sessionId).score).toBe(0);
  });

  it('ends the match when a player leaves and only one remains', async () => {
    const lobby = await lobbyOfTwo();
    const { bob, server } = lobby;
    await startMatch(lobby);
    await bob.leave();
    await settle();
    expect(server.state.phase).toBe('results');
  });

  it('applies lobby features chosen by the host', async () => {
    const lobby = await lobbyOfTwo();
    const { alice, server } = lobby;
    alice.send(LobbyMessage.Features, { features: ['double', 'gold', 'bogus'] });
    await settle();
    expect([...server.state.features]).toEqual(['double']);
    await startMatch(lobby);
    alice.send('point');
    await settle();
    expect(server.state.game.hands.get(alice.sessionId).score).toBe(2);
  });
});

describe('entitlements (monetization on)', () => {
  it('requires the host to own a paid game', async () => {
    services.config = paidConfig([{ sku: 'game:race' }]);
    await expect(join(colyseus, 'user:alice:Alice', {})).rejects.toThrow(/own this game/);
    await expect(join(colyseus, 'guest:g:Guest', {})).rejects.toThrow(/own this game/);
    services.owned.set('alice', ['game:race']);
    await expect(join(colyseus, 'user:alice:Alice', {})).resolves.toBeTruthy();
  });

  it('lets anyone into a private host-pass lobby, but not a public one', async () => {
    services.config = paidConfig([{ sku: 'game:race' }]);
    services.owned.set('alice', ['game:race']);

    const priv = await join(colyseus, 'user:alice:Alice', { create: { private: true } });
    const { code } = serverRoom(priv.roomId).state;
    await expect(
      join(colyseus, 'guest:g:Guest', { roomId: priv.roomId, code }),
    ).resolves.toBeTruthy();

    const pub = await join(colyseus, 'user:alice2:Alice', {}).catch(() => null);
    expect(pub).toBeNull(); // alice2 owns nothing
    services.owned.set('alice2', ['game:race']);
    const pub2 = await join(colyseus, 'user:alice2:Alice', {});
    await expect(join(colyseus, 'guest:h:Hal', { roomId: pub2.roomId })).rejects.toThrow(
      /own this game/,
    );
  });

  it('only enables lobby features the host owns', async () => {
    services.config = paidConfig([{ sku: 'feature:race:double' }]);
    const { alice, server } = await lobbyOfTwo();
    alice.send(LobbyMessage.Features, { features: ['double'] });
    await settle();
    expect([...server.state.features]).toEqual([]);
  });
});

describe('reconnection', () => {
  /** Simulate a network drop (any close code other than a consented leave). */
  const drop = (
    server: { clients: { getById(id: string): { leave(code: number): void } } },
    id: string,
  ) => server.clients.getById(id).leave(4999);

  it('marks dropped players offline and removes them when the window expires', async () => {
    const { bob, server } = await lobbyOfTwo();
    drop(server, bob.sessionId);
    await settle();
    expect(server.state.players.get(bob.sessionId).connected).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(server.state.players.has(bob.sessionId)).toBe(false);
  });

  it('restores the seat and hidden state when a player reconnects mid-match', async () => {
    const lobby = await lobbyOfTwo();
    const { alice, server } = lobby;
    await startMatch(lobby);
    const secret = server.state.game.hands.get(alice.sessionId).secret;

    drop(server, alice.sessionId);
    await settle();
    expect(server.state.players.get(alice.sessionId).connected).toBe(false);

    const back = await colyseus.sdk.reconnect(alice.reconnectionToken);
    await back.waitForInitialState();
    await settle();
    expect(back.sessionId).toBe(alice.sessionId);
    expect(server.state.players.get(alice.sessionId).connected).toBe(true);
    expect(server.state.phase).toBe('playing');
    expect(back.state.game.hands.get(alice.sessionId).secret).toBe(secret);
  });
});

describe('createTestContext', () => {
  it('runs game logic without a server', async () => {
    const { createTestContext } = await import('../src/testing');
    const { raceGame } = await import('./fixtures');
    const ctx = createTestContext(raceGame, { players: 2, settings: { target: 2 } });
    expect(ctx.revealed.get('p1')?.size).toBe(1);
    expect(ctx.dispatch('p1', 'point', 'bad')).toBe(false);
    ctx.dispatch('p1', 'point');
    expect(ctx.isOver()).toBeNull();
    ctx.dispatch('p1', 'point');
    expect(ctx.isOver()?.players[0]).toMatchObject({ playerId: 'p1', rank: 1, score: 2 });
  });
});
