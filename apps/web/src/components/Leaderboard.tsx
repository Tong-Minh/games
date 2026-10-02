'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Avatar } from './ui';

interface Row {
  games: number;
  wins: number;
  best_score: number | null;
  profiles: { username: string; display_name: string; avatar_url: string | null } | null;
}

export function Leaderboard({ gameId, limit = 10 }: { gameId: string; limit?: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .from('leaderboard_stats')
      .select('games, wins, best_score, profiles(username, display_name, avatar_url)')
      .eq('game_id', gameId)
      .order('wins', { ascending: false })
      .order('games', { ascending: true })
      .limit(limit)
      .then(({ data }) => setRows((data as Row[] | null) ?? []));
  }, [gameId, limit]);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Leaderboard</h2>
      {rows === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No ranked matches yet. Sign in and play to get on the board.
        </p>
      ) : (
        <ol className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {rows.map((row, i) => (
            <li key={row.profiles?.username ?? i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-5 text-right font-mono text-sm text-zinc-500">{i + 1}</span>
              <Avatar
                name={row.profiles?.display_name ?? '?'}
                url={row.profiles?.avatar_url}
                size={24}
              />
              <Link
                href={`/u/${row.profiles?.username}`}
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {row.profiles?.display_name}
              </Link>
              <span className="text-sm tabular-nums">
                <strong>{row.wins}</strong>
                <span className="text-zinc-500"> wins / {row.games}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
