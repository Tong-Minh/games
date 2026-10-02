import type { MonetizationSettings, Product } from './config';
import { featureSku, gameSku, type Sku } from './sku';

/** Everything needed to make an access decision, loaded once per request or room. */
export interface MonetizationConfig {
  settings: MonetizationSettings;
  products: ReadonlyMap<string, Product>;
}

/**
 * What a signed-in player owns. `ownedSkus` combines non-refunded purchases and manual grants.
 * Guests are represented as `null`.
 */
export interface PlayerAccess {
  ownedSkus: ReadonlySet<string>;
  lifetimeSpendCents: number;
}

export type FeatureScope = 'lobby' | 'player';

const isPaid = (sku: Sku, config: MonetizationConfig): boolean =>
  config.products.get(sku)?.isPaid ?? false;

/** Free, purchased/granted, or unlocked by lifetime spend. */
export function canAccess(
  sku: Sku,
  player: PlayerAccess | null,
  config: MonetizationConfig,
): boolean {
  const { settings } = config;
  if (!settings.monetizationEnabled || !isPaid(sku, config)) return true;
  if (!player) return false;
  if (player.ownedSkus.has(sku)) return true;
  const threshold = settings.unlockAllThresholdCents;
  return threshold !== null && player.lifetimeSpendCents >= threshold;
}

export interface LobbyContext {
  gameId: string;
  isPrivate: boolean;
  host: PlayerAccess | null;
}

/** Whether host ownership of the game covers everyone else in this lobby. */
export function hostPassApplies(lobby: LobbyContext, config: MonetizationConfig): boolean {
  const product = config.products.get(gameSku(lobby.gameId));
  if (product?.lobbyAccess !== 'host') return false;
  return lobby.isPrivate || config.settings.hostPassPublic;
}

/** The host needs the game themselves to open a lobby for it. */
export function canCreateLobby(lobby: LobbyContext, config: MonetizationConfig): boolean {
  return canAccess(gameSku(lobby.gameId), lobby.host, config);
}

export function canJoinLobby(
  lobby: LobbyContext,
  player: PlayerAccess | null,
  config: MonetizationConfig,
): boolean {
  const sku = gameSku(lobby.gameId);
  if (canAccess(sku, player, config)) return true;
  return hostPassApplies(lobby, config) && canAccess(sku, lobby.host, config);
}

/** Lobby-scoped features follow the host's ownership; player-scoped ones the player's own. */
export function hasFeature(
  lobby: LobbyContext,
  feature: { id: string; scope: FeatureScope },
  player: PlayerAccess | null,
  config: MonetizationConfig,
): boolean {
  const sku = featureSku(lobby.gameId, feature.id);
  return canAccess(sku, feature.scope === 'lobby' ? lobby.host : player, config);
}
