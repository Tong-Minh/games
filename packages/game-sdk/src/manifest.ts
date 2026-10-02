import type { FeatureScope } from '@games/shared';
import { z } from 'zod';

export interface FeatureDefinition {
  id: string;
  name: string;
  /** `lobby`: follows the host's ownership, applies to everyone. `player`: per player. */
  scope: FeatureScope;
}

export interface GameManifest<Settings extends z.ZodType = z.ZodType> {
  /** Lowercase kebab-case, unique. Used in URLs, SKUs and room names. */
  id: string;
  name: string;
  description: string;
  /** Path relative to the game package, or an absolute URL. */
  thumbnail?: string;
  /** Bump whenever state shape or messages change, so stale clients are told to reload. */
  version: number;
  minPlayers: number;
  maxPlayers: number;
  /** Default only; the `products` table overrides it. */
  tier: 'free' | 'paid';
  features: readonly FeatureDefinition[];
  /** Host-editable lobby settings. Every field needs a default. */
  settings: Settings;
  /** Real-time games get a fixed-rate `tick`; turn-based games are event-driven. */
  realtime: boolean;
  /** Ticks per second for real-time games. */
  tickRate: number;
}

export type ManifestInput<Settings extends z.ZodType> = Omit<
  GameManifest<Settings>,
  'tier' | 'features' | 'settings' | 'realtime' | 'tickRate'
> &
  Partial<Pick<GameManifest<Settings>, 'tier' | 'features' | 'realtime' | 'tickRate'>> & {
    settings?: Settings;
  };

const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function defineManifest<Settings extends z.ZodType = z.ZodObject<Record<string, never>>>(
  input: ManifestInput<Settings>,
): GameManifest<Settings> {
  const manifest: GameManifest<Settings> = {
    tier: 'free',
    features: [],
    realtime: false,
    tickRate: 20,
    ...input,
    settings: input.settings ?? (z.object({}) as unknown as Settings),
  };
  if (!idPattern.test(manifest.id)) throw new Error(`Invalid game id "${manifest.id}"`);
  if (manifest.minPlayers < 1 || manifest.maxPlayers < manifest.minPlayers) {
    throw new Error(`${manifest.id}: invalid player counts`);
  }
  for (const feature of manifest.features) {
    if (!idPattern.test(feature.id)) throw new Error(`${manifest.id}: invalid feature id`);
  }
  // Settings must be fully defaultable so a lobby can be created without any input.
  manifest.settings.parse({});
  return manifest;
}

export type SettingsOf<M> = M extends GameManifest<infer S> ? z.output<S> : never;
