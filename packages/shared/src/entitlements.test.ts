import { describe, expect, it } from 'vitest';
import { type MonetizationSettings, monetizationSettingsSchema, type Product } from './config';
import {
  canAccess,
  canCreateLobby,
  canJoinLobby,
  hasFeature,
  type LobbyContext,
  type MonetizationConfig,
  type PlayerAccess,
} from './entitlements';

const product = (sku: string, overrides: Partial<Product> = {}): [string, Product] => [
  sku,
  { sku, priceCents: 499, isPaid: true, active: true, lobbyAccess: 'host', ...overrides },
];

const config = (
  settings: Partial<MonetizationSettings> = {},
  products: [string, Product][] = [],
): MonetizationConfig => ({
  settings: { ...monetizationSettingsSchema.parse({}), monetizationEnabled: true, ...settings },
  products: new Map(products),
});

const player = (owned: string[] = [], lifetimeSpendCents = 0): PlayerAccess => ({
  ownedSkus: new Set(owned),
  lifetimeSpendCents,
});

const paidGame = product('game:dice');

describe('canAccess', () => {
  it('allows everything when monetization is off, even for guests', () => {
    const cfg = config({ monetizationEnabled: false }, [paidGame]);
    expect(canAccess('game:dice', null, cfg)).toBe(true);
  });

  it('defaults to monetization off', () => {
    expect(monetizationSettingsSchema.parse({}).monetizationEnabled).toBe(false);
  });

  it('treats SKUs without a product row as free', () => {
    expect(canAccess('game:other', null, config())).toBe(true);
  });

  it('treats products marked not paid as free', () => {
    const cfg = config({}, [product('game:dice', { isPaid: false })]);
    expect(canAccess('game:dice', null, cfg)).toBe(true);
  });

  it('blocks guests and non-owners from paid SKUs', () => {
    const cfg = config({}, [paidGame]);
    expect(canAccess('game:dice', null, cfg)).toBe(false);
    expect(canAccess('game:dice', player(), cfg)).toBe(false);
  });

  it('allows owners', () => {
    expect(canAccess('game:dice', player(['game:dice']), config({}, [paidGame]))).toBe(true);
  });

  it('unlocks everything at or above the spend threshold', () => {
    const cfg = config({ unlockAllThresholdCents: 2000 }, [paidGame]);
    expect(canAccess('game:dice', player([], 1999), cfg)).toBe(false);
    expect(canAccess('game:dice', player([], 2000), cfg)).toBe(true);
  });

  it('never unlocks all when there is no threshold', () => {
    const cfg = config({ unlockAllThresholdCents: null }, [paidGame]);
    expect(canAccess('game:dice', player([], 1_000_000), cfg)).toBe(false);
  });
});

describe('lobbies', () => {
  const owner = player(['game:dice']);
  const lobby = (overrides: Partial<LobbyContext> = {}): LobbyContext => ({
    gameId: 'dice',
    isPrivate: true,
    host: owner,
    ...overrides,
  });

  it('requires the host to own the game to create a lobby', () => {
    const cfg = config({}, [paidGame]);
    expect(canCreateLobby(lobby(), cfg)).toBe(true);
    expect(canCreateLobby(lobby({ host: player() }), cfg)).toBe(false);
  });

  it('lets anyone, including guests, join a private host-pass lobby', () => {
    expect(canJoinLobby(lobby(), null, config({}, [paidGame]))).toBe(true);
  });

  it('does not apply host pass in public lobbies by default', () => {
    expect(canJoinLobby(lobby({ isPrivate: false }), null, config({}, [paidGame]))).toBe(false);
  });

  it('applies host pass in public lobbies when configured', () => {
    const cfg = config({ hostPassPublic: true }, [paidGame]);
    expect(canJoinLobby(lobby({ isPrivate: false }), null, cfg)).toBe(true);
  });

  it('requires every player to own "everyone" games', () => {
    const cfg = config({}, [product('game:dice', { lobbyAccess: 'everyone' })]);
    expect(canJoinLobby(lobby(), null, cfg)).toBe(false);
    expect(canJoinLobby(lobby(), owner, cfg)).toBe(true);
  });

  it('gives host-pass nothing when the host does not own the game', () => {
    expect(canJoinLobby(lobby({ host: player() }), null, config({}, [paidGame]))).toBe(false);
  });

  describe('features', () => {
    const cfg = config({}, [product('feature:dice:wild'), product('feature:dice:gold')]);
    const wild = { id: 'wild', scope: 'lobby' } as const;
    const gold = { id: 'gold', scope: 'player' } as const;

    it('applies lobby features from the host to everyone', () => {
      expect(hasFeature(lobby({ host: player(['feature:dice:wild']) }), wild, null, cfg)).toBe(
        true,
      );
      expect(hasFeature(lobby({ host: player() }), wild, player(['feature:dice:wild']), cfg)).toBe(
        false,
      );
    });

    it('requires player features to be owned by the player', () => {
      const host = player(['feature:dice:gold']);
      expect(hasFeature(lobby({ host }), gold, null, cfg)).toBe(false);
      expect(hasFeature(lobby({ host }), gold, player(['feature:dice:gold']), cfg)).toBe(true);
    });
  });
});
