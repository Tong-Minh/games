import type { Database } from '@games/db/types';
import { createBrowserClient } from '@supabase/ssr';
import { env } from '../env';

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * One browser client for the whole app. It keeps the session in cookies, refreshes tokens,
 * and completes OAuth/email-link sign-ins (`?code=`) on whatever page it's created on.
 */
export function supabaseBrowser() {
  client ??= createBrowserClient<Database>(env.supabaseUrl, env.supabasePublishableKey);
  return client;
}
