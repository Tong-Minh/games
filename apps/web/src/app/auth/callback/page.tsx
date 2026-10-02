'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { supabaseBrowser } from '@/lib/supabase/client';

/**
 * Landing page for Google sign-in, email confirmation and password-reset links. The browser
 * client exchanges the `?code=` for a session as it initializes, so no server route is needed.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fail = params.get('error_description') ?? params.get('error');
    if (fail) {
      setError(fail);
      return;
    }
    const next = params.get('next');
    const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/';
    supabaseBrowser()
      .auth.getSession()
      .then(({ data, error }) => {
        if (error || !data.session)
          setError(error?.message ?? 'This link is invalid or has expired.');
        else router.replace(safeNext);
      });
  }, [router]);

  return (
    <Card className="mx-auto max-w-sm space-y-2 text-center">
      {error ? (
        <>
          <h1 className="text-xl font-semibold">Sign-in failed</h1>
          <p className="text-sm text-zinc-500">{error}</p>
          <Link
            href="/login"
            className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Try again
          </Link>
        </>
      ) : (
        <p className="text-zinc-500">Signing you in…</p>
      )}
    </Card>
  );
}
