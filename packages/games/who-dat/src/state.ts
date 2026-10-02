import { schema, t } from '@colyseus/schema';

/** One player's side. Their secret animal is hidden from the opponent until the end. */
export const Side = schema(
  {
    secret: t.string().default('').view(),
    /** Animals this player has flipped down. Visible to both, like the physical game. */
    flipped: t.array('string'),
  },
  'WhoDatSide',
);
export type Side = InstanceType<typeof Side>;

export const Entry = schema(
  {
    asker: t.string().default(''),
    text: t.string().default(''),
    /** '' while waiting; 'yes' | 'no' | 'unsure'. */
    answer: t.string().default(''),
    /** 'question', or 'guess' for a wrong guess when wrong guesses don't end the game. */
    kind: t.string().default('question'),
    /** True when the answer was filled in because time ran out. */
    timedOut: t.boolean().default(false),
  },
  'WhoDatEntry',
);
export type Entry = InstanceType<typeof Entry>;

export type Stage = 'ask' | 'answer' | 'reveal' | 'done';

export const State = schema(
  {
    /** Animal ids on this match's board, in display order. */
    board: t.array('string'),
    sides: t.map(Side),
    /** The player whose turn it is to ask or guess. */
    turn: t.string().default(''),
    stage: t.string().default('ask'),
    turnEndsAt: t.number().default(0),
    log: t.array(Entry),
    winner: t.string().default(''),
    /** The final guess, shown during the reveal. */
    guessBy: t.string().default(''),
    guess: t.string().default(''),
    /** Why the match ended: 'guess' | 'wrong-guess' | 'left'. */
    endReason: t.string().default(''),
  },
  'WhoDatState',
);
export type State = InstanceType<typeof State>;

export const ANSWERS = ['yes', 'no', 'unsure'] as const;
export type Answer = (typeof ANSWERS)[number];
export const QUESTION_MAX_LENGTH = 140;
export const REVEAL_MS = 6000;
