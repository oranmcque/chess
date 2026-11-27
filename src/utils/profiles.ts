// Multi-player / user profile manager with automatic migration of legacy local progress

export interface PlayerProfile {
  id: string;
  name: string;
  createdAt: string;
  lastActiveAt: string;
}

interface ProfileStoreState {
  activeProfileId: string;
  profiles: PlayerProfile[];
}

const PROFILES_STORE_KEY = 'ten-steps-profiles-index-v1';

// Legacy unscoped keys from before per-player profiles existed
const LEGACY_KEYS = {
  progress: 'ten-steps-player-progress-v1',
  puzzles: 'ten-steps-solved-puzzles-v1',
  fundamentals: 'ten-steps-fundamentals-done-v1',
  daily: 'ten-steps-daily-progress-v1',
} as const;

export type ScopedBucket = keyof typeof LEGACY_KEYS;

export function scopedStorageKey(bucket: ScopedBucket, profileId?: string): string {
  const pid = profileId ?? getActiveProfileId();
  return `ten-steps-p-${pid}-${bucket}`;
}

const listeners = new Set<() => void>();

export function notifyProfilesChanged() {
  listeners.forEach((cb) => cb());
}

export function subscribeProfiles(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function createDefaultStore(): ProfileStoreState {
  const now = new Date().toISOString();
  const defaultProfile: PlayerProfile = {
    id: 'player-1',
    name: 'Player 1',
    createdAt: now,
    lastActiveAt: now,
  };
  return {
    activeProfileId: defaultProfile.id,
    profiles: [defaultProfile],
  };
}

function migrateLegacyDataInto(profileId: string) {
  if (typeof window === 'undefined') return;
  try {
    (Object.keys(LEGACY_KEYS) as ScopedBucket[]).forEach((bucket) => {
      const legacyKey = LEGACY_KEYS[bucket];
      const targetKey = scopedStorageKey(bucket, profileId);
      const existing = localStorage.getItem(legacyKey);
      if (existing !== null && localStorage.getItem(targetKey) === null) {
        localStorage.setItem(targetKey, existing);
      }
    });
  } catch {
    // ignore storage errors
  }
}

function readStore(): ProfileStoreState {
  if (typeof window === 'undefined') return createDefaultStore();
  try {
    const raw = localStorage.getItem(PROFILES_STORE_KEY);
    if (!raw) {
      const init = createDefaultStore();
      migrateLegacyDataInto(init.activeProfileId);
      localStorage.setItem(PROFILES_STORE_KEY, JSON.stringify(init));
      return init;
    }
    const parsed = JSON.parse(raw) as Partial<ProfileStoreState>;
    if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
      const init = createDefaultStore();
      localStorage.setItem(PROFILES_STORE_KEY, JSON.stringify(init));
      return init;
    }
    const activeExists = parsed.profiles.some((p) => p.id === parsed.activeProfileId);
    return {
      activeProfileId: activeExists ? parsed.activeProfileId! : parsed.profiles[0].id,
      profiles: parsed.profiles,
    };
  } catch {
    return createDefaultStore();
  }
}

function writeStore(store: ProfileStoreState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PROFILES_STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
  notifyProfilesChanged();
}

export function getProfilesState(): ProfileStoreState {
  return readStore();
}

export function getProfiles(): PlayerProfile[] {
  return readStore().profiles;
}

export function getActiveProfileId(): string {
  return readStore().activeProfileId;
}

export function getActiveProfile(): PlayerProfile {
  const store = readStore();
  return store.profiles.find((p) => p.id === store.activeProfileId) ?? store.profiles[0];
}

export function setActiveProfile(profileId: string): PlayerProfile | null {
  const store = readStore();
  const target = store.profiles.find((p) => p.id === profileId);
  if (!target) return null;

  const now = new Date().toISOString();
  const next: ProfileStoreState = {
    activeProfileId: profileId,
    profiles: store.profiles.map((p) =>
      p.id === profileId ? { ...p, lastActiveAt: now } : p
    ),
  };
  writeStore(next);
  return target;
}

export function createProfile(rawName: string): PlayerProfile {
  const trimmed = rawName.trim().slice(0, 28) || 'New Player';
  const store = readStore();
  const now = new Date().toISOString();
  const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

  const created: PlayerProfile = {
    id,
    name: trimmed,
    createdAt: now,
    lastActiveAt: now,
  };

  const next: ProfileStoreState = {
    activeProfileId: id,
    profiles: [...store.profiles, created],
  };
  writeStore(next);
  return created;
}

export function renameProfile(profileId: string, rawName: string): boolean {
  const trimmed = rawName.trim().slice(0, 28);
  if (!trimmed) return false;
  const store = readStore();
  if (!store.profiles.some((p) => p.id === profileId)) return false;

  const next: ProfileStoreState = {
    ...store,
    profiles: store.profiles.map((p) =>
      p.id === profileId ? { ...p, name: trimmed } : p
    ),
  };
  writeStore(next);
  return true;
}

export function deleteProfile(profileId: string): boolean {
  const store = readStore();
  if (store.profiles.length <= 1) return false;

  const remaining = store.profiles.filter((p) => p.id !== profileId);
  if (remaining.length === store.profiles.length) return false;

  // Clean up scoped storage keys for removed profile
  if (typeof window !== 'undefined') {
    try {
      (Object.keys(LEGACY_KEYS) as ScopedBucket[]).forEach((bucket) => {
        localStorage.removeItem(scopedStorageKey(bucket, profileId));
      });
    } catch {
      // ignore
    }
  }

  const nextActive =
    store.activeProfileId === profileId ? remaining[0].id : store.activeProfileId;

  writeStore({
    activeProfileId: nextActive,
    profiles: remaining,
  });
  return true;
}
