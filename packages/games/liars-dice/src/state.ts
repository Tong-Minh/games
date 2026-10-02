import { schema, t } from '@colyseus/schema';

/**
 * One player's cup. `count` is public; the dice themselves are hidden (`.view()`) and only
 * revealed to their owner, or to everyone at a showdown. A fresh Hand is created each round,
 * so last round's reveal never leaks the new roll.
 */
export const Hand = schema(
  {
    count: t.uint8().default(0),
    dice: t.array('uint8').view(),
  },
  'LiarsDiceHand',
);
export type Hand = InstanceType<typeof Hand>;

export const State = schema(
  {
    hands: t.map(Hand),
    /** Players still in, in turn order. */
    order: t.array('string'),
    /** Players knocked out (or who left), in the order it happened. */
    out: t.array('string'),
    round: t.uint16().default(0),
    /** Whose turn it is; empty during a showdown. */
    turn: t.string().default(''),
    /** Epoch ms when the current turn times out. */
    turnEndsAt: t.number().default(0),
    bidCount: t.uint8().default(0),
    bidFace: t.uint8().default(0),
    bidder: t.string().default(''),
    wildOnes: t.boolean().default(false),
    /** Showdown: all cups lifted, waiting a few seconds before the next round. */
    revealing: t.boolean().default(false),
    lastBidCount: t.uint8().default(0),
    lastBidFace: t.uint8().default(0),
    lastBidder: t.string().default(''),
    lastChallenger: t.string().default(''),
    /** How many dice actually matched the challenged bid. */
    lastActual: t.uint8().default(0),
    lastLoser: t.string().default(''),
  },
  'LiarsDiceState',
);
export type State = InstanceType<typeof State>;

export const REVEAL_MS = 5000;

/** A bid beats another with more dice, or the same number of a higher face. */
export function isHigherBid(count: number, face: number, prevCount: number, prevFace: number) {
  return count > prevCount || (count === prevCount && face > prevFace);
}

/** Dice that count toward `face`. With wild ones, 1s count toward every other face. */
export function countMatching(dice: Iterable<number>, face: number, wildOnes: boolean) {
  let total = 0;
  for (const die of dice) if (die === face || (wildOnes && face !== 1 && die === 1)) total++;
  return total;
}
