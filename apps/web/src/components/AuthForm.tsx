'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button, Card, ErrorText, Input, Label } from './ui';

const callbackUrl = (next = '/') =>
  `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

export function GoogleButton() {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        className="w-full"
        onClick={async () => {
          const { error } = await supabaseBrowser().auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: callbackUrl() },
          });
          if (error) setError(error.message);
        }}
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path
            fill="#4285F4"
            d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2-1.9 3.2-4.7 3.2-8.2Z"
          />
          <path
            fill="#34A853"
            d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23Z"
          />
          <path
            fill="#FBBC05"
            d="M5.7 14c-.2-.7-.4-1.4-.4-2s.1-1.4.4-2V7.1H2A11 11 0 0 0 1 12c0 1.8.4 3.4 1.1 4.9L5.7 14Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7.1L5.7 10C6.6 7.3 9.1 5.4 12 5.4Z"
          />
        </svg>
        Continue with Google
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const signup = mode === 'signup';

  if (checkEmail) {
    return (
      <Card className="mx-auto max-w-sm space-y-2 text-center">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-zinc-500">
          We sent a confirmation link to <strong>{email}</strong>. Open it to finish signing up.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-sm space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{signup ? 'Create an account' : 'Sign in'}</h1>
        <p className="text-sm text-zinc-500">
          {signup ? 'Keep your stats and climb the leaderboards.' : 'Welcome back.'}
        </p>
      </div>
      <GoogleButton />
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const auth = supabaseBrowser().auth;
          const result = signup
            ? await auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl() } })
            : await auth.signInWithPassword({ email, password });
          setBusy(false);
          if (result.error) return setError(result.error.message);
          if (signup && !result.data.session) return setCheckEmail(true);
          router.push('/');
          router.refresh();
        }}
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            {!signup && (
              <Link
                href="/auth/forgot"
                className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <Input
            id="password"
            type="password"
            required
            minLength={signup ? 8 : undefined}
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {signup && <p className="mt-1 text-xs text-zinc-500">At least 8 characters.</p>}
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
        </Button>
      </form>
      <p className="text-center text-sm text-zinc-500">
        {signup ? 'Already have an account? ' : 'New here? '}
        <Link
          href={signup ? '/login' : '/signup'}
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {signup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
      <p className="text-center text-xs text-zinc-500">
        You can always play as a guest without an account.
      </p>
    </Card>
  );
}
