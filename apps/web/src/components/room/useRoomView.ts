'use client';

import type { GameManifest, LobbyPhase } from '@games/game-sdk';
import type { PlayerView } from '@games/game-sdk/client';
import { useMemo } from 'react';
import { type GameRoom, usePlay } from '@/components/providers/PlayProvider';
import { manifests } from '@/games.gen';

export interface RoomView {
  room: GameRoom;
  manifest: GameManifest | undefined;
  phase: LobbyPhase;
  me: string;
  isHost: boolean;
  players: PlayerView[];
  settings: Record<string, unknown>;
  features: string[];
  /** The server runs a different version of this game than this page was built with. */
  outdated: boolean;
}

/** A plain snapshot of the room state, recomputed on every patch. */
export function useRoomView(): RoomView | null {
  const { room, version } = usePlay();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` changes on every patch.
  return useMemo(() => {
    const state = room?.state;
    if (!room || !state?.gameId) return null;
    const manifest = manifests.find((m) => m.id === state.gameId);
    const players: PlayerView[] = [];
    state.players.forEach((p, id) => {
      players.push({
        id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        isGuest: p.isGuest,
        isHost: id === state.hostId,
        connected: p.connected,
      });
    });
    players.sort(
      (a, b) => (state.players.get(a.id)?.joinedAt ?? 0) - (state.players.get(b.id)?.joinedAt ?? 0),
    );
    return {
      room,
      manifest,
      phase: state.phase as LobbyPhase,
      me: room.sessionId,
      isHost: room.sessionId === state.hostId,
      players,
      settings: JSON.parse(state.settings || '{}'),
      features: [...state.features],
      outdated: manifest !== undefined && manifest.version !== state.gameVersion,
    };
  }, [room, version]);
}
