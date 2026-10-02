/** A purchasable or gateable thing: a whole game, or one feature of a game. */
export type Sku = `game:${string}` | `feature:${string}:${string}`;

export const gameSku = (gameId: string): Sku => `game:${gameId}`;

export const featureSku = (gameId: string, featureId: string): Sku =>
  `feature:${gameId}:${featureId}`;
