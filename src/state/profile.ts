/**
 * Persistent golfer profile + last situation. Stored locally only.
 * Everything read from storage is treated as untrusted and sanitised, so a
 * corrupted or old payload degrades to defaults rather than a blank screen.
 */
import { DEFAULT_CLUBS } from '../core/clubs';
import type { Club, ClubType, DistanceTendency, Handedness, Lie, ShotInput, Stance, Trouble } from '../core/types';
import { IMPERIAL, type Units } from '../core/units';

export const PROFILE_VERSION = 1;
// Storage keys keep the app's original 'caddaie.' namespace so data saved
// before the HitWhat rename is still found. Never shown to the golfer.
export const STORAGE_KEY = 'caddaie.profile';
export const SITUATION_KEY = 'caddaie.situation';

export interface Profile {
  version: number;
  clubs: Club[];
  units: Units;
  handedness: Handedness;
  tendency: DistanceTendency;
  baseline: { altitudeFt: number; temperatureF: number };
  theme: 'auto' | 'light' | 'dark';
  /** Let the caddie use the golfer's tracked averages instead of the entered carry, once there's enough data. */
  learnFromShots: boolean;
  /** Official Handicap Index the golfer typed in from their club or association. Never computed. */
  officialIndex: number | null;
  /** Rangefinder flag-sizing calibration (camera vertical field of view, degrees). */
  flagVfov: number | null;
  flagFt: 7 | 8;
  /** Optional notes per club id. */
  clubNotes: Record<string, string>;
  onboarded: boolean;
  /** When the golfer last saved a backup file (or restored one). Null if never. */
  lastBackupAt: number | null;
  /** "Later" on the backup reminder hides it until this time. */
  backupSnoozeUntil: number | null;
  /** Keep the screen on while a round is in progress. */
  keepAwake: boolean;
}

export const defaultProfile = (): Profile => ({
  version: PROFILE_VERSION,
  clubs: DEFAULT_CLUBS.map((c) => ({ ...c })),
  units: { ...IMPERIAL },
  handedness: 'right',
  tendency: 'neutral',
  baseline: { altitudeFt: 0, temperatureF: 70 },
  theme: 'auto',
  learnFromShots: true,
  officialIndex: null,
  flagVfov: null,
  flagFt: 7,
  clubNotes: {},
  onboarded: false,
  lastBackupAt: null,
  backupSnoozeUntil: null,
  keepAwake: true,
});

export const defaultSituation = (): ShotInput => ({
  distance: null,
  wind: { speedMph: 0, fromDeg: 0 },
  elevationFt: 0,
  lie: 'fairway',
  stance: 'flat',
  trouble: [],
  temperatureF: null,
  altitudeFt: null,
});

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
const maybeNum = (v: unknown, min: number, max: number) => {
  const n = num(v, NaN, min, max);
  return Number.isNaN(n) ? null : n;
};
const str = (v: unknown, fallback: string, max = 200) => (typeof v === 'string' ? v.slice(0, max) : fallback);

const CLUB_TYPES: readonly ClubType[] = ['driver', 'wood', 'hybrid', 'iron', 'wedge'];
const LIES: readonly Lie[] = ['tee', 'fairway', 'first-cut', 'rough', 'deep-rough', 'bunker', 'hardpan'];
const STANCES: readonly Stance[] = ['flat', 'ball-above', 'ball-below', 'uphill', 'downhill'];
const TROUBLE: readonly Trouble[] = ['short', 'long', 'left', 'right'];

function sanitizeClubs(raw: unknown): Club[] {
  if (!Array.isArray(raw)) return defaultProfile().clubs;
  const seen = new Set<string>();
  const clubs: Club[] = [];
  for (const c of raw.slice(0, 30)) {
    if (!isObj(c) || typeof c.id !== 'string' || seen.has(c.id)) continue;
    seen.add(c.id);
    clubs.push({
      id: c.id.slice(0, 20),
      name: str(c.name, c.id, 30),
      short: str(c.short, c.id, 4),
      type: oneOf(c.type, CLUB_TYPES, 'iron'),
      carry: num(c.carry, 0, 0, 400),
      inBag: c.inBag !== false,
    });
  }
  return clubs.length ? clubs : defaultProfile().clubs;
}

