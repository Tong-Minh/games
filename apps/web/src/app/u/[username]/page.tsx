'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar, Card } from '@/components/ui';
import { manifests } from '@/games.gen';
import { supabaseBrowser } from '@/lib/supabase/client';

interface Data {
  profile: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    created_at: string;
  };
  stats: Array<{ game_id: string; games: number; wins: number; best_score: number | null }>;
  matches: Array<{
    id: string;
    game_id: string;
    ended_at: string;
    players: Array<{ userId: string | null; name: string; rank: number }>;
  }>;
}

const gameName = (id: string) => manifests.find((m) => m.id === id)?.name ?? id;

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [data, setData] = useState<Data | null | 'missing'>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, created_at')
        .ilike('username', username.replace(/[\\%_]/g, '\\$&'))
        .maybeSingle();
      if (!profile) return setData('missing');
      const [stats, matches] = await Promise.all([
        supabase
          .from('leaderboard_stats')
          .select('game_id, games, wins, best_score')
          .eq('user_id', profile.id)
          .order('games', { ascending: false }),
        supabase
          .from('game_results')
          .select('id, game_id, ended_at, players')
          .contains('player_ids', [profile.id])
          .order('ended_at', { ascending: false })
          .limit(20),
      ]);
      setData({
        profile,
        stats: stats.data ?? [],
        matches: (matches.data ?? []) as Data['matches'],
      });
    })();
  }, [username]);

  if (data === null) return <p className="py-20 text-center text-zinc-500">Loading…</p>;
  if (data === 'missing')
    return <p className="py-20 text-center text-zinc-500">No player called {username}.</p>;

  const { profile, stats, matches } = data;
  const totalWins = stats.reduce((sum, s) => sum + s.wins, 0);
  const totalGames = stats.reduce((sum, s) => sum + s.games, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Avatar name={profile.display_name} url={profile.avatar_url} size={64} />
        <div>
          <h1 className="text-2xl font-bold">{profile.display_name}</h1>
          <p className="text-sm text-zinc-500">
            @{profile.username} · {totalWins} wins in {totalGames} games
          </p>
        </div>
      </div>

      {stats.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Games</h2>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {stats.map((s) => (
              <li key={s.game_id} className="flex justify-between py-2 text-sm">
                <Link href={`/games/${s.game_id}`} className="font-medium hover:underline">
                  {gameName(s.game_id)}
                </Link>
                <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                  {s.wins} wins / {s.games} played
                  {s.best_score !== null && ` · best ${s.best_score}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">Recent matches</h2>
        {matches.length === 0 ? (
          <p className="text-sm text-zinc-500">No matches yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {matches.map((match) => {
              const me = match.players.find((p) => p.userId === profile.id);
              return (
                <li key={match.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{gameName(match.game_id)}</span>
                    <span className="text-zinc-500">
                      {' '}
                      · {match.players.length} {match.players.length === 1 ? 'player' : 'players'}
                    </span>
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {me?.rank === 1 ? 'Won' : me ? `#${me.rank}` : ''} ·{' '}
                    {new Date(match.ended_at).toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
