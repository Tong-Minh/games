// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced literally.
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: required(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  gameServerUrl: required('NEXT_PUBLIC_GAME_SERVER_URL', process.env.NEXT_PUBLIC_GAME_SERVER_URL),
  /** UI flag only; the game server and database enforce access regardless. */
  monetizationEnabled: process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === 'true',
};
