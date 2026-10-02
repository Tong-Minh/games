'use client';

import { LobbyMessage } from '@games/game-sdk';
import { useState } from 'react';
import { Avatar, Button, Card } from '@/components/ui';
import { SettingsForm } from './SettingsForm';
import type { RoomView } from './useRoomView';

export function LobbyPanel({ view }: { view: RoomView }) {
  const { room, manifest, players, me, isHost, settings, features } = view;
  const [copied, setCopied] = useState(false);
  const code = room.state.code;
  const meReady = room.state.players.get(me)?.ready ?? false;
  const others = players.filter((p) => !p.isHost);
  const everyoneReady = others.every((p) => room.state.players.get(p.id)?.ready);
  const enough = players.length >= (manifest?.minPlayers ?? 1);
  const lobbyFeatures = manifest?.features.filter((f) => f.scope === 'lobby') ?? [];

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the code is still visible.
    }
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            {room.state.isPrivate ? 'Private lobby' : 'Public lobby'} · code
          </p>
          <p className="font-mono text-3xl font-bold tracking-[0.3em]">{code}</p>
        </div>
        <Button variant="secondary" onClick={copyInvite}>
          {copied ? 'Link copied!' : 'Copy invite link'}
        </Button>
      </Card>

      <Card>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">
            Players{' '}
            <span className="text-sm font-normal text-zinc-500">
              {players.length}/{manifest?.maxPlayers}
            </span>
          </h2>
          {manifest && !enough && (
            <p className="text-sm text-zinc-500">Need at least {manifest.minPlayers}</p>
          )}
        </div>
        <ul className="space-y-2">
          {players.map((player) => {
            const ready = room.state.players.get(player.id)?.ready;
            return (
              <li key={player.id} className="flex items-center gap-3">
                <Avatar name={player.name} url={player.avatarUrl} />
                <span className={`flex-1 truncate ${player.connected ? '' : 'opacity-50'}`}>
                  {player.name}
                  {player.id === me && <span className="text-zinc-500"> (you)</span>}
                  {player.isGuest && <span className="ml-1 text-xs text-zinc-500">guest</span>}
                </span>
                {!player.connected && <span className="text-xs text-amber-600">reconnecting…</span>}
                {player.isHost ? (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    Host
                  </span>
                ) : (
                  <span
                    className={`text-xs font-semibold ${ready ? 'text-emerald-600' : 'text-zinc-400'}`}
                  >
                    {ready ? 'Ready' : 'Not ready'}
                  </span>
                )}
                {isHost && player.id !== me && (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => room.send(LobbyMessage.Kick, { playerId: player.id })}
                  >
                    Kick
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {manifest && (
        <Card className="space-y-4">
          <h2 className="font-semibold">Settings</h2>
          <SettingsForm
            manifest={manifest}
            values={settings}
            editable={isHost}
            onChange={(patch) => room.send(LobbyMessage.Settings, { settings: patch })}
          />
          {lobbyFeatures.length > 0 && (
            <div className="space-y-2">
              {lobbyFeatures.map((feature) => (
                <label key={feature.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={!isHost}
                    checked={features.includes(feature.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...features, feature.id]
                        : features.filter((id) => id !== feature.id);
                      room.send(LobbyMessage.Features, { features: next });
                    }}
                    className="size-4 accent-indigo-600"
                  />
                  {feature.name}
                </label>
              ))}
            </div>
          )}
          {!isHost && <p className="text-xs text-zinc-500">Only the host can change settings.</p>}
        </Card>
      )}

      <div className="flex justify-end">
        {isHost ? (
          <Button
            className="px-6 py-3 text-base"
            disabled={!enough || !everyoneReady}
            onClick={() => room.send(LobbyMessage.Start)}
          >
            {!enough ? 'Waiting for players' : !everyoneReady ? 'Waiting for ready' : 'Start game'}
          </Button>
        ) : (
          <Button
            className="px-6 py-3 text-base"
            variant={meReady ? 'secondary' : 'primary'}
            onClick={() => room.send(LobbyMessage.Ready, { ready: !meReady })}
          >
            {meReady ? "I'm not ready" : "I'm ready"}
          </Button>
        )}
      </div>
    </div>
  );
}
