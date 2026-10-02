import {
  cleanText,
  defineGame,
  type GameContext,
  type SettingsOf,
  type Timer,
} from '@games/game-sdk';
import { z } from 'zod';
import { ANIMALS, animal } from './animals';
import manifest from './manifest';
import { ANSWERS, Entry, QUESTION_MAX_LENGTH, REVEAL_MS, Side, type Stage, State } from './state';

type Ctx = GameContext<State, SettingsOf<typeof manifest>>;

const turnTimers = new WeakMap<Ctx, Timer>();

const opponentOf = (ctx: Ctx, playerId: string) =>
  ctx.players.find((p) => p.id !== playerId)?.id ?? '';

function setStage(ctx: Ctx, stage: Stage, turn: string) {
  turnTimers.get(ctx)?.clear();
  ctx.state.stage = stage;
  ctx.state.turn = turn;
  if (stage !== 'ask' && stage !== 'answer') return;
  const ms = ctx.settings.turnSeconds * 1000;
  ctx.state.turnEndsAt = ctx.now() + ms;
  turnTimers.set(
    ctx,
    ctx.setTimeout(() => {
      if (ctx.state.stage === 'ask' && ctx.state.turn === turn) {
        // Asker ran out of time: the turn passes.
        setStage(ctx, 'ask', opponentOf(ctx, turn));
      } else if (ctx.state.stage === 'answer' && ctx.state.turn === turn) {
        answer(ctx, opponentOf(ctx, turn), 'unsure', true);
      }
    }, ms),
  );
}

function answer(ctx: Ctx, answerer: string, value: (typeof ANSWERS)[number], timedOut = false) {
  const entry = ctx.state.log.at(-1);
  if (entry) {
    entry.answer = value;
    entry.timedOut = timedOut;
  }
  // The answerer asks next.
  setStage(ctx, 'ask', answerer);
}

function finish(ctx: Ctx, winner: string, reason: 'guess' | 'wrong-guess') {
  const { state } = ctx;
  state.winner = winner;
  state.endReason = reason;
  for (const side of state.sides.values()) ctx.revealToAll(side);
  setStage(ctx, 'reveal', '');
  ctx.setTimeout(() => {
    state.stage = 'done';
  }, REVEAL_MS);
}

function shuffle<T>(ctx: Ctx, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = ctx.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export default defineGame(manifest, {
  State,

  setup(ctx) {
    const size = Math.min(ctx.settings.boardSize, ANIMALS.length);
    const board = shuffle(ctx, ANIMALS).slice(0, size);
    ctx.state.board.push(...board.map((a) => a.id));
    for (const player of ctx.players) {
      const side = new Side();
      // Each player's animal is drawn independently, so both can get the same one.
      side.secret = board[ctx.randomInt(board.length)]!.id;
      ctx.state.sides.set(player.id, side);
      ctx.reveal(player.id, side);
    }
    setStage(ctx, 'ask', ctx.players[ctx.randomInt(ctx.players.length)]!.id);
  },

  messages: {
    ask: {
      schema: z.object({ text: z.string().max(500) }),
      handle(ctx, playerId, { text }) {
        if (ctx.state.stage !== 'ask' || ctx.state.turn !== playerId) return;
        const question = cleanText(text, QUESTION_MAX_LENGTH);
        if (!question) return;
        const entry = new Entry();
        entry.asker = playerId;
        entry.text = question;
        ctx.state.log.push(entry);
        setStage(ctx, 'answer', playerId);
      },
    },

    answer: {
      schema: z.object({ answer: z.enum(ANSWERS) }),
      handle(ctx, playerId, message) {
        // Only the player being asked answers.
        if (ctx.state.stage !== 'answer' || ctx.state.turn === playerId) return;
        answer(ctx, playerId, message.answer);
      },
    },

    guess: {
      schema: z.object({ animal: z.string().max(32) }),
      handle(ctx, playerId, message) {
        const { state } = ctx;
        if (state.stage !== 'ask' || state.turn !== playerId) return;
        if (!state.board.includes(message.animal)) return;
        const opponent = opponentOf(ctx, playerId);
        const correct = state.sides.get(opponent)?.secret === message.animal;
        state.guessBy = playerId;
        state.guess = message.animal;
        if (correct) return finish(ctx, playerId, 'guess');
        if (ctx.settings.wrongGuessLoses) return finish(ctx, opponent, 'wrong-guess');

        // Wrong guess, game goes on: log it, flip it down for them, and pass the turn.
        const entry = new Entry();
        entry.asker = playerId;
        entry.kind = 'guess';
        entry.text = `Is it the ${animal(message.animal)?.name ?? message.animal}?`;
        entry.answer = 'no';
        state.log.push(entry);
        const side = state.sides.get(playerId);
        if (side && !side.flipped.includes(message.animal)) side.flipped.push(message.animal);
        setStage(ctx, 'ask', opponent);
      },
    },

    flip: {
      schema: z.object({ animal: z.string().max(32) }),
      handle(ctx, playerId, message) {
        const { state } = ctx;
        if (state.stage === 'reveal' || state.stage === 'done') return;
        if (!state.board.includes(message.animal)) return;
        const flipped = state.sides.get(playerId)?.flipped;
        if (!flipped) return;
        const index = flipped.indexOf(message.animal);
        if (index === -1) flipped.push(message.animal);
        else flipped.splice(index, 1);
      },
    },
  },

  onPlayerLeave(ctx) {
    turnTimers.get(ctx)?.clear();
  },

  isOver(ctx) {
    const { state } = ctx;
    // The other player left: whoever is still here wins.
    if (ctx.players.length < 2 && state.stage !== 'done') {
      const stayer = ctx.players[0]?.id;
      const leaver = [...state.sides.keys()].find((id) => id !== stayer);
      state.endReason = 'left';
      return {
        players: [
          ...(stayer ? [{ playerId: stayer, rank: 1 }] : []),
          ...(leaver ? [{ playerId: leaver, rank: 2 }] : []),
        ],
      };
    }
    if (state.stage !== 'done') return null;
    const loser = [...state.sides.keys()].find((id) => id !== state.winner) ?? '';
    const questionsBy = (id: string) => state.log.filter((e) => e.asker === id).length;
    return {
      players: [
        { playerId: state.winner, rank: 1, stats: { questions: questionsBy(state.winner) } },
        { playerId: loser, rank: 2, stats: { questions: questionsBy(loser) } },
      ],
    };
  },
});
