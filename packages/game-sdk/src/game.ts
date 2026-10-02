import type { Schema } from '@colyseus/schema';
import type { z } from 'zod';
import type { GameResults } from './lobby';
import type { GameManifest } from './manifest';

export interface PlayerInfo {
  /** Stable for the whole match, including across reconnects. */
  id: string;
  name: string;
  isGuest: boolean;
}

export interface Timer {
  clear(): void;
}

/** Everything a game can see and do. The platform owns the room; games only get this. */
export interface GameContext<State, Settings> {
  state: State;
  /** Players in this match, in seat order. Players who left mid-match are removed. */
  readonly players: readonly PlayerInfo[];
  readonly settings: Settings;
  /** Lobby-scoped features are on for everyone; player-scoped ones need `playerId`. */
  hasFeature(featureId: string, playerId?: string): boolean;
  /** Seeded per match; use instead of Math.random so tests can be deterministic. */
  random(): number;
  /** Integer in [0, maxExclusive). */
  randomInt(maxExclusive: number): number;
  now(): number;
  /** Hidden information: make `obj` (a schema field marked `.view()`) visible to one player. */
  reveal(playerId: string, obj: Schema): void;
  /** Reveal `obj` to every player, e.g. at a showdown. */
  revealToAll(obj: Schema): void;
  hide(playerId: string, obj: Schema): void;
  /** One-off message to one player (not part of synced state). */
  send(playerId: string, type: string, message?: unknown): void;
  broadcast(type: string, message?: unknown): void;
  /** Timers are cancelled automatically when the match ends. `isOver` is checked after each. */
  setTimeout(callback: () => void, ms: number): Timer;
}

export interface MessageDefinition<Ctx, S extends z.ZodType> {
  schema: S;
  handle(ctx: Ctx, playerId: string, message: z.output<S>): void;
}

export interface GameDefinition<
  State extends Schema = Schema,
  Settings = unknown,
  Messages extends Record<string, z.ZodType> = Record<string, z.ZodType>,
> {
  manifest: GameManifest;
  /** Schema class for the game's synced state. Created fresh for every match. */
  State: new () => State;
  /** Called once at match start, after `state` is created. */
  setup(ctx: GameContext<State, Settings>): void;
  /** Client messages. Payloads are validated against `schema` before `handle` runs. */
  messages: {
    [K in keyof Messages]: MessageDefinition<GameContext<State, Settings>, Messages[K]>;
  };
  /** Real-time games only: runs `manifest.tickRate` times per second. */
  tick?(ctx: GameContext<State, Settings>, dtMs: number): void;
  /** A player left mid-match for good (reconnection window expired or they quit). */
  onPlayerLeave?(ctx: GameContext<State, Settings>, playerId: string): void;
  /** Checked after every message, tick and timer. Return results to end the match. */
  isOver(ctx: GameContext<State, Settings>): GameResults | null;
}

export function defineGame<
  M extends GameManifest,
  State extends Schema,
  Messages extends Record<string, z.ZodType>,
>(
  manifest: M,
  definition: Omit<GameDefinition<State, z.output<M['settings']>, Messages>, 'manifest'>,
): GameDefinition<State, z.output<M['settings']>, Messages> {
  for (const type of Object.keys(definition.messages)) {
    if (type.startsWith('lobby:'))
      throw new Error(`${manifest.id}: "${type}" uses a reserved prefix`);
  }
  if (manifest.realtime && !definition.tick) {
    throw new Error(`${manifest.id}: real-time games must define tick()`);
  }
  return { manifest, ...definition };
}

// biome-ignore lint/suspicious/noExplicitAny: registry entries are heterogeneous.
export type AnyGameDefinition = GameDefinition<any, any, any>;
