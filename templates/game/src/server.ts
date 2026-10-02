import { schema, t } from '@colyseus/schema';
import { defineGame } from '@games/game-sdk';
import { z } from 'zod';
import manifest from './manifest';

// Synced state. Mark fields `.view()` and use `ctx.reveal()` for hidden information.
const Player = schema({ score: t.uint16().default(0) }, '__GAME_STATE__Player');
const State = schema({ players: t.map(Player) }, '__GAME_STATE__State');

// Placeholder gameplay: first to `target` points wins. Replace with the real game.
export default defineGame(manifest, {
  State,

  setup(ctx) {
    for (const player of ctx.players) ctx.state.players.set(player.id, new Player());
  },

  messages: {
    score: {
      schema: z.object({}).optional(),
      handle(ctx, playerId) {
        const player = ctx.state.players.get(playerId);
        if (player) player.score += 1;
      },
    },
  },

  onPlayerLeave(ctx, playerId) {
    ctx.state.players.delete(playerId);
  },

  isOver(ctx) {
    const players = [...ctx.state.players.entries()];
    const someoneWon = players.some(([, p]) => p.score >= ctx.settings.target);
    if (!someoneWon && players.length > 1) return null;
    return {
      players: players
        .sort(([, a], [, b]) => b.score - a.score)
        .map(([playerId, p], i) => ({ playerId, rank: i + 1, score: p.score })),
    };
  },
});
