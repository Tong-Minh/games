import { createTestContext } from '@games/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import game from '../src/server';
import { countMatching, isHigherBid, REVEAL_MS } from '../src/state';

type Ctx = ReturnType<typeof start>;

function start(options: { players?: number; features?: string[]; startingDice?: number } = {}) {
  return createTestContext(game, {
    players: options.players ?? 3,
    features: options.features ?? [],
    settings: { startingDice: options.startingDice ?? 5, turnSeconds: 30 },
  });
}

/** Overwrite everyone's dice for a deterministic round. */
function setDice(ctx: Ctx, dice: Record<string, number[]>) {
  for (const [id, values] of Object.entries(dice)) {
    const hand = ctx.state.hands.get(id)!;
    hand.dice.splice(0, hand.dice.length, ...values);
    hand.count = values.length;
  }
}

describe('rules helpers', () => {
  it('orders bids by count, then face', () => {
    expect(isHigherBid(3, 2, 2, 6)).toBe(true);
    expect(isHigherBid(2, 5, 2, 4)).toBe(true);
    expect(isHigherBid(2, 4, 2, 4)).toBe(false);
    expect(isHigherBid(1, 6, 2, 1)).toBe(false);
  });

  it('counts wild ones toward other faces only', () => {
    expect(countMatching([1, 1, 4, 4, 2], 4, false)).toBe(2);
    expect(countMatching([1, 1, 4, 4, 2], 4, true)).toBe(4);
    expect(countMatching([1, 1, 4, 4, 2], 1, true)).toBe(2);
  });
});

