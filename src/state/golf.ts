/**
 * Rounds, courses and measured shots. Stored on this device only, and read
 * back through sanitisers so an old or corrupt payload degrades gracefully.
 */
import { defaultTee, emptyHole, type Course, type FairwayResult, type HoleScore, type Round, type TeeInfo } from '../core/round';
import { DRILL_IDS, type Attempt, type DrillId, type Outcome, type PracticeSession } from '../core/practice';
import type { ShotRecord } from '../core/shots';
import type { KeyValueStore } from './profile';

// Original storage namespace, kept so existing rounds survive the HitWhat rename.
export const ROUNDS_KEY = 'caddaie.rounds';
export const COURSES_KEY = 'caddaie.courses';
export const SHOTS_KEY = 'caddaie.shots';
export const PRACTICE_KEY = 'caddaie.practice';

export interface GolfData {
  rounds: Round[];
  courses: Course[];
  shots: ShotRecord[];
  /** Logged drill sessions. Absent in data and backups from before drills existed. */
  practice: PracticeSession[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const int = (v: unknown, min: number, max: number) => {
  const n = num(v, min, max);
  return n === null ? null : Math.round(n);
};
const str = (v: unknown, fallback: string, max = 80) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : fallback);
const id = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : null);
const FAIRWAY: readonly FairwayResult[] = ['hit', 'left', 'right', 'short'];

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function sanitizeTee(raw: unknown, holes: 9 | 18 = 18): TeeInfo {
  const d = defaultTee(holes);
  if (!isObj(raw)) return d;
  const par = Array.isArray(raw.par) && (raw.par.length === 9 || raw.par.length === 18) ? raw.par.map((p) => int(p, 3, 6) ?? 4) : d.par;
  const n = par.length;
  const list = (v: unknown, f: (x: unknown) => number | null) => (Array.isArray(v) && v.length === n ? v.map(f) : Array(n).fill(null));
  return {
    name: str(raw.name, d.name, 30),
    rating: num(raw.rating, 20, 90),
    slope: int(raw.slope, 55, 155),
    par,
    yardage: list(raw.yardage, (y) => int(y, 40, 800)),
    strokeIndex: list(raw.strokeIndex, (s) => int(s, 1, 18)),
  };
}

function sanitizeHole(raw: unknown): HoleScore {
  const h = emptyHole();
  if (!isObj(raw)) return h;
  return {
    strokes: int(raw.strokes, 1, 20),
    putts: int(raw.putts, 0, 10),
    fairway: typeof raw.fairway === 'string' && (FAIRWAY as readonly string[]).includes(raw.fairway) ? (raw.fairway as FairwayResult) : null,
    gir: typeof raw.gir === 'boolean' ? raw.gir : null,
    penalties: int(raw.penalties, 0, 10) ?? 0,
    teeClub: typeof raw.teeClub === 'string' ? raw.teeClub.slice(0, 20) : null,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 280) : '',
  };
}

export function sanitizeRound(raw: unknown): Round | null {
  if (!isObj(raw)) return null;
  const rid = id(raw.id);
  const date = num(raw.date, 0, 4102444800000);
  if (!rid || date === null) return null;
  const holeCount: 9 | 18 = raw.holeCount === 9 ? 9 : 18;
  const source = raw.source === 'manual' ? 'manual' : 'app'; // older data stored 'caddaie' here
  const tee = sanitizeTee(raw.tee, holeCount);
  const holes = source === 'manual' ? [] : Array.from({ length: holeCount }, (_, i) => sanitizeHole(Array.isArray(raw.holes) ? raw.holes[i] : null));
  const manualScore = source === 'manual' ? int(raw.manualScore, holeCount === 9 ? 20 : 40, holeCount === 9 ? 120 : 220) : null;
  return {
    id: rid,
    source,
    status: raw.status === 'active' && source === 'app' ? 'active' : 'complete',
    date,
    courseId: id(raw.courseId),
    courseName: str(raw.courseName, 'Golf course', 60),
    tee,
    holeCount,
    startHole: raw.startHole === 9 && holeCount === 9 ? 9 : 0,
    holes,
    manualScore,
    current: Math.min(holeCount - 1, int(raw.current, 0, 17) ?? 0),
  };
}

export function sanitizeCourse(raw: unknown): Course | null {
  if (!isObj(raw)) return null;
  const cid = id(raw.id);
  if (!cid) return null;
  const tees = Array.isArray(raw.tees) ? raw.tees.slice(0, 8).map((t) => sanitizeTee(t)) : [];
  const loc = isObj(raw.location) ? { lat: num(raw.location.lat, -90, 90), lon: num(raw.location.lon, -180, 180) } : null;
  const targets: Course['targets'] = {};
  if (isObj(raw.targets)) {
    for (const [k, v] of Object.entries(raw.targets)) {
      const hole = int(Number(k), 1, 18);
      if (hole === null || !isObj(v)) continue;
      const lat = num(v.lat, -90, 90);
      const lon = num(v.lon, -180, 180);
      if (lat !== null && lon !== null) targets[hole] = { lat, lon };
    }
  }
  return {
    id: cid,
    name: str(raw.name, 'Golf course', 60),
    tees: tees.length ? tees : [defaultTee()],
    osmId: typeof raw.osmId === 'string' ? raw.osmId.slice(0, 30) : null,
    location: loc && loc.lat !== null && loc.lon !== null ? { lat: loc.lat, lon: loc.lon } : null,
    targets,
  };
}

