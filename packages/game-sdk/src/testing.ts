import type { Schema } from '@colyseus/schema';
import type { GameContext, GameDefinition, PlayerInfo } from './game';
import type { GameResults } from './lobby';
import { createRandom } from './server/util';

export interface TestContext<State, Settings> extends GameContext<State, Settings> {
  /** Send a client message through the game's schema validation, like the room does. */
  dispatch(playerId: string, type: string, message?: unknown): boolean;
  /** Run timers whose deadline has passed after moving the clock forward. */
  advance(ms: number): void;
  /** Run one tick (real-time games). */
  tick(dtMs?: number): void;
  /** Remove a player mid-match, as if they left. */
  leave(playerId: string): void;
  isOver(): GameResults | null;
  /** Objects revealed per player, to assert on hidden information. */
  revealed: Map<string, Set<Schema>>;
  sent: Array<{ to: string | '*'; type: string; message: unknown }>;
}

/**
 * Run a game's logic without a server, for fast unit tests.
 *
 * ```ts
 * const ctx = createTestContext(game, { players: 2 });
 * ctx.dispatch('p1', 'bid', { count: 2, face: 5 });
 * expect(ctx.isOver()).toBeNull();
 * ```
 */
export function createTestContext<State extends Schema, Settings>(
  // biome-ignore lint/suspicious/noExplicitAny: accepts any message map
  game: GameDefinition<State, Settings, any>,
  options: {
    players?: number | PlayerInfo[];
    settings?: Partial<Settings>;
    features?: string[];
    seed?: number;
  } = {},
): TestContext<State, Settings> {
  const players: PlayerInfo[] =
    typeof options.players === 'object'
      ? [...options.players]
      : Array.from({ length: options.players ?? game.manifest.minPlayers }, (_, i) => ({
          id: `p${i + 1}`,
          name: `Player ${i + 1}`,
          isGuest: false,
        }));
  const settings = game.manifest.settings.parse(options.settings ?? {}) as Settings;
  const features = new Set(options.features ?? []);
  const random = createRandom(options.seed ?? 1);
  let now = 0;
  const timers: Array<{ at: number; run: () => void; cleared: boolean }> = [];
  const revealed = new Map<string, Set<Schema>>();
  const sent: TestContext<State, Settings>['sent'] = [];

  const ctx: TestContext<State, Settings> = {
    state: new game.State(),
    players,
    settings,
    hasFeature: (id) => features.has(id),
    random,
    randomInt: (max) => Math.floor(random() * max),
    now: () => now,
    reveal(playerId, obj) {
      if (!revealed.has(playerId)) revealed.set(playerId, new Set());
      revealed.get(playerId)!.add(obj);
    },
    revealToAll(obj) {
      for (const p of players) ctx.reveal(p.id, obj);
    },
    hide(playerId, obj) {
      revealed.get(playerId)?.delete(obj);
    },
    send: (to, type, message) => void sent.push({ to, type, message }),
    broadcast: (type, message) => void sent.push({ to: '*', type, message }),
    setTimeout(run, ms) {
      const timer = { at: now + ms, run, cleared: false };
      timers.push(timer);
      return {
        clear: () => {
          timer.cleared = true;
        },
      };
    },
    dispatch(playerId, type, message) {
      const definition = game.messages[type];
      if (!definition) throw new Error(`Unknown message "${type}"`);
      const parsed = definition.schema.safeParse(message);
      if (!parsed.success) return false;
      definition.handle(ctx, playerId, parsed.data);
      return true;
    },
    advance(ms) {
      now += ms;
      for (const timer of timers.splice(0).sort((a, b) => a.at - b.at)) {
        if (timer.cleared) continue;
        if (timer.at <= now) timer.run();
        else timers.push(timer);
      }
    },
    tick(dtMs = 1000 / game.manifest.tickRate) {
      now += dtMs;
      game.tick?.(ctx, dtMs);
    },
    leave(playerId) {
      const index = players.findIndex((p) => p.id === playerId);
      if (index !== -1) players.splice(index, 1);
      game.onPlayerLeave?.(ctx, playerId);
    },
    isOver: () => game.isOver(ctx),
    revealed,
    sent,
  };
  game.setup(ctx);
  return ctx;
}
