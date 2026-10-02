import { defineGame, type GameContext, type SettingsOf, type Timer } from '@games/game-sdk';
import { z } from 'zod';
import manifest from './manifest';
import { countMatching, Hand, isHigherBid, REVEAL_MS, State } from './state';

type Ctx = GameContext<State, SettingsOf<typeof manifest>>;

/** The pending turn timeout for each match. */
const turnTimers = new WeakMap<Ctx, Timer>();

const totalDice = (ctx: Ctx) => {
  let total = 0;
  for (const id of ctx.state.order) total += ctx.state.hands.get(id)?.count ?? 0;
  return total;
};

/** The next player still in, after `id` (which may already be out). */
function nextAfter(ctx: Ctx, id: string, seats: readonly string[]): string {
  const { order } = ctx.state;
  const start = seats.indexOf(id);
  for (let i = 1; i <= seats.length; i++) {
    const candidate = seats[(start + i) % seats.length]!;
    if (order.includes(candidate)) return candidate;
  }
  return order[0] ?? '';
}

const seatsOf = (ctx: Ctx) => ctx.players.map((p) => p.id);

function setTurn(ctx: Ctx, playerId: string) {
  turnTimers.get(ctx)?.clear();
  ctx.state.turn = playerId;
  const ms = ctx.settings.turnSeconds * 1000;
  ctx.state.turnEndsAt = ctx.now() + ms;
  turnTimers.set(
    ctx,
    ctx.setTimeout(() => {
      if (ctx.state.turn !== playerId) return;
      // Keep the game moving: call the current bid, or open with the smallest bid.
      if (ctx.state.bidCount > 0) challenge(ctx, playerId);
      else placeBid(ctx, playerId, 1, 1);
    }, ms),
  );
}

function startRound(ctx: Ctx, starter: string) {
  const { state } = ctx;
  state.round += 1;
  state.revealing = false;
  state.bidCount = 0;
  state.bidFace = 0;
  state.bidder = '';
  for (const id of state.order) {
    const previous = state.hands.get(id);
    const hand = new Hand();
    hand.count = previous?.count ?? ctx.settings.startingDice;
    for (let i = 0; i < hand.count; i++) hand.dice.push(1 + ctx.randomInt(6));
    state.hands.set(id, hand);
    ctx.reveal(id, hand);
  }
  setTurn(ctx, starter);
}

function placeBid(ctx: Ctx, playerId: string, count: number, face: number) {
  const { state } = ctx;
  state.bidCount = count;
  state.bidFace = face;
  state.bidder = playerId;
  setTurn(ctx, nextAfter(ctx, playerId, seatsOf(ctx)));
}

function knockOut(ctx: Ctx, playerId: string) {
  const index = ctx.state.order.indexOf(playerId);
  if (index !== -1) ctx.state.order.splice(index, 1);
  if (!ctx.state.out.includes(playerId)) ctx.state.out.push(playerId);
}

function challenge(ctx: Ctx, challenger: string) {
  const { state } = ctx;
  turnTimers.get(ctx)?.clear();
  const seats = seatsOf(ctx);

  let actual = 0;
  for (const id of state.order) {
    const hand = state.hands.get(id);
    if (!hand) continue;
    actual += countMatching(hand.dice, state.bidFace, state.wildOnes);
    ctx.revealToAll(hand);
  }
  const bidStands = actual >= state.bidCount;
  const loser = bidStands ? challenger : state.bidder;

  state.lastBidCount = state.bidCount;
  state.lastBidFace = state.bidFace;
  state.lastBidder = state.bidder;
  state.lastChallenger = challenger;
  state.lastActual = actual;
  state.lastLoser = loser;
  state.turn = '';
  state.revealing = true;

  const loserHand = state.hands.get(loser);
  if (loserHand && state.order.includes(loser)) {
    loserHand.count -= 1;
    if (loserHand.count === 0) knockOut(ctx, loser);
  }

  ctx.setTimeout(() => {
    if (state.order.length < 2) {
      state.revealing = false;
      return;
    }
    // The loser starts the next round, or the next player if they're out.
    startRound(ctx, state.order.includes(loser) ? loser : nextAfter(ctx, loser, seats));
  }, REVEAL_MS);
}

export default defineGame(manifest, {
  State,

  setup(ctx) {
    ctx.state.wildOnes = ctx.hasFeature('wild-ones');
    for (const player of ctx.players) {
      ctx.state.order.push(player.id);
      const hand = new Hand();
      hand.count = ctx.settings.startingDice;
      ctx.state.hands.set(player.id, hand);
    }
    startRound(ctx, ctx.players[0]!.id);
  },

  messages: {
    bid: {
      schema: z.object({
        count: z.number().int().min(1).max(36),
        face: z.number().int().min(1).max(6),
      }),
      handle(ctx, playerId, { count, face }) {
        const { state } = ctx;
        if (state.revealing || state.turn !== playerId) return;
        if (count > totalDice(ctx)) return;
        if (!isHigherBid(count, face, state.bidCount, state.bidFace)) return;
        placeBid(ctx, playerId, count, face);
      },
    },
    challenge: {
      schema: z.object({}).optional(),
      handle(ctx, playerId) {
        const { state } = ctx;
        if (state.revealing || state.turn !== playerId || state.bidCount === 0) return;
        challenge(ctx, playerId);
      },
    },
  },

  onPlayerLeave(ctx, playerId) {
    const { state } = ctx;
    const seats = [...state.order];
    const wasTurn = state.turn === playerId;
    knockOut(ctx, playerId);
    const hand = state.hands.get(playerId);
    if (hand) hand.count = 0;
    if (wasTurn && state.order.length > 1) setTurn(ctx, nextAfter(ctx, playerId, seats));
  },

  isOver(ctx) {
    const { state } = ctx;
    // Let the final showdown play out before ending.
    if (state.order.length > 1 || state.revealing) return null;
    const ranking = [...state.order, ...[...state.out].reverse()];
    // Anyone missing (shouldn't happen) goes last.
    for (const p of ctx.players) if (!ranking.includes(p.id)) ranking.push(p.id);
    return {
      players: ranking.map((playerId, i) => ({
        playerId,
        rank: i + 1,
        stats: { diceLeft: state.hands.get(playerId)?.count ?? 0, rounds: state.round },
      })),
      ...(state.wildOnes ? { mode: 'wild ones' } : {}),
    };
  },
});
