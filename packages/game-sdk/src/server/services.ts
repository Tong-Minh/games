import type { MonetizationConfig, PlayerAccess } from '@games/shared';

/** Who is connecting. Registered users have a `userId`; guests don't. */
export interface Identity {
  /** `userId` for registered players, `guest:<random>` for guests. */
  id: string;
  userId: string | null;
  name: string;
  avatarUrl: string;
}

export interface MatchRecord {
  gameId: string;
  gameVersion: number;
  mode: string | null;
  startedAt: string;
  endedAt: string;
  players: Array<{
    userId: string | null;
    name: string;
    rank: number;
    score: number | null;
    stats: Record<string, unknown>;
  }>;
}

/** Everything the room needs from the outside world. The game server provides the real one. */
export interface PlatformServices {
  /** Resolve a Supabase JWT or guest token. Throws if invalid or missing. */
  authenticate(token: string | undefined): Promise<Identity>;
  getMonetizationConfig(): Promise<MonetizationConfig>;
  getPlayerAccess(userId: string): Promise<PlayerAccess>;
  recordMatch(record: MatchRecord): Promise<void>;
  /** Join codes must be unique across processes; backed by Colyseus presence. */
  claimCode(code: string, roomId: string): Promise<boolean>;
  releaseCode(code: string): Promise<void>;
  log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void;
}