export function sanitizeShot(raw: unknown): ShotRecord | null {
  if (!isObj(raw)) return null;
  const sid = id(raw.id);
  const at = num(raw.at, 0, 4102444800000);
  if (!sid || at === null || typeof raw.clubId !== 'string') return null;
  const from = isObj(raw.from)
    ? { lat: num(raw.from.lat, -90, 90), lon: num(raw.from.lon, -180, 180), accuracy: num(raw.from.accuracy, 0, 10000) ?? 50 }
    : null;
  return {
    id: sid,
    at,
    clubId: raw.clubId.slice(0, 20),
    distance: num(raw.distance, 1, 450),
    source: raw.source === 'gps' || raw.source === 'rangefinder' ? raw.source : 'manual',
    full: raw.full !== false,
    roundId: id(raw.roundId),
    hole: int(raw.hole, 1, 18),
    from: from && from.lat !== null && from.lon !== null ? { lat: from.lat, lon: from.lon, accuracy: from.accuracy } : null,
  };
}

const OUTCOMES: readonly Outcome[] = ['in', 'short', 'long', 'made', 'missed'];

function sanitizeAttempt(raw: unknown): Attempt | null {
  if (!isObj(raw)) return null;
  const target = num(raw.target, 1, 300);
  if (target === null) return null;
  return {
    target,
    clubId: typeof raw.clubId === 'string' ? raw.clubId.slice(0, 20) : null,
    outcome: typeof raw.outcome === 'string' && (OUTCOMES as readonly string[]).includes(raw.outcome) ? (raw.outcome as Outcome) : null,
    carry: num(raw.carry, 1, 450),
  };
}

export function sanitizePractice(raw: unknown): PracticeSession | null {
  if (!isObj(raw)) return null;
  const pid = id(raw.id);
  const at = num(raw.at, 0, 4102444800000);
  const drill = typeof raw.drill === 'string' && (DRILL_IDS as readonly string[]).includes(raw.drill) ? (raw.drill as DrillId) : null;
  if (!pid || at === null || !drill || !Array.isArray(raw.attempts)) return null;
  const attempts = raw.attempts.slice(0, 60).map(sanitizeAttempt).filter((a): a is Attempt => a !== null);
  if (!attempts.length) return null;
  const shotIds = Array.isArray(raw.shotIds) ? raw.shotIds.map(id).filter((x): x is string => x !== null).slice(0, 60) : [];
  return { id: pid, drill, at, attempts, shotIds };
}

const list = <T extends { id: string }>(raw: unknown, f: (x: unknown) => T | null, max: number): T[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of raw.slice(-max)) {
    const v = f(x);
    const key = v?.id;
    if (v && key && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
};

export const sanitizeGolf = (raw: { rounds?: unknown; courses?: unknown; shots?: unknown; practice?: unknown }): GolfData => {
  const rounds = list(raw.rounds, sanitizeRound, 500);
  // Only one round can be in progress.
  let active = false;
  for (const r of [...rounds].sort((a, b) => b.date - a.date)) {
    if (r.status !== 'active') continue;
    if (active) r.status = 'complete';
    active = true;
  }
  return {
    rounds,
    courses: list(raw.courses, sanitizeCourse, 100),
    shots: list(raw.shots, sanitizeShot, 3000),
    practice: list(raw.practice, sanitizePractice, 1000),
  };
};

function read(store: KeyValueStore | null, key: string): unknown {
  if (!store) return undefined;
  try {
    const s = store.getItem(key);
    return s ? JSON.parse(s) : undefined;
  } catch {
    return undefined;
  }
}

export function loadGolf(store: KeyValueStore | null): GolfData {
  return sanitizeGolf({ rounds: read(store, ROUNDS_KEY), courses: read(store, COURSES_KEY), shots: read(store, SHOTS_KEY), practice: read(store, PRACTICE_KEY) });
}

export function saveGolf(data: GolfData, store: KeyValueStore | null): boolean {
  if (!store) return false;
  try {
    store.setItem(ROUNDS_KEY, JSON.stringify(data.rounds));
    store.setItem(COURSES_KEY, JSON.stringify(data.courses));
    store.setItem(SHOTS_KEY, JSON.stringify(data.shots));
    store.setItem(PRACTICE_KEY, JSON.stringify(data.practice));
    return true;
  } catch {
    return false;
  }
}

export const activeRound = (d: GolfData) => d.rounds.find((r) => r.status === 'active') ?? null;
