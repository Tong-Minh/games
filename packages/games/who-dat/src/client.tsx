'use client';

import type { SettingsOf } from '@games/game-sdk';
import type { GameProps } from '@games/game-sdk/client';
import { useEffect, useState } from 'react';
import { animal } from './animals';
import type manifest from './manifest';
import { type Answer, QUESTION_MAX_LENGTH, type State } from './state';

type Props = GameProps<State, SettingsOf<typeof manifest>>;

function useSecondsLeft(endsAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

const answerStyle: Record<string, string> = {
  yes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  no: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  unsure: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};
const answerLabel: Record<string, string> = { yes: 'Yes', no: 'No', unsure: 'Not sure' };

function AnimalBadge({ id, size = 'text-4xl' }: { id: string; size?: string }) {
  const a = animal(id);
  return (
    <span className="inline-flex flex-col items-center">
      <span className={size} aria-hidden>
        {a?.emoji ?? '❓'}
      </span>
      <span className="text-sm font-semibold">{a?.name ?? 'Unknown'}</span>
    </span>
  );
}

export default function WhoDat({ state, me, players, send }: Props) {
  const opponent = players.find((p) => p.id !== me);
  const myTurn = state.turn === me;
  const mySide = state.sides.get(me);
  const theirSide = opponent ? state.sides.get(opponent.id) : undefined;
  const flipped = new Set(mySide ? [...mySide.flipped] : []);
  const theirFlipped = theirSide?.flipped.length ?? 0;
  const secondsLeft = useSecondsLeft(state.turnEndsAt);
  const [guessing, setGuessing] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const over = state.stage === 'reveal' || state.stage === 'done';
  const waitingQuestion = state.stage === 'answer' ? state.log.at(-1) : undefined;

  // Leave guess mode whenever the turn changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on turn/stage change.
  useEffect(() => {
    setGuessing(false);
    setPick(null);
  }, [state.turn, state.stage]);

  return (
    <div className="space-y-5">
      {/* What's happening */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-lg font-semibold">
          {over
            ? state.winner === me
              ? '🎉 You win!'
              : `${opponent?.name ?? 'They'} wins`
            : state.stage === 'ask'
              ? myTurn
                ? 'Your turn: ask a yes-or-no question, or make a guess'
                : `${opponent?.name ?? 'They'} is thinking of a question…`
              : myTurn
                ? `Waiting for ${opponent?.name ?? 'them'} to answer…`
                : `${opponent?.name ?? 'They'} asked you a question`}
        </p>
        {!over && (
          <span
            className={`text-sm tabular-nums ${secondsLeft <= 15 ? 'text-red-600' : 'text-zinc-500'}`}
          >
            {secondsLeft}s
          </span>
        )}
      </div>

      {/* The question you need to answer */}
      {waitingQuestion && !myTurn && (
        <section className="space-y-4 rounded-xl border-2 border-indigo-500 bg-white p-5 text-center dark:bg-zinc-900">
          <p className="text-xl">&ldquo;{waitingQuestion.text}&rdquo;</p>
          {mySide?.secret && (
            <p className="text-sm text-zinc-500">
              Your animal: {animal(mySide.secret)?.emoji} {animal(mySide.secret)?.name}
            </p>
          )}
          <div className="flex justify-center gap-3">
            {(['yes', 'no', 'unsure'] as Answer[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => send('answer', { answer: value })}
                className={`rounded-lg px-6 py-3 font-semibold ${
                  value === 'yes'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : value === 'no'
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'
                }`}
              >
                {answerLabel[value]}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* The ending */}
      {over && (
        <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-5 text-center dark:border-amber-800 dark:bg-amber-950/40">
          {state.endReason === 'wrong-guess' && (
            <p>
              {players.find((p) => p.id === state.guessBy)?.name} guessed{' '}
              <strong>{animal(state.guess)?.name}</strong>, and that wasn&apos;t it.
            </p>
          )}
          {state.endReason === 'guess' && (
            <p>
              {players.find((p) => p.id === state.guessBy)?.name} guessed it:{' '}
              <strong>{animal(state.guess)?.name}</strong>!
            </p>
          )}
          <div className="flex justify-center gap-10">
            {players.map((player) => {
              const secret = state.sides.get(player.id)?.secret;
              return (
                <div key={player.id} className="space-y-1">
                  <p className="text-xs text-zinc-500">
                    {player.id === me ? 'Your animal' : `${player.name}'s animal`}
                  </p>
                  {secret ? (
                    <AnimalBadge id={secret} size="text-6xl" />
                  ) : (
                    <span className="text-6xl">❓</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_14rem]">
        {/* Board */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-zinc-500">
              {guessing
                ? 'Pick the animal you think they have'
                : 'Tap animals it can’t be to flip them down'}
            </h3>
            <span className="text-xs text-zinc-500">
              {opponent?.name ?? 'Opponent'} has {state.board.length - theirFlipped} left
            </span>
          </div>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {[...state.board].map((id) => {
              const a = animal(id);
              const down = flipped.has(id);
              const picked = pick === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={over || (guessing && down)}
                    onClick={() => (guessing ? setPick(id) : send('flip', { animal: id }))}
                    aria-pressed={guessing ? picked : down}
                    aria-label={`${a?.name}${down ? ', flipped down' : ''}`}
                    className={`flex aspect-[3/4] w-full flex-col items-center justify-center rounded-lg border-2 transition ${
                      picked
                        ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/40 dark:bg-indigo-950'
                        : down
                          ? 'border-zinc-200 bg-zinc-100 opacity-35 dark:border-zinc-800 dark:bg-zinc-900'
                          : 'border-zinc-200 bg-white hover:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900'
                    }`}
                  >
                    <span className={`text-3xl sm:text-4xl ${down ? 'grayscale' : ''}`} aria-hidden>
                      {a?.emoji}
                    </span>
                    <span className="mt-1 text-[11px] font-medium sm:text-xs">{a?.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Your animal + log */}
        <aside className="space-y-4">
          {mySide?.secret && !over && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-1 text-xs text-zinc-500">Your animal (they&apos;re guessing this)</p>
              <AnimalBadge id={mySide.secret} size="text-5xl" />
            </div>
          )}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-2 text-sm font-semibold">Questions</h3>
            {state.log.length === 0 ? (
              <p className="text-xs text-zinc-500">None yet.</p>
            ) : (
              <ol className="max-h-72 space-y-2 overflow-y-auto text-sm">
                {[...state.log].reverse().map((entry, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: log entries are append-only.
                  <li key={i}>
                    <p className="text-xs text-zinc-500">
                      {entry.asker === me ? 'You' : opponent?.name}
                    </p>
                    <p className="break-words">{entry.text}</p>
                    {entry.answer && (
                      <span
                        className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${answerStyle[entry.answer]}`}
                      >
                        {answerLabel[entry.answer]}
                        {entry.timedOut && ' (time ran out)'}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>

      {/* Ask or guess */}
      {myTurn && state.stage === 'ask' && (
        <AskBar
          guessing={guessing}
          pick={pick}
          onToggleGuess={() => {
            setGuessing((g) => !g);
            setPick(null);
          }}
          onAsk={(text) => send('ask', { text })}
          onGuess={() => pick && send('guess', { animal: pick })}
        />
      )}
    </div>
  );
}

function AskBar({
  guessing,
  pick,
  onToggleGuess,
  onAsk,
  onGuess,
}: {
  guessing: boolean;
  pick: string | null;
  onToggleGuess(): void;
  onAsk(text: string): void;
  onGuess(): void;
}) {
  const [text, setText] = useState('');
  return (
    <section className="sticky bottom-3 rounded-xl border-2 border-indigo-500 bg-white p-4 shadow-lg dark:bg-zinc-900">
      {guessing ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {pick ? (
              <>
                Guess <strong>{animal(pick)?.name}</strong>? A wrong guess may cost you the game.
              </>
            ) : (
              'Tap the animal you think they have.'
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onToggleGuess}
              className="rounded-lg px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Back to asking
            </button>
            <button
              type="button"
              disabled={!pick}
              onClick={onGuess}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-40"
            >
              Lock in guess
            </button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) return;
            onAsk(text);
            setText('');
          }}
        >
          <input
            aria-label="Your question"
            placeholder="Does it live in the water?"
            value={text}
            maxLength={QUESTION_MAX_LENGTH}
            onChange={(event) => setText(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Ask
          </button>
          <button
            type="button"
            onClick={onToggleGuess}
            className="rounded-lg border border-amber-500 px-4 py-2 font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
          >
            Make a guess
          </button>
        </form>
      )}
    </section>
  );
}
