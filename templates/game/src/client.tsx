'use client';

import type { SettingsOf } from '@games/game-sdk';
import type { GameProps } from '@games/game-sdk/client';
import type manifest from './manifest';
import type { State } from './state';

type Props = GameProps<State, SettingsOf<typeof manifest>>;

// Rendered inside the platform's game shell. Lobby, chat and results are handled for you.
export default function Game({ state, me, players, settings, send }: Props) {
  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <p className="text-sm opacity-70">First to {settings.target} wins</p>
      <ul className="w-full max-w-sm space-y-2">
        {players.map((player) => (
          <li key={player.id} className="flex justify-between rounded-lg border px-4 py-2">
            <span>
              {player.name}
              {player.id === me && ' (you)'}
            </span>
            <span className="font-mono">{state.players.get(player.id)?.score ?? 0}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => send('score')}
        className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white"
      >
        Score!
      </button>
    </div>
  );
}
