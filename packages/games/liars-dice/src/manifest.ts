import { defineManifest } from '@games/game-sdk';
import { z } from 'zod';

export default defineManifest({
  id: 'liars-dice',
  name: "Liar's Dice",
  description:
    'Bluff about the dice under your cup. Call a liar, lose a die. Last one rolling wins.',
  version: 1,
  minPlayers: 2,
  maxPlayers: 6,
  features: [{ id: 'wild-ones', name: 'Wild ones (1s count as any face)', scope: 'lobby' }],
  settings: z.object({
    startingDice: z.number().int().min(3).max(6).default(5).meta({ title: 'Starting dice' }),
    turnSeconds: z.number().int().min(15).max(120).default(45).meta({ title: 'Seconds per turn' }),
  }),
  realtime: false,
});
