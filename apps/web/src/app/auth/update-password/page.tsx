'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button, Card, ErrorText, Input, Label } from '@/components/ui';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && !session) {
    return (
      <Card className="mx-auto max-w-sm text-center text-sm text-zinc-500">
        This reset link has expired. Request a new one from the sign-in page.
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-sm">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const { error } = await supabaseBrowser().auth.updateUser({ password });
          setBusy(false);
          if (error) setError(error.message);
          else router.replace('/profile');
        }}
      >
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy}>
          Save password
        </Button>
      </form>
    </Card>
  );
}
