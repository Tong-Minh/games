'use client';

import type { SettingsOf } from '@games/game-sdk';
import type { GameProps, PlayerView } from '@games/game-sdk/client';
import { useEffect, useState } from 'react';
import type manifest from './manifest';
import { countMatching, isHigherBid, type State } from './state';

type Props = GameProps<State, SettingsOf<typeof manifest>>;

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 26],
    [72, 26],
    [28, 50],
    [72, 50],
    [28, 74],
    [72, 74],
  ],
};

function Die({
  value,
  size = 40,
  highlight = false,
  hidden = false,
}: {
  value?: number;
  size?: number;
  highlight?: boolean;
  hidden?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={hidden || !value ? 'hidden die' : `die showing ${value}`}
      className="shrink-0"
    >
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="18"
        className={
          hidden
            ? 'fill-zinc-300 dark:fill-zinc-700'
            : highlight
              ? 'fill-amber-300 stroke-amber-500'
              : 'fill-white stroke-zinc-300 dark:stroke-zinc-600'
        }
        strokeWidth="4"
      />
      {!hidden &&
        value &&
        PIPS[value]?.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="9" className="fill-zinc-900" />
        ))}
      {hidden && (
        <text x="50" y="64" textAnchor="middle" fontSize="44" className="fill-zinc-500 font-bold">
          ?
        </text>
      )}
    </svg>
  );
}

