import { randomUUID } from 'node:crypto';
import { cleanText, type Identity, PlayerError } from '@games/game-sdk/server';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, SignJWT } from 'jose';
import type { SupabaseApi } from './supabase';

const GUEST_ISSUER = 'games:guest';
const GUEST_TTL = '24h';

export const guestNameSchemaLimits = { min: 2, max: 20 };

/**
 * Two kinds of token reach the game server:
 * - Supabase access tokens (ES256), verified against the project's JWKS. No network call per
 *   join once the key set is cached.
 * - Guest tokens (HS256), issued by this server, so guests never touch the database.
 */
export function createAuth(options: {
  supabaseUrl: string;
  guestSecret: string;
  supabase: Pick<SupabaseApi, 'getProfile'>;
}) {
  const issuer = `${options.supabaseUrl}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const guestKey = new TextEncoder().encode(options.guestSecret);

  async function issueGuestToken(rawName: string): Promise<{ token: string; name: string }> {
    const name = cleanText(rawName, guestNameSchemaLimits.max);
    if (name.length < guestNameSchemaLimits.min) throw new PlayerError('Name is too short');
    const token = await new SignJWT({ name })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(GUEST_ISSUER)
      .setSubject(`guest:${randomUUID()}`)
      .setIssuedAt()
      .setExpirationTime(GUEST_TTL)
      .sign(guestKey);
    return { token, name };
  }

  async function authenticate(token: string | undefined): Promise<Identity> {
    if (!token) throw new PlayerError('Not authenticated');

    let alg: string | undefined;
    try {
      alg = decodeProtectedHeader(token).alg;
    } catch {
      throw new PlayerError('Not authenticated');
    }

    if (alg === 'HS256') {
      const { payload } = await jwtVerify(token, guestKey, { issuer: GUEST_ISSUER }).catch(() => {
        throw new PlayerError('Not authenticated');
      });
      if (typeof payload.sub !== 'string' || typeof payload.name !== 'string') {
        throw new PlayerError('Not authenticated');
      }
      return { id: payload.sub, userId: null, name: payload.name, avatarUrl: '' };
    }

    const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' }).catch(
      () => {
        throw new PlayerError('Not authenticated');
      },
    );
    if (typeof payload.sub !== 'string' || payload.is_anonymous === true) {
      throw new PlayerError('Not authenticated');
    }
    // The profile, not the token, is the source of truth for names, and its absence means
    // the account was deleted even if the token hasn't expired yet.
    const profile = await options.supabase.getProfile(payload.sub);
    if (!profile) throw new PlayerError('Account not found');
    return {
      id: payload.sub,
      userId: payload.sub,
      name: profile.displayName,
      avatarUrl: profile.avatarUrl,
    };
  }

  return { authenticate, issueGuestToken };
}