describe("Liar's Dice", () => {
  it('deals hidden dice: each player sees only their own cup', () => {
    const ctx = start();
    for (const id of ['p1', 'p2', 'p3']) {
      const hand = ctx.state.hands.get(id)!;
      expect(hand.count).toBe(5);
      expect(hand.dice).toHaveLength(5);
      expect([...hand.dice].every((d) => d >= 1 && d <= 6)).toBe(true);
      expect([...(ctx.revealed.get(id) ?? [])]).toEqual([hand]);
    }
    expect(ctx.state.turn).toBe('p1');
  });

  it('only accepts higher bids from the player whose turn it is', () => {
    const ctx = start();
    ctx.dispatch('p2', 'bid', { count: 2, face: 3 });
    expect(ctx.state.bidCount).toBe(0);

    ctx.dispatch('p1', 'bid', { count: 2, face: 3 });
    expect([ctx.state.bidCount, ctx.state.bidFace, ctx.state.turn]).toEqual([2, 3, 'p2']);

    ctx.dispatch('p2', 'bid', { count: 2, face: 3 }); // not higher
    ctx.dispatch('p2', 'bid', { count: 16, face: 3 }); // more dice than exist
    expect(ctx.state.turn).toBe('p2');
    expect(ctx.dispatch('p2', 'bid', { count: 2, face: 7 })).toBe(false); // schema
    ctx.dispatch('p2', 'bid', { count: 2, face: 4 });
    expect(ctx.state.turn).toBe('p3');
  });

  it('cannot challenge before anyone has bid', () => {
    const ctx = start();
    ctx.dispatch('p1', 'challenge');
    expect(ctx.state.revealing).toBe(false);
  });

  it('a wrong challenge costs the challenger a die', () => {
    const ctx = start();
    setDice(ctx, { p1: [3, 3, 2, 2, 2], p2: [3, 5, 5, 5, 5], p3: [1, 6, 6, 6, 6] });
    ctx.dispatch('p1', 'bid', { count: 3, face: 3 });
    ctx.dispatch('p2', 'challenge');

    expect(ctx.state.revealing).toBe(true);
    expect(ctx.state.lastActual).toBe(3);
    expect(ctx.state.lastLoser).toBe('p2');
    expect(ctx.state.hands.get('p2')!.count).toBe(4);
    // Everyone sees every cup during the showdown.
    for (const viewer of ['p1', 'p2', 'p3']) expect(ctx.revealed.get(viewer)?.size).toBe(3);

    ctx.advance(REVEAL_MS);
    expect(ctx.state.revealing).toBe(false);
    expect(ctx.state.round).toBe(2);
    expect(ctx.state.turn).toBe('p2'); // loser starts
    expect(ctx.state.hands.get('p2')!.dice).toHaveLength(4);
  });

  it('a correct challenge costs the bidder a die', () => {
    const ctx = start();
    setDice(ctx, { p1: [3, 2, 2, 2, 2], p2: [5, 5, 5, 5, 5], p3: [6, 6, 6, 6, 6] });
    ctx.dispatch('p1', 'bid', { count: 4, face: 3 });
    ctx.dispatch('p2', 'challenge');
    expect(ctx.state.lastActual).toBe(1);
    expect(ctx.state.lastLoser).toBe('p1');
    expect(ctx.state.hands.get('p1')!.count).toBe(4);
  });

  it('counts wild ones when the host enables them', () => {
    const ctx = start({ features: ['wild-ones'] });
    expect(ctx.state.wildOnes).toBe(true);
    setDice(ctx, { p1: [1, 1, 2, 2, 2], p2: [3, 5, 5, 5, 5], p3: [6, 6, 6, 6, 6] });
    ctx.dispatch('p1', 'bid', { count: 3, face: 3 });
    ctx.dispatch('p2', 'challenge');
    expect(ctx.state.lastActual).toBe(3);
    expect(ctx.state.lastLoser).toBe('p2');
    expect(ctx.isOver()).toBeNull();
  });

  it('knocks players out and ends with the last one standing', () => {
    const ctx = start({ players: 2, startingDice: 3 });
    for (let round = 0; round < 3; round++) {
      setDice(ctx, {
        p1: Array(ctx.state.hands.get('p1')!.count).fill(6),
        p2: Array(ctx.state.hands.get('p2')!.count).fill(2),
      });
      // Whoever's turn it is opens with a false bid (nobody holds a 4), and the other calls it.
      const bidder = ctx.state.turn;
      const caller = bidder === 'p1' ? 'p2' : 'p1';
      ctx.dispatch(bidder, 'bid', { count: 1, face: 4 });
      ctx.dispatch(caller, 'challenge');
      expect(ctx.isOver()).toBeNull(); // showdown still showing
      ctx.advance(REVEAL_MS);
    }
    const results = ctx.isOver();
    expect(results).not.toBeNull();
    expect(results!.players[0]!.rank).toBe(1);
    expect(results!.players.map((p) => p.playerId).sort()).toEqual(['p1', 'p2']);
    expect(ctx.state.order).toHaveLength(1);
    expect(ctx.state.out).toHaveLength(1);
  });

  it('times out: opens with the smallest bid, or calls the standing bid', () => {
    const ctx = start();
    ctx.advance(30_000);
    expect([ctx.state.bidCount, ctx.state.bidFace, ctx.state.bidder]).toEqual([1, 1, 'p1']);
    expect(ctx.state.turn).toBe('p2');
    ctx.advance(30_000);
    expect(ctx.state.revealing).toBe(true);
    expect(ctx.state.lastChallenger).toBe('p2');
  });

  it('a timely move cancels the turn timer', () => {
    const ctx = start();
    ctx.advance(20_000);
    ctx.dispatch('p1', 'bid', { count: 1, face: 5 });
    ctx.advance(15_000); // past p1's old deadline, not p2's
    expect(ctx.state.turn).toBe('p2');
    expect(ctx.state.bidFace).toBe(5);
  });

  it('skips players who leave, and ends if only one remains', () => {
    const ctx = start();
    ctx.leave('p1'); // it was p1's turn
    expect(ctx.state.turn).toBe('p2');
    expect([...ctx.state.order]).toEqual(['p2', 'p3']);
    ctx.leave('p3');
    const results = ctx.isOver();
    expect(results?.players.map((p) => [p.playerId, p.rank])).toEqual([
      ['p2', 1],
      ['p3', 2],
      ['p1', 3],
    ]);
  });
});
