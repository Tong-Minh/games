import { GameCard } from '@/components/GameCard';
import { JoinByCode } from '@/components/JoinByCode';
import { LobbyBrowser } from '@/components/LobbyBrowser';
import { Card } from '@/components/ui';
import { manifests } from '@/games.gen';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="grid gap-6 md:grid-cols-[1fr_22rem] md:items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{SITE_NAME}</h1>
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">{SITE_TAGLINE}</p>
        </div>
        <Card>
          <h2 className="mb-3 font-semibold">Got a code?</h2>
          <JoinByCode />
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Games</h2>
        {manifests.length === 0 ? (
          <p className="text-sm text-zinc-500">No games yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {manifests.map((manifest) => (
              <GameCard key={manifest.id} manifest={manifest} />
            ))}
          </div>
        )}
      </section>

      <section>
        <LobbyBrowser />
      </section>
    </div>
  );
}
