/**
 * Every registered game, over real sockets: hidden state must never reach the wrong client.
 * Uses fake platform services, so it needs no database.
 */
import { ColyseusTestServer } from '@colyseus/testing';
import { LobbyMessage } from '@games/game-sdk';
import { PlayerError } from '@games/game-sdk/server';
import { monetizationSettingsSchema } from '@games/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { games } from '../src/games.gen';
import { createGameServer } from '../src/server';

const liarsDice = games.find((g) => g.manifest.id === 'liars-dice');
let colyseus: ColyseusTestServer;
const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  const server = createGameServer({
    games,
    webOrigins: ['http://localhost:3000'],
    issueGuestToken: async (name) => ({ token: `guest:${name}`, name }),
    services: {
      async authenticate(token) {
        const name = token?.split(':')[1];
        if (!name) throw new PlayerError('Not authenticated');
        return { id: `guest:${name}`, userId: null, name, avatarUrl: '' };
      },
      getMonetizationConfig: async () => ({
        settings: monetizationSettingsSchema.parse({}),
        products: new Map(),
      }),
      getPlayerAccess: async () => ({ ownedSkus: new Set(), lifetimeSpendCents: 0 }),
      recordMatch: async () => {},
      log: () => {},
    },
  });
  await server.listen(2572);
  colyseus = new ColyseusTestServer(server);
});
afterAll(() => colyseus?.shutdown());

describe.skipIf(!liarsDice)("Liar's Dice over the wire", () => {
  it('sends each player only their own dice until a showdown', async () => {
    colyseus.sdk.auth.token = 'guest:Ann';
    const ann = await colyseus.sdk.create('liars-dice', {});
    await ann.waitForInitialState();
    colyseus.sdk.auth.token = 'guest:Ben';
    const ben = await colyseus.sdk.joinById(ann.roomId, {});
    await ben.waitForInitialState();
    ben.send(LobbyMessage.Ready, { ready: true });
    await settle();
    ann.send(LobbyMessage.Start);
    await settle(200);

    const annSees = ann.state.game.hands;
    const benSees = ben.state.game.hands;
    expect([...annSees.get(ann.sessionId).dice]).toHaveLength(5);
    expect(annSees.get(ben.sessionId).count).toBe(5);
    expect(annSees.get(ben.sessionId).dice?.length ?? 0).toBe(0);
    expect(benSees.get(ann.sessionId).dice?.length ?? 0).toBe(0);
    expect([...benSees.get(ben.sessionId).dice]).toHaveLength(5);

    // Showdown: everyone sees every cup.
    ann.send('bid', { count: 1, face: 2 });
    await settle();
    ben.send('challenge');
    await settle(200);
    expect(ben.state.game.revealing).toBe(true);
    expect(ben.state.game.hands.get(ann.sessionId).dice?.length).toBeGreaterThan(0);
    expect(ann.state.game.hands.get(ben.sessionId).dice?.length).toBeGreaterThan(0);

    // Next round: fresh cups, hidden again.
    await settle(5300);
    expect(ann.state.game.round).toBe(2);
    expect(ann.state.game.revealing).toBe(false);
    expect(ann.state.game.hands.get(ben.sessionId).dice?.length ?? 0).toBe(0);
    expect(ben.state.game.hands.get(ann.sessionId).dice?.length ?? 0).toBe(0);
    expect(ann.state.game.hands.get(ann.sessionId).dice?.length).toBeGreaterThan(0);
  }, 15_000);
});

const whoDat = games.find((g) => g.manifest.id === 'who-dat');

describe.skipIf(!whoDat)('Who Dat? over the wire', () => {
  it("hides each player's animal from the other until the reveal", async () => {
    colyseus.sdk.auth.token = 'guest:Cy';
    const cy = await colyseus.sdk.create('who-dat', {});
    await cy.waitForInitialState();
    colyseus.sdk.auth.token = 'guest:Di';
    const di = await colyseus.sdk.joinById(cy.roomId, {});
    await di.waitForInitialState();
    di.send(LobbyMessage.Ready, { ready: true });
    await settle();
    cy.send(LobbyMessage.Start);
    await settle(200);

    const cySees = cy.state.game.sides;
    expect(cySees.get(cy.sessionId).secret).toBeTruthy();
    expect(cySees.get(di.sessionId).secret ?? '').toBe('');
    expect(di.state.game.sides.get(cy.sessionId).secret ?? '').toBe('');

    // Whoever's turn it is guesses; either way the game ends and both animals are revealed.
    const [asker, other] = cy.state.game.turn === cy.sessionId ? [cy, di] : [di, cy];
    asker.send('guess', { animal: asker.state.game.board[0] });
    await settle(200);
    expect(cy.state.game.stage).toBe('reveal');
    expect(asker.state.game.sides.get(other.sessionId).secret).toBeTruthy();
    expect(other.state.game.sides.get(asker.sessionId).secret).toBeTruthy();
  });
});
