'use client';

import { useState } from 'react';
import { Button, Card, ErrorText, Input, Label } from '@/components/ui';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <Card className="mx-auto max-w-sm space-y-2 text-center">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-zinc-500">
          If an account exists for <strong>{email}</strong>, you&apos;ll get a link to reset your
          password.
        </p>
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
          const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
          });
          setBusy(false);
          if (error) setError(error.message);
          else setSent(true);
        }}
      >
        <h1 className="text-xl font-semibold">Reset your password</h1>
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
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy}>
          Send reset link
        </Button>
      </form>
    </Card>
  );
}
