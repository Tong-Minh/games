'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { JoinByCode } from '@/components/JoinByCode';
import { usePlay } from '@/components/providers/PlayProvider';
import { Chat } from '@/components/room/Chat';
import { GameShell } from '@/components/room/GameShell';
import { LobbyPanel } from '@/components/room/LobbyPanel';
import { Results } from '@/components/room/Results';
import { useRoomView } from '@/components/room/useRoomView';
import { Button, Card } from '@/components/ui';

export default function PlayPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { room, resume, leave, notice, dismissNotice, serverError } = usePlay();
  const view = useRoomView();
  const [status, setStatus] = useState<'connecting' | 'lost' | 'ready'>(
    room?.roomId === roomId ? 'ready' : 'connecting',
  );

  useEffect(() => {
    if (room?.roomId === roomId) {
      setStatus('ready');
      return;
    }
    if (room) return;
    let cancelled = false;
    resume(roomId).then((resumed) => {
      if (!cancelled) setStatus(resumed ? 'ready' : 'lost');
    });
    return () => {
      cancelled = true;
    };
  }, [room, roomId, resume]);

  // Left the room (kicked, idle, or another room joined): show why, or go home.
  useEffect(() => {
    if (status === 'ready' && !room) setStatus('lost');
  }, [room, status]);

  async function handleLeave() {
    await leave();
    router.push(view?.manifest ? `/games/${view.manifest.id}` : '/');
  }

  if (status === 'connecting') {
    return <p className="py-20 text-center text-zinc-500">Connecting to the lobby…</p>;
  }

  if (!view || view.room.roomId !== roomId) {
    return (
      <Card className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">{notice ?? "You're not in this lobby"}</h1>
        <p className="text-sm text-zinc-500">Have a code? Join with it below.</p>
        <JoinByCode />
        <Link
          href="/"
          onClick={dismissNotice}
          className="inline-block text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Back to all games
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {view.outdated && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          A new version of this game is out. Reload to update.
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      )}
      {serverError && (
        <div
          role="alert"
          className="rounded-lg bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {serverError}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{view.manifest?.name ?? view.room.state.gameId}</h1>
        {view.phase !== 'results' && (
          <Button variant="ghost" onClick={handleLeave}>
            Leave
          </Button>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          {view.phase === 'lobby' && <LobbyPanel view={view} />}
          {view.phase === 'playing' && <GameShell view={view} />}
          {view.phase === 'results' && <Results view={view} onLeave={handleLeave} />}
        </div>
        <Chat me={view.me} />
      </div>
    </div>
  );
}
