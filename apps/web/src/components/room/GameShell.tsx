'use client';

import type { GameProps } from '@games/game-sdk/client';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { usePlay } from '@/components/providers/PlayProvider';
import { gameClients } from '@/game-clients.gen';
import type { RoomView } from './useRoomView';

/** Loads the game's own UI (only when the game is opened) and hands it the room. */
export function GameShell({ view }: { view: RoomView }) {
  const { subscribe } = usePlay();
  const gameId = view.room.state.gameId;

  const Game = useMemo(() => {
    const load = gameClients[gameId];
    if (!load) return null;
    return dynamic(load, {
      ssr: false,
      loading: () => <p className="p-6 text-center text-zinc-500">Loading game…</p>,
    });
  }, [gameId]);

  if (!Game) return <p className="text-red-600">This game isn&apos;t available.</p>;

  const props: GameProps = {
    state: view.room.state.game,
    me: view.me,
    players: view.players,
    settings: view.settings,
    hasFeature: (id) => view.features.includes(id),
    send: (type, message) => view.room.send(type, message),
    onMessage: (type, callback) => subscribe(type, callback as (message: unknown) => void),
  };

  return <Game {...props} />;
}
