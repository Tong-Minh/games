'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { usePlay } from './providers/PlayProvider';
import { Button, ErrorText, Input } from './ui';

export function JoinByCode() {
  const { joinByCode } = usePlay();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const room = await joinByCode(code);
          router.push(`/play/${room.roomId}`);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex gap-2">
        <Input
          aria-label="Lobby code"
          placeholder="Lobby code"
          value={code}
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          className="font-mono tracking-widest uppercase"
        />
        <Button type="submit" disabled={busy || code.trim().length < 6}>
          {busy ? 'Joining…' : 'Join'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}
