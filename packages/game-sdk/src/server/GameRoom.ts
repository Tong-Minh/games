import { type AuthContext, type Client, Room } from '@colyseus/core';
import { type Schema, StateView, t } from '@colyseus/schema';
import {
  canAccess,
  canCreateLobby,
  canJoinLobby,
  gameSku,
  hasFeature,
  type LobbyContext,
  type MonetizationConfig,
  type PlayerAccess,
} from '@games/shared';
import { z } from 'zod';
import type { AnyGameDefinition, GameContext, PlayerInfo, Timer } from '../game';
import {
  type ChatMessage,
  CloseCode,
  type GameResults,
  LobbyMessage,
  type LobbyMetadata,
  type LobbyPhase,
  LobbyPlayer,
  LobbyState,
  type MatchResults,
} from '../lobby';
import { PlayerError, shielded } from './errors';
import type { Identity, PlatformServices } from './services';
import { CODE_PATTERN, cleanText, createRandom, generateCode, normalizeCode } from './util';

export interface GameRoomOptions {
  /** Seconds a dropped player has to reconnect. */
  reconnectSeconds?: number;
  /** Minutes a lobby may sit without starting a match before it's closed. */
  idleMinutes?: number;
  /** Override match seeds (tests). */
  seed?: () => number;
}

/** Sent by the client when creating a room. */
const createOptionsSchema = z.object({
  private: z.boolean().default(false),
  settings: z.record(z.string(), z.unknown()).default({}),
});

/** Sent by the client when joining an existing room. */
const joinOptionsSchema = z.object({ code: z.string().max(16).optional() });

/** Returned by the static onAuth. Must be plain JSON: it travels with the seat reservation. */
interface AuthData {
  identity: Identity;
  /** Null for guests and whenever monetization is off. */
  access: { ownedSkus: string[]; lifetimeSpendCents: number } | null;
}

const toPlayerAccess = (access: AuthData['access']): PlayerAccess | null =>
  access && { ownedSkus: new Set(access.ownedSkus), lifetimeSpendCents: access.lifetimeSpendCents };

const CHAT_MAX_LENGTH = 200;
const CHAT_MIN_INTERVAL_MS = 400;

/**
 * Builds the platform room for one game. The room owns the lobby (players, host, chat,
 * settings, ready-up), reconnection and results; the game definition only runs the match.
 */
