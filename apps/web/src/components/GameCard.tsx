import type { GameManifest } from '@games/game-sdk';
import Link from 'next/link';

export function playerRange(manifest: Pick<GameManifest, 'minPlayers' | 'maxPlayers'>) {
  return manifest.minPlayers === manifest.maxPlayers
    ? `${manifest.minPlayers} players`
    : `${manifest.minPlayers}–${manifest.maxPlayers} players`;
}

export function GameCard({ manifest }: { manifest: GameManifest }) {
  return (
    <Link
      href={`/games/${manifest.id}`}
      className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-indigo-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500"
    >
      <h3 className="text-lg font-semibold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
        {manifest.name}
      </h3>
      <p className="mt-1 flex-1 text-sm text-zinc-600 dark:text-zinc-400">{manifest.description}</p>
      <p className="mt-4 text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {playerRange(manifest)}
        {manifest.realtime ? ' · real-time' : ' · turn-based'}
      </p>
    </Link>
  );
}
