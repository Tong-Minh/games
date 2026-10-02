'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { usePlay } from '@/components/providers/PlayProvider';
import { Card } from '@/components/ui';

/** Invite links: /join/ABC123 */
export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const { joinByCode } = usePlay();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    joinByCode(code)
      .then((room) => router.replace(`/play/${room.roomId}`))
      .catch((err: Error) => setError(err.message));
  }, [code, joinByCode, router]);

  return (
    <Card className="mx-auto max-w-md space-y-3 text-center">
      {error ? (
        <>
          <h1 className="text-xl font-semibold">Couldn&apos;t join</h1>
          <p className="text-sm text-zinc-500">{error}</p>
          <Link href="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
            Back to all games
          </Link>
        </>
      ) : (
        <p className="text-zinc-500">
          Joining lobby <span className="font-mono font-semibold">{code.toUpperCase()}</span>…
        </p>
      )}
    </Card>
  );
}
