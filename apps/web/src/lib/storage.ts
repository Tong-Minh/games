/** Browser storage that never throws (private windows, blocked storage, SSR). */
function store(kind: 'local' | 'session'): Storage | null {
  try {
    return typeof window === 'undefined'
      ? null
      : kind === 'local'
        ? window.localStorage
        : window.sessionStorage;
  } catch {
    return null;
  }
}

function read<T>(kind: 'local' | 'session', key: string): T | null {
  try {
    const raw = store(kind)?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(kind: 'local' | 'session', key: string, value: unknown) {
  try {
    if (value === null) store(kind)?.removeItem(key);
    else store(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable; the feature degrades gracefully.
  }
}

export interface GuestIdentity {
  name: string;
  token: string;
  /** Epoch ms; tokens last 24h, refreshed a bit early. */
  expiresAt: number;
}

/** Per-tab: lets a refreshed page rejoin its room. */
export interface RoomSession {
  roomId: string;
  reconnectionToken: string;
  code: string;
}

export const storage = {
  guest: () => read<GuestIdentity>('local', 'guest'),
  setGuest: (guest: GuestIdentity | null) => write('local', 'guest', guest),
  guestName: () => read<string>('local', 'guest-name'),
  setGuestName: (name: string) => write('local', 'guest-name', name),
  roomSession: () => read<RoomSession>('session', 'room'),
  setRoomSession: (session: RoomSession | null) => write('session', 'room', session),
};
