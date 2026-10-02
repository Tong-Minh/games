import 'server-only';
import type { Database } from '@games/db/types';
import { createClient } from '@supabase/supabase-js';
import { env } from '../env';

/** Service-role client for server routes. Bypasses RLS: use only after checking who's asking. */
export function supabaseAdmin() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error('Missing environment variable SUPABASE_SECRET_KEY');
  return createClient<Database>(env.supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
