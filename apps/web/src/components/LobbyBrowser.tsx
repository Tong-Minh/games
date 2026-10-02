'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { manifests } from '@/games.gen';
import { describeJoinError, gameServer, type LobbyListing } from '@/lib/gameServer';
import { usePlay } from './providers/PlayProvider';
import { Button, ErrorText } from './ui';

const POLL_MS = 10_000;

/** Public lobbies, polled over plain HTTP while the tab is visible. */
export function LobbyBrowser({ gameId }: { gameId?: string }) {
  const { joinById } = usePlay();
  const router = useRouter();
  const [lobbies, setLobbies] = useState<LobbyListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLobbies(await gameServer.listLobbies(gameId));
      setError(null);
    } catch (err) {
      setError(describeJoinError(err));
    }
  }, [gameId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const nameOf = (id: string) => manifests.find((m) => m.id === id)?.name ?? id;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Open lobbies</h2>
        <Button variant="ghost" onClick={load}>
          Refresh
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {lobbies === null && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {lobbies?.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No open lobbies right now. Start one!
        </p>
      )}
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {lobbies?.map((lobby) => (
          <li key={lobby.roomId} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{lobby.hostName}&apos;s lobby</p>
              <p className="text-sm text-zinc-500">
                {!gameId && `${nameOf(lobby.gameId)} · `}
                {lobby.players}/{lobby.maxPlayers} players
                {lobby.phase === 'results' && ' · between matches'}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={joining !== null}
              onClick={async () => {
                setJoining(lobby.roomId);
                try {
                  const room = await joinById(lobby.roomId);
                  router.push(`/play/${room.roomId}`);
                } catch (err) {
                  setError((err as Error).message);
                  void load();
                } finally {
                  setJoining(null);
                }
              }}
            >
              {joining === lobby.roomId ? 'Joining…' : 'Join'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
