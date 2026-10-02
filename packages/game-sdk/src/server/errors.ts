/** An error whose message is safe and useful to show the player ("Invalid lobby code"). */
export class PlayerError extends Error {
  override name = 'PlayerError';
}

export const GENERIC_ERROR = 'Something went wrong on our side. Please try again.';

/**
 * Lets PlayerErrors through; anything else (database, network, bugs) is logged and replaced
 * with a generic message so internals never reach the client.
 */
export async function shielded<T>(
  log: (message: string, data: Record<string, unknown>) => void,
  context: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PlayerError) throw error;
    log(`${context} failed`, { error: error instanceof Error ? error.message : String(error) });
    throw new PlayerError(GENERIC_ERROR);
  }
}
