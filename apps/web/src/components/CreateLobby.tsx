'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { usePlay } from './providers/PlayProvider';
import { Button, ErrorText } from './ui';

export function CreateLobby({ gameId }: { gameId: string }) {
  const { create } = usePlay();
  const router = useRouter();
  const [busy, setBusy] = useState<'public' | 'private' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(isPrivate: boolean) {
    setBusy(isPrivate ? 'private' : 'public');
    setError(null);
    try {
      const room = await create(gameId, { private: isPrivate });
      router.push(`/play/${room.roomId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => start(true)} disabled={busy !== null}>
          {busy === 'private' ? 'Creating…' : 'Private lobby'}
        </Button>
        <Button variant="secondary" onClick={() => start(false)} disabled={busy !== null}>
          {busy === 'public' ? 'Creating…' : 'Public lobby'}
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        Private lobbies are joined with a code or invite link. Public ones show up in the lobby
        list.
      </p>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
