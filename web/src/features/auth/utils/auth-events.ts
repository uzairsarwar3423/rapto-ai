/**
 * Cross-Tab Authentication Synchronizer
 * Uses BroadcastChannel (with localStorage fallback) to sync auth states instantly across all open browser tabs.
 */

type AuthEventType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'TOKEN_REFRESHED'
  | 'SESSION_EXPIRED';

interface AuthEventPayload {
  type: AuthEventType;
  accessToken?: string | null;
  user?: any;
  timestamp: number;
}

const CHANNEL_NAME = 'rapto_auth_sync_channel';

class AuthSyncManager {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(event: AuthEventPayload) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (e: MessageEvent) => {
          this.notifyListeners(e.data);
        };
      } else {
        (window as Window).addEventListener('storage', (e: StorageEvent) => {
          if (e.key === CHANNEL_NAME && e.newValue) {
            try {
              const data = JSON.parse(e.newValue);
              this.notifyListeners(data);
            } catch {}
          }
        });
      }
    }
  }

  public emit(type: AuthEventType, payload?: { accessToken?: string | null; user?: any }) {
    if (typeof window === 'undefined') return;

    const data: AuthEventPayload = {
      type,
      accessToken: payload?.accessToken,
      user: payload?.user,
      timestamp: Date.now(),
    };

    if (this.channel) {
      this.channel.postMessage(data);
    } else {
      try {
        localStorage.setItem(CHANNEL_NAME, JSON.stringify(data));
      } catch {}
    }
  }

  public subscribe(callback: (event: AuthEventPayload) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(data: AuthEventPayload) {
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error('[AuthSync] Listener error:', err);
      }
    });
  }
}

export const authSync = new AuthSyncManager();
