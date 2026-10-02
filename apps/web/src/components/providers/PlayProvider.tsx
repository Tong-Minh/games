'use client';

import type { Room } from '@colyseus/sdk';
import { type ChatMessage, CloseCode, LobbyMessage, type LobbyState } from '@games/game-sdk';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { GuestNameDialog } from '@/components/GuestNameDialog';
import { describeJoinError, gameClient, gameServer } from '@/lib/gameServer';
import { storage } from '@/lib/storage';
import { supabaseBrowser } from '@/lib/supabase/client';

/** Client-side view of the room state: the platform lobby plus the game's own state. */
export type RoomState = LobbyState & { game: unknown };
export type GameRoom = Room<unknown, RoomState>;

type Listener = (message: unknown) => void;

interface PlayContextValue {
  room: GameRoom | null;
  /** Increments on every state patch so consumers re-render. */
  version: number;
  chat: ChatMessage[];
  /** Why the last room was left, if it wasn't the player's choice. */
  notice: string | null;
  /** Latest error from the server (e.g. "Not everyone is ready"); cleared after a few seconds. */
  serverError: string | null;
  create(gameId: string, options: { private: boolean }): Promise<GameRoom>;
  joinByCode(code: string): Promise<GameRoom>;
  joinById(roomId: string, code?: string): Promise<GameRoom>;
  /** After a page refresh: rejoin the room this tab was in, if it still exists. */
  resume(roomId: string): Promise<GameRoom | null>;
  leave(): Promise<void>;
  subscribe(type: string, listener: Listener): () => void;
  dismissNotice(): void;
}

const PlayContext = createContext<PlayContextValue | null>(null);

const GUEST_TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

export function PlayProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [version, setVersion] = useState(0);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [askingName, setAskingName] = useState(false);
  const nameRequest = useRef<{ resolve(name: string): void; reject(error: Error): void } | null>(
    null,
  );
  const listeners = useRef(new Map<string, Set<Listener>>());
  const roomRef = useRef<GameRoom | null>(null);
  const resuming = useRef(new Map<string, Promise<GameRoom | null>>());

  const askGuestName = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        nameRequest.current = { resolve, reject };
        setAskingName(true);
      }),
    [],
  );

  /** A Supabase access token for signed-in players, otherwise a guest token. */
  const getToken = useCallback(async (): Promise<string> => {
    const { data } = await supabaseBrowser().auth.getSession();
    if (data.session) return data.session.access_token;

    const guest = storage.guest();
    if (guest && guest.expiresAt > Date.now()) return guest.token;
    const name = storage.guestName() ?? (await askGuestName());
    const issued = await gameServer.issueGuestToken(name);
    storage.setGuestName(issued.name);
    storage.setGuest({
      name: issued.name,
      token: issued.token,
      expiresAt: Date.now() + GUEST_TOKEN_TTL_MS,
    });
    return issued.token;
  }, [askGuestName]);

  const attach = useCallback((next: GameRoom) => {
    roomRef.current = next;
    setRoom(next);
    setChat([]);
    setNotice(null);
    const remember = () =>
      storage.setRoomSession({
        roomId: next.roomId,
        reconnectionToken: next.reconnectionToken,
        code: next.state?.code ?? '',
      });

    next.onStateChange(() => {
      remember();
      setVersion((v) => v + 1);
    });
    next.onReconnect(() => {
      remember();
      setVersion((v) => v + 1);
    });
    next.onDrop(() => setVersion((v) => v + 1));
    next.onMessage('*', (type, message) => {
      if (type === LobbyMessage.Chat) {
        setChat((log) => [...log.slice(-99), message as ChatMessage]);
      } else if (type === LobbyMessage.Error) {
        setServerError((message as { message: string }).message);
      }
      for (const listener of listeners.current.get(String(type)) ?? []) listener(message);
    });
    next.onLeave((code) => {
      if (roomRef.current !== next) return;
      roomRef.current = null;
      setRoom(null);
      storage.setRoomSession(null);
      if (code === CloseCode.Kicked) setNotice('The host removed you from the lobby.');
      else if (code === CloseCode.Idle) setNotice('The lobby closed after being idle.');
      else if (code !== 4000 && code !== 1000) setNotice('You were disconnected from the lobby.');
    });
  }, []);

  useEffect(() => {
    if (!serverError) return;
    const timer = setTimeout(() => setServerError(null), 4000);
    return () => clearTimeout(timer);
  }, [serverError]);

  const leaveCurrent = useCallback(async () => {
    const current = roomRef.current;
    roomRef.current = null;
    setRoom(null);
    storage.setRoomSession(null);
    if (current) await current.leave(true).catch(() => {});
  }, []);

  const connect = useCallback(
    async (open: () => Promise<GameRoom>) => {
      try {
        const client = gameClient();
        client.auth.token = await getToken();
        await leaveCurrent();
        const next = await open();
        attach(next);
        return next;
      } catch (error) {
        throw new Error(describeJoinError(error));
      }
    },
    [attach, getToken, leaveCurrent],
  );

  const value = useMemo<PlayContextValue>(
    () => ({
      room,
      version,
      chat,
      notice,
      serverError,
      create: (gameId, options) =>
        connect(() => gameClient().create<RoomState>(gameId, { private: options.private })),
      joinById: (roomId, code) =>
        connect(() => gameClient().joinById<RoomState>(roomId, code ? { code } : {})),
      joinByCode: async (code) => {
        const found = await gameServer.lookupCode(code).catch((error: unknown) => {
          throw new Error(describeJoinError(error));
        });
        return connect(() => gameClient().joinById<RoomState>(found.roomId, { code: found.code }));
      },
      resume: (roomId) => {
        if (roomRef.current?.roomId === roomId) return Promise.resolve(roomRef.current);
        // Two concurrent reconnects with the same token make the server drop the seat, so
        // every caller (including effects that run twice) shares one attempt.
        const pending = resuming.current.get(roomId);
        if (pending) return pending;
        const attempt = (async () => {
          const saved = storage.roomSession();
          if (saved?.roomId !== roomId) return null;
          try {
            const next = await gameClient().reconnect<RoomState>(saved.reconnectionToken);
            attach(next);
            return next;
          } catch {
            storage.setRoomSession(null);
            if (!saved.code) return null;
            return connect(() =>
              gameClient().joinById<RoomState>(roomId, { code: saved.code }),
            ).catch(() => null);
          }
        })().finally(() => resuming.current.delete(roomId));
        resuming.current.set(roomId, attempt);
        return attempt;
      },
      leave: leaveCurrent,
      subscribe(type, listener) {
        const set = listeners.current.get(type) ?? new Set();
        set.add(listener);
        listeners.current.set(type, set);
        return () => set.delete(listener);
      },
      dismissNotice: () => setNotice(null),
    }),
    [room, version, chat, notice, serverError, connect, attach, leaveCurrent],
  );

  return (
    <PlayContext value={value}>
      {children}
      {askingName && (
        <GuestNameDialog
          initialName={storage.guestName() ?? ''}
          onSubmit={(name) => {
            setAskingName(false);
            nameRequest.current?.resolve(name);
          }}
          onCancel={() => {
            setAskingName(false);
            nameRequest.current?.reject(new Error('Pick a name to play as a guest.'));
          }}
        />
      )}
    </PlayContext>
  );
}

export function usePlay(): PlayContextValue {
  const value = useContext(PlayContext);
  if (!value) throw new Error('usePlay must be used inside PlayProvider');
  return value;
}
