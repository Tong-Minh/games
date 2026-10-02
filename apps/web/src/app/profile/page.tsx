'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Avatar, Button, Card, ErrorText, Input, Label } from '@/components/ui';
import { supabaseBrowser } from '@/lib/supabase/client';

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

export default function ProfilePage() {
  const { session, profile, loading, refreshProfile, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  if (!profile) return <p className="py-20 text-center text-zinc-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-4">
        <Avatar name={profile.display_name} url={profile.avatar_url} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{profile.display_name}</h1>
          <Link
            href={`/u/${profile.username}`}
            className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            View public profile
          </Link>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            await signOut();
            router.push('/');
          }}
        >
          Sign out
        </Button>
      </div>
      <EditProfile key={profile.id} initial={profile} onSaved={refreshProfile} />
      <DeleteAccount accessToken={session?.access_token ?? ''} onDeleted={signOut} />
    </div>
  );
}

function EditProfile({
  initial,
  onSaved,
}: {
  initial: { id: string; username: string; display_name: string };
  onSaved(): Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [username, setUsername] = useState(initial.username);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = displayName !== initial.display_name || username !== initial.username;

  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!USERNAME.test(username)) {
            setMessage({ ok: false, text: 'Usernames are 3–20 letters, numbers or underscores.' });
            return;
          }
          setBusy(true);
          const { error } = await supabaseBrowser()
            .from('profiles')
            .update({ display_name: displayName.trim(), username })
            .eq('id', initial.id);
          setBusy(false);
          if (error) {
            setMessage({
              ok: false,
              text: error.code === '23505' ? 'That username is taken.' : error.message,
            });
            return;
          }
          setMessage({ ok: true, text: 'Saved.' });
          await onSaved();
        }}
      >
        <h2 className="font-semibold">Profile</h2>
        <div>
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            required
            maxLength={32}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            required
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">Used in your profile link.</p>
        </div>
        {message &&
          (message.ok ? (
            <p className="text-sm text-emerald-600">{message.text}</p>
          ) : (
            <ErrorText>{message.text}</ErrorText>
          ))}
        <Button type="submit" disabled={!dirty || busy}>
          Save
        </Button>
      </form>
    </Card>
  );
}

function DeleteAccount({
  accessToken,
  onDeleted,
}: {
  accessToken: string;
  onDeleted(): Promise<void>;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card className="space-y-3 border-red-200 dark:border-red-900">
      <h2 className="font-semibold text-red-700 dark:text-red-400">Delete account</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This permanently deletes your account, profile and stats. Past matches stay in other
        players&apos; history as &ldquo;Deleted player&rdquo;. This can&apos;t be undone.
      </p>
      <div>
        <Label htmlFor="confirm-delete">
          Type <strong>delete</strong> to confirm
        </Label>
        <Input
          id="confirm-delete"
          autoComplete="off"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button
        variant="danger"
        disabled={confirm !== 'delete' || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const response = await fetch('/api/account', {
            method: 'DELETE',
            headers: { authorization: `Bearer ${accessToken}` },
          });
          if (!response.ok) {
            setBusy(false);
            setError((await response.json().catch(() => ({}))).message ?? 'Something went wrong.');
            return;
          }
          // Navigate first so the profile page doesn't redirect to sign-in when the session ends.
          router.replace('/');
          await onDeleted().catch(() => {});
        }}
      >
        {busy ? 'Deleting…' : 'Delete my account'}
      </Button>
    </Card>
  );
}
