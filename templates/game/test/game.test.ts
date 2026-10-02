import { createTestContext } from '@games/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import game from '../src/server';

describe('__GAME_NAME__', () => {
  it('ends when a player reaches the target', () => {
    const ctx = createTestContext(game, { players: 2, settings: { target: 2 } });
    ctx.dispatch('p1', 'score');
    expect(ctx.isOver()).toBeNull();
    ctx.dispatch('p1', 'score');
    expect(ctx.isOver()?.players[0]).toMatchObject({ playerId: 'p1', rank: 1 });
  });

  it('ends when only one player is left', () => {
    const ctx = createTestContext(game, { players: 2 });
    ctx.leave('p2');
    expect(ctx.isOver()?.players).toHaveLength(1);
  });
});
