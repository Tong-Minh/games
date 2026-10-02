import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CreateLobby } from '@/components/CreateLobby';
import { playerRange } from '@/components/GameCard';
import { Leaderboard } from '@/components/Leaderboard';
import { LobbyBrowser } from '@/components/LobbyBrowser';
import { Card } from '@/components/ui';
import { manifests } from '@/games.gen';

// Every game page is generated at build time from the registry.
export const dynamicParams = false;

export function generateStaticParams() {
  return manifests.map((m) => ({ gameId: m.id }));
}

const find = (id: string) => manifests.find((m) => m.id === id);

export async function generateMetadata(props: PageProps<'/games/[gameId]'>): Promise<Metadata> {
  const manifest = find((await props.params).gameId);
  return manifest ? { title: manifest.name, description: manifest.description } : {};
}

export default async function GamePage(props: PageProps<'/games/[gameId]'>) {
  const manifest = find((await props.params).gameId);
  if (!manifest) notFound();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        <section>
          <h1 className="text-3xl font-bold tracking-tight">{manifest.name}</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">{manifest.description}</p>
          <p className="mt-2 text-sm text-zinc-500">
            {playerRange(manifest)} · {manifest.realtime ? 'real-time' : 'turn-based'}
          </p>
        </section>
        <Card>
          <h2 className="mb-3 font-semibold">Start a lobby</h2>
          <CreateLobby gameId={manifest.id} />
        </Card>
        <LobbyBrowser gameId={manifest.id} />
      </div>
      <aside>
        <Leaderboard gameId={manifest.id} />
      </aside>
    </div>
  );
}
