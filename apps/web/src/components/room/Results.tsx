'use client';

import { LobbyMessage, type MatchResults } from '@games/game-sdk';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button, Card } from '@/components/ui';
import type { RoomView } from './useRoomView';

const medals = ['🥇', '🥈', '🥉'];

export function Results({ view, onLeave }: { view: RoomView; onLeave(): void }) {
  const { session } = useAuth();
  const raw = view.room.state.results;
  if (!raw) return null;
  const results: MatchResults = JSON.parse(raw);
  const minutes = Math.max(1, Math.round((results.endedAt - results.startedAt) / 60_000));

  return (
    <Card className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Match over</h2>
        <p className="text-sm text-zinc-500">
          {minutes} min{results.mode ? ` · ${results.mode}` : ''}
        </p>
      </div>
      <ol className="mx-auto max-w-md space-y-2">
        {results.players.map((player) => (
          <li
            key={player.playerId}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
              player.playerId === view.me
                ? 'bg-indigo-50 dark:bg-indigo-950/50'
                : 'bg-zinc-50 dark:bg-zinc-800/50'
            }`}
          >
            <span className="w-8 text-center text-xl">
              {medals[player.rank - 1] ?? `#${player.rank}`}
            </span>
            <span className="flex-1 font-medium">
              {results.names[player.playerId] ?? 'Player'}
              {player.playerId === view.me && <span className="text-zinc-500"> (you)</span>}
            </span>
            {player.score !== undefined && <span className="font-mono">{player.score}</span>}
          </li>
        ))}
      </ol>
      {!session && (
        <p className="text-center text-sm text-zinc-500">
          <Link
            href="/signup"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Create an account
          </Link>{' '}
          to keep your stats and get on the leaderboard.
        </p>
      )}
      <div className="flex justify-center gap-3">
        <Button variant="secondary" onClick={onLeave}>
          Leave
        </Button>
        {view.isHost ? (
          <Button onClick={() => view.room.send(LobbyMessage.Again)}>Back to lobby</Button>
        ) : (
          <p className="self-center text-sm text-zinc-500">Waiting for the host…</p>
        )}
      </div>
    </Card>
  );
}
