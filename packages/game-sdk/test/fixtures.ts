import { defineRoom, defineServer, LocalPresence } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import type { ColyseusTestServer } from '@colyseus/testing';
import { type MonetizationConfig, monetizationSettingsSchema, type Product } from '@games/shared';
import { z } from 'zod';
import { defineGame, defineManifest } from '../src';
import {
  createGameRoom,
  type MatchRecord,
  type PlatformServices,
  PlayerError,
} from '../src/server';

/** A tiny race: first player to 3 points wins. Each player also holds a hidden secret. */
export const manifest = defineManifest({
  id: 'race',
  name: 'Race',
  description: 'First to 3',
  version: 1,
  minPlayers: 2,
  maxPlayers: 4,
  features: [
    { id: 'double', name: 'Double points', scope: 'lobby' },
    { id: 'gold', name: 'Gold skin', scope: 'player' },
  ],
  settings: z.object({ target: z.number().int().min(1).max(10).default(3) }),
});

const Hand = schema({ score: t.number().default(0), secret: t.number().view() }, 'RaceHand');
const RaceState = schema({ hands: t.map(Hand) }, 'RaceState');

export const raceGame = defineGame(manifest, {
  State: RaceState,
  setup(ctx) {
    for (const player of ctx.players) {
      const hand = new Hand();
      hand.secret = 100 + ctx.randomInt(900);
      ctx.state.hands.set(player.id, hand);
      ctx.reveal(player.id, hand);
    }
  },
  messages: {
    point: {
      schema: z.object({}).optional(),
      handle(ctx, playerId) {
        const hand = ctx.state.hands.get(playerId);
        if (hand) hand.score += ctx.hasFeature('double') ? 2 : 1;
      },
    },
  },
  onPlayerLeave(ctx, playerId) {
    ctx.state.hands.delete(playerId);
  },
  isOver(ctx) {
    const hands = [...ctx.state.hands.entries()];
    const winner = hands.find(([, h]) => h.score >= ctx.settings.target);
    if (!winner && hands.length > 1) return null;
    return {
      players: hands
        .sort(([, a], [, b]) => b.score - a.score)
        .map(([playerId, h], i) => ({ playerId, rank: i + 1, score: h.score })),
    };
  },
});

export interface FakeServices extends PlatformServices {
  recorded: MatchRecord[];
  config: MonetizationConfig;
  owned: Map<string, string[]>;
}

/**
 * Tokens are `user:<id>:<name>` or `guest:<id>:<name>`.
 */
export function fakeServices(): FakeServices {
  const codes = new Map<string, string>();
  const services: FakeServices = {
    recorded: [],
    owned: new Map(),
    config: { settings: monetizationSettingsSchema.parse({}), products: new Map() },
    async authenticate(token) {
      const [kind, id, name] = (token ?? '').split(':');
      if (!kind || !id || !name) throw new PlayerError('Not authenticated');
      return kind === 'user'
        ? { id, userId: id, name, avatarUrl: '' }
        : { id: `guest:${id}`, userId: null, name, avatarUrl: '' };
    },
    async getMonetizationConfig() {
      return services.config;
    },
    async getPlayerAccess(userId) {
      return { ownedSkus: new Set(services.owned.get(userId) ?? []), lifetimeSpendCents: 0 };
    },
    async recordMatch(record) {
      services.recorded.push(record);
    },
    async claimCode(code, roomId) {
      if (codes.has(code)) return false;
      codes.set(code, roomId);
      return true;
    },
    async releaseCode(code) {
      codes.delete(code);
    },
    log() {},
  };
  return services;
}

export function paidConfig(products: Partial<Product>[]): MonetizationConfig {
  return {
    settings: monetizationSettingsSchema.parse({ monetizationEnabled: true }),
    products: new Map(
      products.map((p) => [
        p.sku!,
        { sku: p.sku!, priceCents: 100, isPaid: true, active: true, lobbyAccess: 'host', ...p },
      ]),
    ),
  };
}

export function createTestServer(services: PlatformServices) {
  return defineServer({
    presence: new LocalPresence(),
    rooms: {
      race: defineRoom(createGameRoom(raceGame, services, { reconnectSeconds: 1, seed: () => 42 })),
    },
  });
}

/** Join as `token` via the SDK, the way a real client would. */
export async function join(
  colyseus: ColyseusTestServer,
  token: string,
  how: { create?: Record<string, unknown> } | { roomId: string; code?: string },
) {
  colyseus.sdk.auth.token = token;
  const room =
    'roomId' in how
      ? await colyseus.sdk.joinById(how.roomId, { code: how.code })
      : await colyseus.sdk.create('race', how.create ?? {});
  await room.waitForInitialState();
  return room;
}
