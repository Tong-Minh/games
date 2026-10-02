import type { MatchRecord } from '@games/game-sdk/server';
import {
  type MonetizationConfig,
  monetizationSettingsSchema,
  type PlayerAccess,
  productSchema,
} from '@games/shared';
import { z } from 'zod';

const CONFIG_TTL_MS = 30_000;
const PROFILE_TTL_MS = 60_000;

export interface Profile {
  displayName: string;
  avatarUrl: string;
}

/**
 * Minimal PostgREST client using the service role (secret key). The game server only needs
 * a handful of calls, so this avoids pulling in supabase-js.
 */
export function createSupabaseApi(url: string, secretKey: string, fetchImpl: typeof fetch = fetch) {
  const headers = { apikey: secretKey, 'content-type': 'application/json' };

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetchImpl(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
    if (!response.ok) {
      throw new Error(
        `Supabase ${init.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`,
      );
    }
    return response.status === 204 ? null : response.json();
  }

  let config: { value: MonetizationConfig; expires: number } | null = null;
  const profiles = new Map<string, { value: Profile | null; expires: number }>();

  return {
    async getMonetizationConfig(): Promise<MonetizationConfig> {
      if (config && config.expires > Date.now()) return config.value;
      const [settingsRows, productRows] = await Promise.all([
        request('app_settings?select=key,value'),
        request('products?select=sku,price_cents,is_paid,active,lobby_access'),
      ]);
      const raw = Object.fromEntries(
        z
          .array(z.object({ key: z.string(), value: z.unknown() }))
          .parse(settingsRows)
          .map((r) => [r.key, r.value]),
      );
      const settings = monetizationSettingsSchema.parse({
        monetizationEnabled: raw.monetization_enabled ?? undefined,
        unlockAllThresholdCents: raw.unlock_all_threshold_cents ?? undefined,
        hostPassPublic: raw.host_pass_public ?? undefined,
      });
      const products = z
        .array(
          z.object({
            sku: z.string(),
            price_cents: z.number(),
            is_paid: z.boolean(),
            active: z.boolean(),
            lobby_access: z.string(),
          }),
        )
        .parse(productRows)
        .map((row) =>
          productSchema.parse({
            sku: row.sku,
            priceCents: row.price_cents,
            isPaid: row.is_paid,
            active: row.active,
            lobbyAccess: row.lobby_access,
          }),
        );
      const value = { settings, products: new Map(products.map((p) => [p.sku, p])) };
      config = { value, expires: Date.now() + CONFIG_TTL_MS };
      return value;
    },

    async getPlayerAccess(userId: string): Promise<PlayerAccess> {
      const result = z
        .object({ ownedSkus: z.array(z.string()), lifetimeSpendCents: z.number() })
        .parse(
          await request('rpc/get_access', {
            method: 'POST',
            body: JSON.stringify({ user_id: userId }),
          }),
        );
      return {
        ownedSkus: new Set(result.ownedSkus),
        lifetimeSpendCents: result.lifetimeSpendCents,
      };
    },

    /** Null when the profile doesn't exist (e.g. the account was deleted). */
    async getProfile(userId: string): Promise<Profile | null> {
      const cached = profiles.get(userId);
      if (cached && cached.expires > Date.now()) return cached.value;
      const rows = z
        .array(z.object({ display_name: z.string(), avatar_url: z.string().nullable() }))
        .parse(
          await request(
            `profiles?id=eq.${encodeURIComponent(userId)}&select=display_name,avatar_url`,
          ),
        );
      const row = rows[0];
      const value = row ? { displayName: row.display_name, avatarUrl: row.avatar_url ?? '' } : null;
      profiles.set(userId, { value, expires: Date.now() + PROFILE_TTL_MS });
      if (profiles.size > 5000) profiles.delete(profiles.keys().next().value!);
      return value;
    },

    async recordMatch(record: MatchRecord): Promise<void> {
      await request('rpc/record_match', {
        method: 'POST',
        body: JSON.stringify({ result: record }),
      });
    },
  };
}

export type SupabaseApi = ReturnType<typeof createSupabaseApi>;
