import {
  createEndpoint,
  createRouter,
  defineRoom,
  defineServer,
  LocalPresence,
  matchMaker,
  type Presence,
} from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { AnyGameDefinition, LobbyMetadata } from '@games/game-sdk';
import {
  CODE_PATTERN,
  createGameRoom,
  type GameRoomOptions,
  normalizeCode,
  type PlatformServices,
} from '@games/game-sdk/server';
import { z } from 'zod';
import { clientIp, createRateLimiter } from './rateLimit';

const CODES_KEY = 'lobby-codes';
const MAX_MESSAGE_BYTES = 4 * 1024;

export interface GameServerOptions {
  games: readonly AnyGameDefinition[];
  services: Omit<PlatformServices, 'claimCode' | 'releaseCode'>;
  issueGuestToken(name: string): Promise<{ token: string; name: string }>;
  webOrigins: readonly string[];
  presence?: Presence;
  publicAddress?: string;
  roomOptions?: GameRoomOptions;
}

export interface LobbyListing {
  roomId: string;
  gameId: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  phase: LobbyMetadata['phase'];
}

export function createGameServer(options: GameServerOptions) {
  const presence = options.presence ?? new LocalPresence();
  const services: PlatformServices = {
    ...options.services,
    async claimCode(code, roomId) {
      if (await presence.hget(CODES_KEY, code)) return false;
      await presence.hset(CODES_KEY, code, roomId);
      return true;
    },
    async releaseCode(code) {
      await presence.hdel(CODES_KEY, code);
    },
  };

  const gameIds = new Set(options.games.map((g) => g.manifest.id));
  const rooms = Object.fromEntries(
    options.games.map((game) => [
      game.manifest.id,
      defineRoom(createGameRoom(game, services, options.roomOptions)),
    ]),
  );

  // Only the web app may call the HTTP API from a browser.
  const allowedOrigins = new Set(options.webOrigins);
  matchMaker.controller.getCorsHeaders = (headers: Headers) => {
    const origin = headers.get('origin');
    return {
      'Access-Control-Allow-Origin':
        origin && allowedOrigins.has(origin) ? origin : (options.webOrigins[0] ?? ''),
      Vary: 'Origin',
    };
  };

  const codeLookups = createRateLimiter(20, 60_000);
  const guestTokens = createRateLimiter(10, 60_000);

  const routes = createRouter({
    health: createEndpoint('/health', { method: 'GET' }, async () => ({ ok: true })),

    lobbies: createEndpoint(
      '/lobbies',
      {
        method: 'GET',
        query: z.object({
          game: z.string().max(64).optional(),
          minSlots: z.coerce.number().int().min(0).max(64).optional(),
        }),
      },
      async (ctx) => {
        const { game, minSlots = 1 } = ctx.query;
        const listed = await matchMaker.query({ private: false });
        const lobbies: LobbyListing[] = listed
          .filter((room) => gameIds.has(room.name) && (!game || room.name === game))
          // A room appears once its host has actually joined, not when a seat is reserved.
          .filter((room) => Boolean(room.metadata?.hostName))
          .filter((room) => room.metadata?.phase !== 'playing' && !room.locked)
          .filter((room) => room.maxClients - room.clients >= minSlots)
          .slice(0, 100)
          .map((room) => ({
            roomId: room.roomId,
            gameId: room.name,
            hostName: room.metadata?.hostName ?? '',
            players: room.clients,
            maxPlayers: room.maxClients,
            phase: room.metadata?.phase ?? 'lobby',
          }));
        return { lobbies };
      },
    ),

    lobbyByCode: createEndpoint('/lobbies/code/:code', { method: 'GET' }, async (ctx) => {
      if (!codeLookups(clientIp(ctx.headers as Headers | undefined))) {
        throw ctx.error('TOO_MANY_REQUESTS', { message: 'Too many attempts, try again soon' });
      }
      const code = normalizeCode(String(ctx.params?.code ?? ''));
      const roomId = CODE_PATTERN.test(code) ? await presence.hget(CODES_KEY, code) : null;
      const room = roomId ? (await matchMaker.findRoomsByIds([roomId])).get(roomId) : undefined;
      if (!room) throw ctx.error('NOT_FOUND', { message: 'No lobby with that code' });
      return { roomId: room.roomId, gameId: room.name, code };
    }),

    guest: createEndpoint(
      '/auth/guest',
      { method: 'POST', body: z.object({ name: z.string().max(100) }) },
      async (ctx) => {
        if (!guestTokens(clientIp(ctx.headers as Headers | undefined))) {
          throw ctx.error('TOO_MANY_REQUESTS', { message: 'Too many attempts, try again soon' });
        }
        try {
          return await options.issueGuestToken(ctx.body.name);
        } catch (error) {
          throw ctx.error('BAD_REQUEST', { message: (error as Error).message });
        }
      },
    ),
  });

  return defineServer({
    rooms,
    routes,
    presence,
    ...(options.publicAddress ? { publicAddress: options.publicAddress } : {}),
    transport: new WebSocketTransport({ maxPayload: MAX_MESSAGE_BYTES, pingInterval: 10_000 }),
  });
}
