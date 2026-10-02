import { createAuth } from './auth';
import { loadEnv } from './env';
import { games } from './games.gen';
import { createGameServer } from './server';
import { createSupabaseApi } from './supabase';

const env = loadEnv();
const supabase = createSupabaseApi(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const auth = createAuth({
  supabaseUrl: env.SUPABASE_URL,
  guestSecret: env.GUEST_TOKEN_SECRET,
  supabase,
});

const log = (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) =>
  console[level](JSON.stringify({ level, message, ...data, time: new Date().toISOString() }));

const server = createGameServer({
  games,
  webOrigins: env.WEB_ORIGINS,
  ...(env.PUBLIC_ADDRESS ? { publicAddress: env.PUBLIC_ADDRESS } : {}),
  issueGuestToken: auth.issueGuestToken,
  services: {
    authenticate: auth.authenticate,
    getMonetizationConfig: supabase.getMonetizationConfig,
    getPlayerAccess: supabase.getPlayerAccess,
    recordMatch: supabase.recordMatch,
    log,
  },
});

await server.listen(env.PORT);
log('info', 'Game server listening', { port: env.PORT, games: games.map((g) => g.manifest.id) });
