import { defineManifest } from '@games/game-sdk';
import { z } from 'zod';

export default defineManifest({
  id: '__GAME_ID__',
  name: '__GAME_NAME__',
  description: 'Describe the game in one sentence.',
  // Bump whenever the state shape or messages change.
  version: 1,
  minPlayers: 2,
  maxPlayers: 8,
  // Host-editable settings. Every field needs a default.
  settings: z.object({
    target: z.number().int().min(1).max(20).default(5),
  }),
  // Set `realtime: true` (and implement `tick`) for action games.
  realtime: false,
});