function useSecondsLeft(endsAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** The smallest bid that beats the current one. */
function nextBid(count: number, face: number): [number, number] {
  if (count === 0) return [1, 1];
  return face < 6 ? [count, face + 1] : [count + 1, 1];
}

export default function LiarsDice({ state, me, players, send }: Props) {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  const myTurn = state.turn === me && !state.revealing;
  const myHand = state.hands.get(me);
  const myDice = myHand?.dice ? [...myHand.dice] : [];
  const inGame = state.order.includes(me);
  let totalDice = 0;
  for (const id of state.order) totalDice += state.hands.get(id)?.count ?? 0;
  const secondsLeft = useSecondsLeft(state.turnEndsAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Round {state.round} · {totalDice} dice in play{state.wildOnes && ' · 1s are wild'}
          </p>
          {state.bidCount > 0 ? (
            <p className="flex items-center gap-2 text-xl font-semibold">
              {nameOf(state.bidder)} bids {state.bidCount} ×
              <Die value={state.bidFace} size={28} />
            </p>
          ) : (
            <p className="text-xl font-semibold">No bids yet</p>
          )}
        </div>
        {!state.revealing && state.turn && (
          <p
            className={`text-sm font-medium ${myTurn ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500'}`}
          >
            {myTurn ? 'Your turn' : `${nameOf(state.turn)}'s turn`} ·{' '}
            <span className={`tabular-nums ${secondsLeft <= 10 ? 'text-red-600' : ''}`}>
              {secondsLeft}s
            </span>
          </p>
        )}
      </div>

      <PlayerRow state={state} players={players} me={me} />

      {state.revealing ? (
        <Showdown state={state} players={players} nameOf={nameOf} />
      ) : (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-5 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 text-sm font-medium text-zinc-500">
              {inGame ? 'Your cup' : "You're out. Watching the rest of the game."}
            </h3>
            {inGame && (
              <div className="flex flex-wrap justify-center gap-2">
                {myDice.map((value, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: dice have no identity.
                  <Die key={i} value={value} size={56} />
                ))}
              </div>
            )}
          </section>
          {myTurn && (
            <BidControls
              key={`${state.round}-${state.bidCount}-${state.bidFace}`}
              state={state}
              totalDice={totalDice}
              send={send}
            />
          )}
        </>
      )}
    </div>
  );
}

function PlayerRow({
  state,
  players,
  me,
}: {
  state: State;
  players: readonly PlayerView[];
  me: string;
}) {
  const seated = [...players].sort((a, b) => {
    const ia = state.order.indexOf(a.id);
    const ib = state.order.indexOf(b.id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {seated.map((player) => {
        const count = state.hands.get(player.id)?.count ?? 0;
        const out = !state.order.includes(player.id);
        const turn = state.turn === player.id && !state.revealing;
        return (
          <li
            key={player.id}
            className={`rounded-lg border px-3 py-2 ${
              turn
                ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                : 'border-zinc-200 dark:border-zinc-800'
            } ${out ? 'opacity-40' : ''} bg-white dark:bg-zinc-900`}
          >
            <p className="truncate text-sm font-medium">
              {player.name}
              {player.id === me && <span className="text-zinc-500"> (you)</span>}
              {!player.connected && <span className="text-xs text-amber-600"> · reconnecting</span>}
            </p>
            <p className="mt-1 flex gap-0.5">
              {out ? (
                <span className="text-xs text-zinc-500">Out</span>
              ) : (
                Array.from({ length: count }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: dice have no identity.
                  <Die key={i} hidden size={18} />
                ))
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function BidControls({
  state,
  totalDice,
  send,
}: {
  state: State;
  totalDice: number;
  send: Props['send'];
}) {
  const [initialCount, initialFace] = nextBid(state.bidCount, state.bidFace);
  const [count, setCount] = useState(initialCount);
  const [face, setFace] = useState(initialFace);
  const valid = count <= totalDice && isHigherBid(count, face, state.bidCount, state.bidFace);

  return (
    <section className="space-y-4 rounded-xl border-2 border-indigo-500 bg-white p-5 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Fewer dice"
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            className="size-9 rounded-lg border border-zinc-300 text-lg dark:border-zinc-700"
          >
            −
          </button>
          <span className="w-10 text-center text-2xl font-bold tabular-nums">{count}</span>
          <button
            type="button"
            aria-label="More dice"
            onClick={() => setCount((c) => Math.min(totalDice, c + 1))}
            className="size-9 rounded-lg border border-zinc-300 text-lg dark:border-zinc-700"
          >
            +
          </button>
        </div>
        <span className="text-2xl text-zinc-400">×</span>
        <fieldset className="flex gap-1.5">
          <legend className="sr-only">Face</legend>
          {[1, 2, 3, 4, 5, 6].map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-lg p-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-300 ${
                face === value ? 'ring-2 ring-indigo-500' : 'opacity-60 hover:opacity-100'
              }`}
            >
              <input
                type="radio"
                name="face"
                value={value}
                checked={face === value}
                onChange={() => setFace(value)}
                className="sr-only"
              />
              <Die value={value} size={36} />
            </label>
          ))}
        </fieldset>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          disabled={!valid}
          onClick={() => send('bid', { count, face })}
          className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Bid {count} × {face}s
        </button>
        {state.bidCount > 0 && (
          <button
            type="button"
            onClick={() => send('challenge')}
            className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-500"
          >
            Liar!
          </button>
        )}
      </div>
      {!valid && (
        <p className="text-center text-xs text-zinc-500">
          Raise the count, or keep it and pick a higher face.
        </p>
      )}
    </section>
  );
}

function Showdown({
  state,
  players,
  nameOf,
}: {
  state: State;
  players: readonly PlayerView[];
  nameOf(id: string): string;
}) {
  const bidStood = state.lastActual >= state.lastBidCount;
  const loserOut = !state.order.includes(state.lastLoser);
  return (
    <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/40">
      <p className="text-center text-lg">
        <strong>{nameOf(state.lastChallenger)}</strong> called{' '}
        <strong>{nameOf(state.lastBidder)}</strong>&apos;s bid of {state.lastBidCount} ×{' '}
        {state.lastBidFace}s. There {state.lastActual === 1 ? 'was' : 'were'}{' '}
        <strong>{state.lastActual}</strong>. {bidStood ? 'The bid stands.' : 'Liar!'}{' '}
        <strong>{nameOf(state.lastLoser)}</strong> {loserOut ? 'is out!' : 'loses a die.'}
      </p>
      <ul className="space-y-2">
        {players.map((player) => {
          const dice = state.hands.get(player.id)?.dice;
          if (!dice?.length) return null;
          return (
            <li key={player.id} className="flex items-center gap-3">
              <span className="w-28 truncate text-sm font-medium">{player.name}</span>
              <span className="flex flex-wrap gap-1">
                {[...dice].map((value, i) => (
                  <Die
                    // biome-ignore lint/suspicious/noArrayIndexKey: dice have no identity.
                    key={i}
                    value={value}
                    size={32}
                    highlight={countMatching([value], state.lastBidFace, state.wildOnes) > 0}
                  />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-xs text-zinc-500">Next round starts in a moment…</p>
    </section>
  );
}
