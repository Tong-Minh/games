import { schema, t } from '@colyseus/schema';

/**
 * Platform-owned room state. Each game's room state extends this with a `game` field
 * holding the game's own schema.
 */
export const LobbyPlayer = schema(
  {
    name: t.string(),
    isGuest: t.boolean(),
    avatarUrl: t.string().default(''),
    ready: t.boolean().default(false),
    connected: t.boolean().default(true),
    /** Join order, used for host migration. */
    joinedAt: t.number(),
  },
  'LobbyPlayer',
);
export type LobbyPlayer = InstanceType<typeof LobbyPlayer>;

export const LobbyState = schema(
  {
    gameId: t.string(),
    gameVersion: t.uint16(),
    phase: t.string().default('lobby'),
    /** Session id of the host. */
    hostId: t.string().default(''),
    isPrivate: t.boolean(),
    /** Join code, shown to everyone in the lobby. */
    code: t.string(),
    /** JSON of the validated game settings. */
    settings: t.string().default('{}'),
    /** Lobby-scoped features the host has enabled. */
    features: t.array('string'),
    players: t.map(LobbyPlayer),
    /** JSON of the last match's `MatchResults`, set when phase is `results`. */
    results: t.string().default(''),
  },
  'LobbyState',
);
export type LobbyState = InstanceType<typeof LobbyState>;

export type LobbyPhase = 'lobby' | 'playing' | 'results';

/** Messages handled by the platform. Game messages must not use the `lobby:` prefix. */
export const LobbyMessage = {
  /** client → server `{ ready: boolean }` */
  Ready: 'lobby:ready',
  /** client → server `{ text: string }`; server → clients `ChatMessage` */
  Chat: 'lobby:chat',
  /** host → server `{ playerId: string }` */
  Kick: 'lobby:kick',
  /** host → server `{ settings: object }` */
  Settings: 'lobby:settings',
  /** host → server `{ features: string[] }` */
  Features: 'lobby:features',
  /** host → server, no payload */
  Start: 'lobby:start',
  /** host → server, no payload: back to the lobby after results */
  Again: 'lobby:again',
  /** server → client `{ message: string }` when a request is rejected */
  Error: 'lobby:error',
} as const;

export interface ChatMessage {
  from: string;
  name: string;
  text: string;
  at: number;
}

/** Close codes the platform uses when removing a client. */
export const CloseCode = {
  Kicked: 4100,
  Idle: 4101,
} as const;

/** What a game reports when a match ends. Ranks start at 1; ties share a rank. */
export interface GameResults {
  players: Array<{
    playerId: string;
    rank: number;
    score?: number;
    stats?: Record<string, unknown>;
  }>;
  mode?: string;
}

/** What the platform publishes in `state.results` after a match. */
export interface MatchResults extends GameResults {
  names: Record<string, string>;
  startedAt: number;
  endedAt: number;
}

/** Room metadata used by the lobby browser. */
export interface LobbyMetadata {
  gameId: string;
  gameVersion: number;
  hostName: string;
  phase: LobbyPhase;
  isPrivate: boolean;
}
