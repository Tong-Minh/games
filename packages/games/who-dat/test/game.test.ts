import { createTestContext } from '@games/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { ANIMALS } from '../src/animals';
import game from '../src/server';
import { REVEAL_MS } from '../src/state';

function start(settings: { wrongGuessLoses?: boolean; boardSize?: number } = {}) {
  const ctx = createTestContext(game, {
    players: 2,
    settings: { turnSeconds: 60, ...settings },
  });
  const asker = ctx.state.turn;
  const other = asker === 'p1' ? 'p2' : 'p1';
  return { ctx, asker, other };
}

const secretOf = (ctx: ReturnType<typeof start>['ctx'], id: string) =>
  ctx.state.sides.get(id)!.secret;

describe('Who Dat?', () => {
  it('deals a board and a hidden secret animal to each player', () => {
    const { ctx } = start({ boardSize: 20 });
    expect(ctx.state.board).toHaveLength(20);
    expect(new Set(ctx.state.board).size).toBe(20);
    for (const id of ['p1', 'p2']) {
      const side = ctx.state.sides.get(id)!;
      expect(ctx.state.board).toContain(side.secret);
      expect([...(ctx.revealed.get(id) ?? [])]).toEqual([side]); // only their own side
    }
  });

  it('never deals more animals than exist', () => {
    const { ctx } = start({ boardSize: 30 });
    expect(ctx.state.board.length).toBe(Math.min(30, ANIMALS.length));
  });

  it('alternates: ask, the other answers, then the answerer asks', () => {
    const { ctx, asker, other } = start();
    ctx.dispatch(other, 'ask', { text: 'Out of turn?' });
    expect(ctx.state.log).toHaveLength(0);

    ctx.dispatch(asker, 'ask', { text: '  Does it   have fur?‮ ' });
    expect(ctx.state.stage).toBe('answer');
    expect(ctx.state.log.at(-1)?.text).toBe('Does it have fur?');

    ctx.dispatch(asker, 'answer', { answer: 'yes' }); // can't answer your own question
    expect(ctx.state.stage).toBe('answer');
    expect(ctx.dispatch(other, 'answer', { answer: 'maybe' })).toBe(false);

    ctx.dispatch(other, 'answer', { answer: 'no' });
    expect(ctx.state.log.at(-1)?.answer).toBe('no');
    expect([ctx.state.stage, ctx.state.turn]).toEqual(['ask', other]);
  });

  it('ignores blank questions and caps their length', () => {
    const { ctx, asker } = start();
    ctx.dispatch(asker, 'ask', { text: '   ' });
    expect(ctx.state.log).toHaveLength(0);
    ctx.dispatch(asker, 'ask', { text: 'x'.repeat(400) });
    expect(ctx.state.log.at(-1)?.text).toHaveLength(140);
  });

  it('lets each player flip cards on their own board only', () => {
    const { ctx, other } = start();
    const [a, b] = ctx.state.board;
    ctx.dispatch(other, 'flip', { animal: a });
    ctx.dispatch(other, 'flip', { animal: b });
    ctx.dispatch(other, 'flip', { animal: a }); // toggles back up
    ctx.dispatch(other, 'flip', { animal: 'not-on-board' });
    expect([...ctx.state.sides.get(other)!.flipped]).toEqual([b]);
  });

  it('a correct guess wins, after a reveal of both animals', () => {
    const { ctx, asker, other } = start();
    ctx.dispatch(asker, 'guess', { animal: secretOf(ctx, other) });
    expect(ctx.state.stage).toBe('reveal');
    expect(ctx.state.winner).toBe(asker);
    for (const viewer of ['p1', 'p2']) expect(ctx.revealed.get(viewer)?.size).toBe(2);
    expect(ctx.isOver()).toBeNull();
    ctx.advance(REVEAL_MS);
    expect(ctx.isOver()?.players).toEqual([
      expect.objectContaining({ playerId: asker, rank: 1 }),
      expect.objectContaining({ playerId: other, rank: 2 }),
    ]);
  });

  it('a wrong guess loses by default', () => {
    const { ctx, asker, other } = start();
    const wrong = ctx.state.board.find((id) => id !== secretOf(ctx, other))!;
    ctx.dispatch(asker, 'guess', { animal: wrong });
    expect([ctx.state.winner, ctx.state.endReason]).toEqual([other, 'wrong-guess']);
  });

  it('with the option off, a wrong guess just passes the turn', () => {
    const { ctx, asker, other } = start({ wrongGuessLoses: false });
    const wrong = ctx.state.board.find((id) => id !== secretOf(ctx, other))!;
    ctx.dispatch(asker, 'guess', { animal: wrong });
    expect(ctx.state.stage).toBe('ask');
    expect(ctx.state.turn).toBe(other);
    expect(ctx.state.log.at(-1)).toMatchObject({ kind: 'guess', answer: 'no' });
    expect([...ctx.state.sides.get(asker)!.flipped]).toContain(wrong);
  });

  it('times out: an idle asker loses the turn, an idle answerer answers "unsure"', () => {
    const { ctx, asker, other } = start();
    ctx.advance(60_000);
    expect(ctx.state.turn).toBe(other);
    ctx.dispatch(other, 'ask', { text: 'Can it fly?' });
    ctx.advance(60_000);
    expect(ctx.state.log.at(-1)).toMatchObject({ answer: 'unsure', timedOut: true });
    expect([ctx.state.stage, ctx.state.turn]).toEqual(['ask', asker]);
  });

  it('ends when the opponent leaves', () => {
    const { ctx, asker, other } = start();
    ctx.leave(other);
    expect(ctx.isOver()?.players).toEqual([
      { playerId: asker, rank: 1 },
      { playerId: other, rank: 2 },
    ]);
  });
});
