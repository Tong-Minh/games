import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(2567),
  /** e.g. http://127.0.0.1:54321 locally, https://<ref>.supabase.co in production. */
  SUPABASE_URL: z.url(),
  /** Supabase secret key (sb_secret_...). Server-side only. */
  SUPABASE_SECRET_KEY: z.string().min(20),
  /** Signs guest tokens. Any long random string; rotating it signs out all guests. */
  GUEST_TOKEN_SECRET: z.string().min(32),
  /** Comma-separated origins allowed to call the HTTP API. */
  WEB_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://127.0.0.1:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  /** Address clients use to reach this process directly when running several processes. */
  PUBLIC_ADDRESS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${problems.join('\n')}`);
  }
  return result.data;
}