export function sanitizeProfile(raw: unknown): Profile {
  const d = defaultProfile();
  if (!isObj(raw)) return d;
  const units = isObj(raw.units) ? raw.units : {};
  const baseline = isObj(raw.baseline) ? raw.baseline : {};
  return {
    version: PROFILE_VERSION,
    clubs: sanitizeClubs(raw.clubs),
    units: {
      distance: oneOf(units.distance, ['yd', 'm'] as const, d.units.distance),
      wind: oneOf(units.wind, ['mph', 'kmh'] as const, d.units.wind),
      temperature: oneOf(units.temperature, ['F', 'C'] as const, d.units.temperature),
      height: oneOf(units.height, ['ft', 'm'] as const, d.units.height),
    },
    handedness: oneOf(raw.handedness, ['right', 'left'] as const, d.handedness),
    tendency: oneOf(raw.tendency, ['short', 'neutral', 'long'] as const, d.tendency),
    baseline: {
      altitudeFt: num(baseline.altitudeFt, d.baseline.altitudeFt, -1500, 14000),
      temperatureF: num(baseline.temperatureF, d.baseline.temperatureF, -10, 125),
    },
    theme: oneOf(raw.theme, ['auto', 'light', 'dark'] as const, d.theme),
    learnFromShots: raw.learnFromShots !== false,
    officialIndex: maybeNum(raw.officialIndex, -10, 54),
    flagVfov: maybeNum(raw.flagVfov, 20, 120),
    flagFt: raw.flagFt === 8 ? 8 : 7,
    clubNotes: sanitizeNotes(raw.clubNotes),
    onboarded: raw.onboarded === true,
    lastBackupAt: maybeNum(raw.lastBackupAt, 0, 4102444800000),
    backupSnoozeUntil: maybeNum(raw.backupSnoozeUntil, 0, 4102444800000),
    keepAwake: raw.keepAwake !== false,
  };
}

function sanitizeNotes(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, 30)) if (typeof v === 'string' && v.trim()) out[k.slice(0, 20)] = v.slice(0, 140);
  return out;
}

export function sanitizeSituation(raw: unknown): ShotInput {
  const d = defaultSituation();
  if (!isObj(raw)) return d;
  const wind = isObj(raw.wind) ? raw.wind : {};
  const distance = raw.distance === null ? null : num(raw.distance, NaN, 1, 700);
  const tempF = raw.temperatureF === null ? null : num(raw.temperatureF, NaN, -10, 125);
  const alt = raw.altitudeFt === null ? null : num(raw.altitudeFt, NaN, -1500, 14000);
  return {
    distance: Number.isNaN(distance) ? null : distance,
    wind: { speedMph: num(wind.speedMph, 0, 0, 50), fromDeg: num(wind.fromDeg, 0, -720, 720) },
    elevationFt: num(raw.elevationFt, 0, -300, 300),
    lie: oneOf(raw.lie, LIES, d.lie),
    stance: oneOf(raw.stance, STANCES, d.stance),
    trouble: Array.isArray(raw.trouble)
      ? [...new Set(raw.trouble.filter((t): t is Trouble => (TROUBLE as readonly unknown[]).includes(t)))]
      : [],
    temperatureF: Number.isNaN(tempF as number) ? null : tempF,
    altitudeFt: Number.isNaN(alt as number) ? null : alt,
  };
}

/** Minimal storage surface so tests can inject a fake and private-mode Safari can't crash us. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function safeStorage(): KeyValueStore | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__hitwhat_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function readJson(store: KeyValueStore | null, key: string): unknown {
  if (!store) return undefined;
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

/** Returns false if the write failed (quota, private mode) so the UI can say so once. */
function writeJson(store: KeyValueStore | null, key: string, value: unknown): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadProfile = (store = safeStorage()) => sanitizeProfile(readJson(store, STORAGE_KEY));
export const saveProfile = (p: Profile, store = safeStorage()) => writeJson(store, STORAGE_KEY, p);
export const loadSituation = (store = safeStorage()) => sanitizeSituation(readJson(store, SITUATION_KEY));
export const saveSituation = (s: ShotInput, store = safeStorage()) => writeJson(store, SITUATION_KEY, s);
