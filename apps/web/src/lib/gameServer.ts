import { Client } from '@colyseus/sdk';
import { env } from './env';

export interface LobbyListing {
  roomId: string;
  gameId: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  phase: 'lobby' | 'playing' | 'results';
}

let client: Client | undefined;

export function gameClient(): Client {
  client ??= new Client(env.gameServerUrl);
  return client;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.gameServerUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `Request failed (${response.status})`);
  return body as T;
}

export const gameServer = {
  listLobbies: (gameId?: string) =>
    request<{ lobbies: LobbyListing[] }>(
      `/lobbies${gameId ? `?game=${encodeURIComponent(gameId)}` : ''}`,
    ).then((r) => r.lobbies),
  lookupCode: (code: string) =>
    request<{ roomId: string; gameId: string; code: string }>(
      `/lobbies/code/${encodeURIComponent(code.trim())}`,
    ),
  issueGuestToken: (name: string) =>
    request<{ token: string; name: string }>('/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
};

/** Turn matchmaking errors into something a player can read. */
export function describeJoinError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch|network|ECONNREFUSED/i.test(message)) return "Can't reach the game server.";
  return message || 'Something went wrong.';
}
