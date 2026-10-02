import { schema, t } from '@colyseus/schema';

// Synced state, shared by server and client. Mark fields `.view()` and use `ctx.reveal()`
// for hidden information.
export const Player = schema({ score: t.uint16().default(0) }, '__GAME_STATE__Player');
export const State = schema({ players: t.map(Player) }, '__GAME_STATE__State');

export type State = InstanceType<typeof State>;