export function createGameRoom(
  game: AnyGameDefinition,
  services: PlatformServices,
  options: GameRoomOptions = {},
) {
  const { manifest } = game;
  const reconnectSeconds = options.reconnectSeconds ?? 30;
  const idleMs = (options.idleMinutes ?? 15) * 60_000;
  const nextSeed = options.seed ?? (() => Math.floor(Math.random() * 2 ** 32));
  const lobbyFeatureIds = new Set(
    manifest.features.filter((f) => f.scope === 'lobby').map((f) => f.id),
  );

  const logError = (message: string, data: Record<string, unknown>) =>
    services.log('error', `${manifest.id}: ${message}`, data);

  const RoomState = LobbyState.extend({ game: t.ref(game.State) }, `${manifest.id}:State`);
  type RoomStateType = InstanceType<typeof LobbyState> & { game: Schema };

  return class GameRoom extends Room<{ state: RoomStateType; metadata: LobbyMetadata }> {
    override maxClients = manifest.maxPlayers;
    override maxMessagesPerSecond = manifest.realtime ? 40 : 10;

    private config!: MonetizationConfig;
    private hostAccess: PlayerAccess | null = null;
    private identities = new Map<string, Identity>();
    private accessBySession = new Map<string, PlayerAccess | null>();
    private banned = new Set<string>();
    private kicked = new Set<string>();
    private lastChatAt = new Map<string, number>();
    private joinCounter = 0;
    private idleTimer: Timer | undefined;

    // Per-match state.
    private ctx: GameContext<Schema, unknown> | null = null;
    private matchPlayers: PlayerInfo[] = [];
    private matchIdentities = new Map<string, Identity>();
    private matchTimers = new Set<Timer>();
    private revealed = new Map<string, Set<Schema>>();
    private revealedToAll = new Set<Schema>();
    private startedAt = 0;

    override async onCreate(rawOptions: unknown) {
      const opts = createOptionsSchema.safeParse(rawOptions ?? {});
      const settings = opts.success ? manifest.settings.safeParse(opts.data.settings) : null;
      if (!opts.success || !settings?.success) throw new PlayerError('Invalid lobby settings');
      await shielded(logError, 'onCreate', () => this.initialize(opts.data.private, settings.data));
    }

    private async initialize(isPrivate: boolean, settings: unknown) {
      this.config = await services.getMonetizationConfig();

      const state = new RoomState() as unknown as RoomStateType;
      state.gameId = manifest.id;
      state.gameVersion = manifest.version;
      state.isPrivate = isPrivate;
      state.settings = JSON.stringify(settings);
      state.game = new game.State();
      state.code = await this.claimUniqueCode();
      this.state = state;

      if (manifest.realtime) this.patchRate = 1000 / manifest.tickRate;
      await this.setMatchmaking({ private: isPrivate, metadata: this.buildMetadata() });

      this.registerLobbyMessages();
      this.registerGameMessages();
      this.resetIdleTimer();
    }

    /**
     * Runs during matchmaking, before a room is created or a seat reserved, so unauthenticated
     * requests never create rooms. Room-specific checks happen in `onJoin`.
     */
    static override async onAuth(token: string, _options: unknown, _context: AuthContext) {
      return shielded(logError, 'onAuth', async () => {
        const identity = await services.authenticate(token);
        const config = await services.getMonetizationConfig();
        const access =
          config.settings.monetizationEnabled && identity.userId
            ? await services.getPlayerAccess(identity.userId)
            : null;
        return {
          identity,
          access: access && {
            ownedSkus: [...access.ownedSkus],
            lifetimeSpendCents: access.lifetimeSpendCents,
          },
        } satisfies AuthData;
      });
    }

    /** Throwing here rejects the join with the error's message. */
    private admit(identity: Identity, access: PlayerAccess | null, rawOptions: unknown) {
      if (this.banned.has(identity.id)) throw new PlayerError('You were removed from this lobby');
      for (const existing of this.identities.values()) {
        if (existing.id === identity.id) throw new PlayerError('You are already in this lobby');
      }
      if (this.state.phase === 'playing') throw new PlayerError('A match is in progress');

      const isCreator = this.identities.size === 0 && this.state.hostId === '';
      if (isCreator) {
        if (!canCreateLobby(this.lobbyContext(access), this.config)) {
          throw new PlayerError('You need to own this game to host it');
        }
        return;
      }
      const { code } = joinOptionsSchema.parse(rawOptions ?? {});
      if (this.state.isPrivate && normalizeCode(code ?? '') !== this.state.code) {
        throw new PlayerError('Invalid lobby code');
      }
      if (!canJoinLobby(this.lobbyContext(this.hostAccess), access, this.config)) {
        throw new PlayerError('You need to own this game to join this lobby');
      }
    }

    override onJoin(client: Client, options: unknown, auth: AuthData) {
      const { identity } = auth;
      const access = toPlayerAccess(auth.access);
      this.admit(identity, access, options);
      this.identities.set(client.sessionId, identity);
      this.accessBySession.set(client.sessionId, access);
      client.view = new StateView();

      const player = new LobbyPlayer();
      player.name = identity.name;
      player.isGuest = identity.userId === null;
      player.avatarUrl = identity.avatarUrl;
      player.joinedAt = this.joinCounter++;
      this.state.players.set(client.sessionId, player);

      if (this.state.hostId === '') this.setHost(client.sessionId);
      this.updateMetadata();
    }

    override onDrop(client: Client) {
      // Kicked players don't get a reconnection window.
      if (this.kicked.delete(client.sessionId)) return;
      const player = this.state.players.get(client.sessionId);
      if (player) player.connected = false;
      try {
        this.allowReconnection(client, reconnectSeconds);
      } catch {
        // The room is shutting down; there's nothing to reconnect to.
      }
    }

    override onReconnect(client: Client) {
      const player = this.state.players.get(client.sessionId);
      if (player) player.connected = true;
      client.view = new StateView();
      for (const obj of this.revealedToAll) client.view.add(obj);
      for (const obj of this.revealed.get(client.sessionId) ?? []) client.view.add(obj);
    }

    override onLeave(client: Client) {
      const sessionId = client.sessionId;
      this.state.players.delete(sessionId);
      this.identities.delete(sessionId);
      this.accessBySession.delete(sessionId);
      this.lastChatAt.delete(sessionId);
      this.revealed.delete(sessionId);

      if (this.state.phase === 'playing' && this.ctx) {
        const index = this.matchPlayers.findIndex((p) => p.id === sessionId);
        if (index !== -1) {
          this.matchPlayers.splice(index, 1);
          this.runGame(() => game.onPlayerLeave?.(this.ctx!, sessionId));
        }
      }
      if (this.state.hostId === sessionId) this.migrateHost();
      this.updateMetadata();
    }

    override async onDispose() {
      this.endMatchTimers();
      await services.releaseCode(this.state.code);
    }

    // ─── lobby ─────────────────────────────────────────────────────────────

    private registerLobbyMessages() {
      this.onMessage(LobbyMessage.Ready, (client, message: unknown) => {
        if (this.state.phase !== 'lobby') return;
        const parsed = z.object({ ready: z.boolean() }).safeParse(message);
        const player = this.state.players.get(client.sessionId);
        if (parsed.success && player) player.ready = parsed.data.ready;
      });

      this.onMessage(LobbyMessage.Chat, (client, message: unknown) => {
        const parsed = z.object({ text: z.string() }).safeParse(message);
        const player = this.state.players.get(client.sessionId);
        if (!parsed.success || !player) return;
        const now = Date.now();
        if (now - (this.lastChatAt.get(client.sessionId) ?? 0) < CHAT_MIN_INTERVAL_MS) return;
        const text = cleanText(parsed.data.text, CHAT_MAX_LENGTH);
        if (!text) return;
        this.lastChatAt.set(client.sessionId, now);
        this.broadcast(LobbyMessage.Chat, {
          from: client.sessionId,
          name: player.name,
          text,
          at: now,
        } satisfies ChatMessage);
      });

      this.onMessage(LobbyMessage.Kick, (client, message: unknown) => {
        if (!this.isHost(client)) return;
        const parsed = z.object({ playerId: z.string() }).safeParse(message);
        if (!parsed.success || parsed.data.playerId === client.sessionId) return;
        const target = this.clients.getById(parsed.data.playerId);
        const identity = this.identities.get(parsed.data.playerId);
        if (!target) return;
        if (identity) this.banned.add(identity.id);
        this.kicked.add(target.sessionId);
        target.leave(CloseCode.Kicked, 'Removed by the host');
      });

      this.onMessage(LobbyMessage.Settings, (client, message: unknown) => {
        if (!this.isHost(client) || this.state.phase !== 'lobby') return;
        const parsed = z.object({ settings: z.record(z.string(), z.unknown()) }).safeParse(message);
        if (!parsed.success) return;
        const merged = { ...JSON.parse(this.state.settings), ...parsed.data.settings };
        const settings = manifest.settings.safeParse(merged);
        if (!settings.success) return this.reject(client, 'Invalid settings');
        this.state.settings = JSON.stringify(settings.data);
        this.unreadyAll();
      });

      this.onMessage(LobbyMessage.Features, (client, message: unknown) => {
        if (!this.isHost(client) || this.state.phase !== 'lobby') return;
        const parsed = z.object({ features: z.array(z.string()).max(32) }).safeParse(message);
        if (!parsed.success) return;
        const lobby = this.lobbyContext(this.hostAccess);
        const allowed = parsed.data.features.filter(
          (id) =>
            lobbyFeatureIds.has(id) &&
            hasFeature(lobby, { id, scope: 'lobby' }, this.hostAccess, this.config),
        );
        this.state.features.splice(0, this.state.features.length, ...new Set(allowed));
        this.unreadyAll();
      });

      this.onMessage(LobbyMessage.Start, (client) => {
        if (!this.isHost(client) || this.state.phase !== 'lobby') return;
        const problem = this.startProblem();
        if (problem) return this.reject(client, problem);
        this.startMatch();
      });

      this.onMessage(LobbyMessage.Again, (client) => {
        if (!this.isHost(client) || this.state.phase !== 'results') return;
        if (!canAccess(gameSku(manifest.id), this.hostAccess, this.config)) {
          return this.reject(client, 'The host needs to own this game to play again');
        }
        this.state.phase = 'lobby';
        this.state.results = '';
        this.state.game = new game.State();
        this.unreadyAll();
        this.resetIdleTimer();
        this.updateMetadata();
      });
    }

    private startProblem(): string | null {
      const players = [...this.state.players.values()];
      if (players.length < manifest.minPlayers) {
        return `Need at least ${manifest.minPlayers} players`;
      }
      if (players.some((p) => !p.connected)) return 'Waiting for players to reconnect';
      const unready = [...this.state.players.entries()].some(
        ([id, p]) => id !== this.state.hostId && !p.ready,
      );
      return unready ? 'Not everyone is ready' : null;
    }

    private setHost(sessionId: string) {
      this.state.hostId = sessionId;
      this.hostAccess = this.accessBySession.get(sessionId) ?? null;
    }

    /** Longest-connected player, preferring one who owns the game so "play again" keeps working. */
    private migrateHost() {
      const candidates = [...this.state.players.entries()].sort(
        ([, a], [, b]) => a.joinedAt - b.joinedAt,
      );
      const sku = gameSku(manifest.id);
      const owner = candidates.find(([id]) =>
        canAccess(sku, this.accessBySession.get(id) ?? null, this.config),
      );
      const next = owner ?? candidates[0];
      this.state.hostId = '';
      this.hostAccess = null;
      if (next) this.setHost(next[0]);
    }

    private isHost(client: Client) {
      return client.sessionId === this.state.hostId;
    }

    private unreadyAll() {
      for (const player of this.state.players.values()) player.ready = false;
    }

    private reject(client: Client, message: string) {
      client.send(LobbyMessage.Error, { message });
    }

    private lobbyContext(host: PlayerAccess | null): LobbyContext {
      return { gameId: manifest.id, isPrivate: this.state.isPrivate, host };
    }

    private resetIdleTimer() {
      this.idleTimer?.clear();
      this.idleTimer = this.clock.setTimeout(() => {
        if (this.state.phase !== 'playing') void this.disconnect(CloseCode.Idle);
      }, idleMs);
    }

    private async claimUniqueCode(): Promise<string> {
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = generateCode();
        if (CODE_PATTERN.test(code) && (await services.claimCode(code, this.roomId))) return code;
      }
      throw new Error('Could not allocate a lobby code');
    }

    private buildMetadata(): LobbyMetadata {
      const host = this.state.players.get(this.state.hostId);
      return {
        gameId: manifest.id,
        gameVersion: manifest.version,
        hostName: host?.name ?? '',
        phase: this.state.phase as LobbyPhase,
        isPrivate: this.state.isPrivate,
      };
    }

    private updateMetadata() {
      void this.setMatchmaking({ metadata: this.buildMetadata() });
    }

    // ─── match ─────────────────────────────────────────────────────────────

    private registerGameMessages() {
      for (const [type, definition] of Object.entries(game.messages)) {
        this.onMessage(type, (client, message: unknown) => {
          if (this.state.phase !== 'playing' || !this.ctx) return;
          if (!this.matchPlayers.some((p) => p.id === client.sessionId)) return;
          const parsed = definition.schema.safeParse(message);
          if (!parsed.success) return;
          this.runGame(() => definition.handle(this.ctx!, client.sessionId, parsed.data));
        });
      }
    }

    private startMatch() {
      this.idleTimer?.clear();
      const players = [...this.state.players.entries()].sort(
        ([, a], [, b]) => a.joinedAt - b.joinedAt,
      );
      this.matchPlayers = players.map(([id, p]) => ({ id, name: p.name, isGuest: p.isGuest }));
      this.matchIdentities = new Map(players.map(([id]) => [id, this.identities.get(id)!]));
      this.revealed.clear();
      this.revealedToAll.clear();
      for (const client of this.clients) client.view = new StateView();

      this.state.game = new game.State();
      this.state.phase = 'playing';
      this.startedAt = Date.now();
      this.ctx = this.createContext(JSON.parse(this.state.settings));
      void this.lock();
      this.updateMetadata();

      this.runGame(() => game.setup(this.ctx!));
      if (manifest.realtime && game.tick) {
        const tick = game.tick;
        this.setSimulationInterval(
          (dt) => this.runGame(() => tick(this.ctx!, dt)),
          1000 / manifest.tickRate,
        );
      }
    }

    /** Run game code, then end the match if the game says it's over. */
    private runGame(fn: () => void) {
      try {
        fn();
      } catch (error) {
        services.log('error', `${manifest.id}: game code threw`, { error: String(error) });
        return;
      }
      if (this.state.phase !== 'playing' || !this.ctx) return;
      const results = game.isOver(this.ctx);
      if (results) this.endMatch(results);
    }

    private endMatch(results: GameResults) {
      this.endMatchTimers();
      this.ctx = null;
      const endedAt = Date.now();
      const names = Object.fromEntries(this.matchPlayers.map((p) => [p.id, p.name]));
      for (const [id, identity] of this.matchIdentities) names[id] ??= identity.name;

      this.state.results = JSON.stringify({
        ...results,
        names,
        startedAt: this.startedAt,
        endedAt,
      } satisfies MatchResults);
      this.state.phase = 'results';
      this.unreadyAll();
      void this.unlock();
      this.resetIdleTimer();
      this.updateMetadata();
      void this.record(results, endedAt);
    }

    private endMatchTimers() {
      this.setSimulationInterval(undefined);
      for (const timer of this.matchTimers) timer.clear();
      this.matchTimers.clear();
    }

    /** Only matches with at least one registered player are stored. */
    private async record(results: GameResults, endedAt: number) {
      const players = results.players.flatMap((r) => {
        const identity = this.matchIdentities.get(r.playerId);
        if (!identity) return [];
        return [
          {
            userId: identity.userId,
            name: identity.name,
            rank: r.rank,
            score: r.score ?? null,
            stats: r.stats ?? {},
          },
        ];
      });
      if (!players.some((p) => p.userId)) return;
      try {
        await services.recordMatch({
          gameId: manifest.id,
          gameVersion: manifest.version,
          mode: results.mode ?? null,
          startedAt: new Date(this.startedAt).toISOString(),
          endedAt: new Date(endedAt).toISOString(),
          players,
        });
      } catch (error) {
        services.log('error', 'Failed to record match', {
          gameId: manifest.id,
          error: String(error),
        });
      }
    }

    private createContext(settings: unknown): GameContext<Schema, unknown> {
      const random = createRandom(nextSeed());
      const room = this;
      const view = (playerId: string) => room.clients.getById(playerId)?.view;
      return {
        get state() {
          return room.state.game;
        },
        players: this.matchPlayers,
        settings,
        hasFeature(featureId, playerId) {
          const feature = manifest.features.find((f) => f.id === featureId);
          if (!feature) return false;
          if (feature.scope === 'lobby') return room.state.features.includes(featureId);
          const access = playerId ? (room.accessBySession.get(playerId) ?? null) : null;
          return hasFeature(room.lobbyContext(room.hostAccess), feature, access, room.config);
        },
        random,
        randomInt: (max) => Math.floor(random() * max),
        now: () => Date.now(),
        reveal(playerId, obj) {
          const set = room.revealed.get(playerId) ?? new Set<Schema>();
          room.revealed.set(playerId, set);
          set.add(obj);
          view(playerId)?.add(obj);
        },
        revealToAll(obj) {
          room.revealedToAll.add(obj);
          for (const client of room.clients) client.view?.add(obj);
        },
        hide(playerId, obj) {
          room.revealed.get(playerId)?.delete(obj);
          view(playerId)?.remove(obj);
        },
        send(playerId, type, message) {
          room.clients.getById(playerId)?.send(type, message);
        },
        broadcast(type, message) {
          room.broadcast(type, message);
        },
        setTimeout(callback, ms) {
          const delayed = room.clock.setTimeout(() => {
            room.matchTimers.delete(timer);
            room.runGame(callback);
          }, ms);
          const timer: Timer = { clear: () => delayed.clear() };
          room.matchTimers.add(timer);
          return timer;
        },
      };
    }
  };
}

export type GameRoomClass = ReturnType<typeof createGameRoom>;
