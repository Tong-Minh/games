'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Label } from './ui';

export function GuestNameDialog({
  initialName,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  onSubmit(name: string): void;
  onCancel(): void;
}) {
  const [name, setName] = useState(initialName);
  const dialog = useRef<HTMLDialogElement>(null);
  const valid = name.trim().length >= 2;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(24rem,calc(100%-2rem))] rounded-xl bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-black/50 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSubmit(name.trim());
        }}
        className="space-y-4"
      >
        <div>
          <h2 className="text-lg font-semibold">Play as a guest</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Pick a name other players will see. Guest stats aren&apos;t saved.
          </p>
        </div>
        <div>
          <Label htmlFor="guest-name">Name</Label>
          <Input
            id="guest-name"
            value={name}
            maxLength={20}
            autoFocus
            autoComplete="nickname"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/login"
            onClick={onCancel}
            className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Sign in instead
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              Play
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
