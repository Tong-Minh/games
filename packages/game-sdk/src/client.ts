import type { ComponentType } from 'react';

export interface PlayerView {
  /** Session id; the same value games see as `playerId` on the server. */
  id: string;
  name: string;
  avatarUrl: string;
  isGuest: boolean;
  isHost: boolean;
  connected: boolean;
}

/**
 * What the platform's game shell passes to a game's client component. `state` is the game's
 * synced schema (read-only on the client) and updates on every server patch.
 */
export interface GameProps<State = unknown, Settings = unknown> {
  state: State;
  /** This player's id. */
  me: string;
  players: readonly PlayerView[];
  settings: Settings;
  /** Lobby-scoped features enabled by the host. */
  hasFeature(featureId: string): boolean;
  send(type: string, message?: unknown): void;
  /** Listen for one-off messages from the game (`ctx.send` / `ctx.broadcast`). Returns unsubscribe. */
  onMessage<T = unknown>(type: string, callback: (message: T) => void): () => void;
}

// biome-ignore lint/suspicious/noExplicitAny: game components are registered heterogeneously.
export type GameComponent = ComponentType<GameProps<any, any>>;
