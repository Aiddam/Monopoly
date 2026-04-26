export const DEFAULT_PLAYER_NAME = 'Гравець';

const PLAYER_NAME_COOKIE = 'ukraine-monopoly-player-name';
const PLAYER_NAME_STORAGE_KEY = 'ukraine-monopoly-player-name-v1';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const normalizePlayerName = (name: string | undefined): string => {
  const trimmed = name?.trim();
  return trimmed || DEFAULT_PLAYER_NAME;
};

export const readSavedPlayerName = (fallback = DEFAULT_PLAYER_NAME): string => {
  const fromCookie = readPlayerNameCookie();
  if (fromCookie) return fromCookie;

  const fromStorage = readPlayerNameStorage();
  if (fromStorage) return fromStorage;

  return normalizePlayerName(fallback);
};

export const savePlayerName = (name: string | undefined) => {
  const normalized = normalizePlayerName(name);
  writePlayerNameCookie(normalized);
  writePlayerNameStorage(normalized);
};

const readPlayerNameCookie = (): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const cookie = document.cookie
    .split('; ')
    .find((candidate) => candidate.startsWith(`${PLAYER_NAME_COOKIE}=`));
  if (!cookie) return undefined;

  try {
    return normalizePlayerName(decodeURIComponent(cookie.slice(PLAYER_NAME_COOKIE.length + 1)));
  } catch {
    return undefined;
  }
};

const writePlayerNameCookie = (name: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${PLAYER_NAME_COOKIE}=${encodeURIComponent(name)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
};

const readPlayerNameStorage = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    return value ? normalizePlayerName(value) : undefined;
  } catch {
    return undefined;
  }
};

const writePlayerNameStorage = (name: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
  } catch {
    // The cookie is the primary storage; localStorage is only a fallback.
  }
};
