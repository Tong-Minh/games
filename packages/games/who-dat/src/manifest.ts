import { defineManifest } from '@games/game-sdk';
import { z } from 'zod';

export default defineManifest({
  id: 'who-dat',
  name: 'Who Dat?',
  description:
    'Each of you secretly gets an animal. Ask yes-or-no questions, flip down the ones it can’t be, and name theirs first.',
  version: 1,
  minPlayers: 2,
  maxPlayers: 2,
  settings: z.object({
    boardSize: z.number().int().min(12).max(30).default(24).meta({ title: 'Animals on the board' }),
    turnSeconds: z.number().int().min(30).max(300).default(120).meta({ title: 'Seconds per turn' }),
    wrongGuessLoses: z.boolean().default(true).meta({ title: 'Wrong guess loses the game' }),
  }),
  realtime: false,
});
