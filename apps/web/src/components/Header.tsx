'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SITE_NAME } from '@/lib/site';
import { useAuth } from './providers/AuthProvider';
import { usePlay } from './providers/PlayProvider';
import { Avatar } from './ui';

export function Header() {
  const { session, profile, loading } = useAuth();
  const { room } = usePlay();
  const pathname = usePathname();
  const inRoomPage = room && pathname === `/play/${room.roomId}`;

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          {SITE_NAME}
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {room && !inRoomPage && (
            <Link
              href={`/play/${room.roomId}`}
              className="rounded-full bg-indigo-600 px-3 py-1 font-semibold text-white"
            >
              Back to lobby
            </Link>
          )}
          {loading ? null : session ? (
            <Link href="/profile" className="flex items-center gap-2 hover:opacity-80">
              <Avatar name={profile?.display_name ?? '?'} url={profile?.avatar_url} size={28} />
              <span className="hidden sm:inline">{profile?.display_name}</span>
            </Link>
          ) : (
            <Link href="/login" className="font-medium hover:underline">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
