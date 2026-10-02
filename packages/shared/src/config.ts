import { z } from 'zod';

/**
 * Global monetization settings, stored as rows in the `app_settings` table.
 * Defaults keep monetization fully off.
 */
export const monetizationSettingsSchema = z.object({
  /** Master switch. When false, everything is accessible and the UI shows no pricing. */
  monetizationEnabled: z.boolean().default(false),
  /** Lifetime net spend (in cents) that unlocks everything. Null means no unlock-all. */
  unlockAllThresholdCents: z.number().int().positive().nullable().default(null),
  /** Whether "host pass" also applies in public lobbies, not just private ones. */
  hostPassPublic: z.boolean().default(false),
});

export type MonetizationSettings = z.infer<typeof monetizationSettingsSchema>;

export const lobbyAccessSchema = z.enum(['host', 'everyone']);

/** One row of the `products` table. A SKU with no row is free. */
export const productSchema = z.object({
  sku: z.string(),
  priceCents: z.number().int().nonnegative(),
  isPaid: z.boolean(),
  active: z.boolean(),
  /** Only meaningful for game SKUs: who must own the game for a player to join a lobby. */
  lobbyAccess: lobbyAccessSchema.default('host'),
});

export type Product = z.infer<typeof productSchema>;
