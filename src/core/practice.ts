/**
 * Short-game practice: four drills, how each is scored, which ones the
 * golfer's own data points to, and how sessions compare over time.
 *
 * Pure and deterministic. Putting distances are feet, wedge distances yards.
 * A drill is only called "recommended" when stored rounds or club data show
 * the weakness it trains; everything else is offered as a starter drill.
 */
import type { LadderRow } from './gapping';
import { MIN_SHOTS_TO_LEARN } from './shots';
import { benchmarkFor, insights, playerStats, type PlayerStats } from './stats';
import type { Round } from './round';

export type DrillId = 'lag-putting' | 'short-putts' | 'wedge-calibration' | 'wedge-ladder';
export const DRILL_IDS: readonly DrillId[] = ['lag-putting', 'short-putts', 'wedge-calibration', 'wedge-ladder'];

/** How a single attempt finished. */
export type Outcome = 'in' | 'short' | 'long' | 'made' | 'missed';

export interface Attempt {
  /** Target distance: feet for putting drills, yards for wedge drills. */
  target: number;
  /** Club for wedge drills. */
  clubId: string | null;
  /** Result for scored drills. */
  outcome: Outcome | null;
  /** Measured carry in yards (wedge calibration). */
  carry: number | null;
}

export interface PracticeSession {
  id: string;
  drill: DrillId;
  /** Epoch ms when the session was saved. */
  at: number;
  attempts: Attempt[];
  /** Shot records this session added to the golfer's club data (wedge calibration). */
  shotIds: string[];
}

export type DrillKind = 'putting' | 'wedges';
/** How attempts are recorded. */
export type DrillInput = 'in-short-long' | 'made-missed' | 'carry';

export interface Drill {
  id: DrillId;
  kind: DrillKind;
  name: string;
  objective: string;
  setup: string[];
  input: DrillInput;
  /** What counts as success, shown with the score. */
  success: string;
}

export const DRILLS: Record<DrillId, Drill> = {
  'lag-putting': {
    id: 'lag-putting',
    kind: 'putting',
    name: 'Lag putting',
    objective: 'Stop long putts close enough that the next one is a tap-in.',
    setup: ['Pick one hole on the practice green.', 'Pace off 20, 30 and 40 feet (about 7, 10 and 13 steps).', 'Hit three balls from each mark, shortest first.'],
    input: 'in-short-long',
    success: 'Holed or finished within 3 ft',
  },
  'short-putts': {
    id: 'short-putts',
    kind: 'putting',
    name: 'Short-putt circle',
    objective: 'Hole the 3- to 5-footers that turn pars into bogeys.',
    setup: ['Place four balls around one hole at 3 ft (one putter length).', 'Then four at 4 ft, then four at 5 ft.', 'Go round the hole so every putt has a different break.'],
    input: 'made-missed',
    success: 'Holed',
  },
  'wedge-calibration': {
    id: 'wedge-calibration',
    kind: 'wedges',
    name: 'Wedge carry check',
    objective: 'Measure the full-swing carry of every wedge, so the caddie uses your real numbers.',
    setup: ['You need a launch monitor or range flags with known yardages.', 'Hit five full, stock swings with each wedge.', 'Log each carry. Mark a mishit and hit another; mishits never count.'],
    input: 'carry',
    success: 'Spread of your carries (smaller is more consistent)',
  },
  'wedge-ladder': {
    id: 'wedge-ladder',
    kind: 'wedges',
    name: 'Wedge ladder',
    objective: 'Control the in-between distances where most scoring shots come from.',
    setup: ['Use range flags or a launch monitor.', 'Work up the ladder: two balls at each target, any wedge you like.', 'Call each one: on target (within 5 yds), short or long.'],
    input: 'in-short-long',
    success: 'Within 5 yds of the target',
  },
};

/** Putts within this many feet of the hole count as a successful lag. */
export const LAG_CIRCLE_FT = 3;
/** Wedge ladder tolerance in yards. */
export const LADDER_TOLERANCE_YDS = 5;
const CALIBRATION_SHOTS = 5;

/**
 * The attempts for a new session. Wedge drills are built from the golfer's
 * wedges and their numbers; with no wedges in the bag they have no attempts.
 */
export function planAttempts(drill: DrillId, wedges: readonly { id: string; carry: number }[] = []): Attempt[] {
  const a = (target: number, clubId: string | null = null): Attempt => ({ target, clubId, outcome: null, carry: null });
  switch (drill) {
    case 'lag-putting':
      return [20, 20, 20, 30, 30, 30, 40, 40, 40].map((t) => a(t));
    case 'short-putts':
      return [3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5].map((t) => a(t));
    case 'wedge-calibration':
      return [...wedges].sort((x, y) => y.carry - x.carry).flatMap((w) => Array.from({ length: CALIBRATION_SHOTS }, () => a(Math.round(w.carry), w.id)));
    case 'wedge-ladder': {
      const longest = Math.max(0, ...wedges.map((w) => w.carry));
      if (longest < 40) return [];
      // 30 yds up to the longest full wedge, in steps of 10, at most seven rungs.
      const top = Math.floor(longest / 10) * 10;
      const rungs: number[] = [];
      for (let t = 30; t <= top && rungs.length < 7; t += 10) rungs.push(t);
      return rungs.flatMap((t) => [a(t), a(t)]);
    }
  }
}

const isSuccess = (o: Outcome | null) => o === 'in' || o === 'made';

export interface SessionResult {
  /** Attempts with a result. */
  done: number;
  total: number;
  /** Scored drills: successes and their share. */
  successes: number;
  pct: number | null;
  /** In/short/long drills: how the misses fell. */
  short: number;
  long: number;
  /** Per-target success counts, in target order. */
  byTarget: { target: number; successes: number; attempts: number }[];
  /** Wedge calibration: per club average carry and spread (yards). */
  clubs: { clubId: string; average: number; spread: number; count: number }[];
  /** Wedge calibration: mean spread across clubs (yards); smaller is better. */
  meanSpread: number | null;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => (xs.length < 2 ? 0 : Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1)));

export function sessionResult(drill: DrillId, attempts: readonly Attempt[]): SessionResult {
  const done = attempts.filter((x) => (DRILLS[drill].input === 'carry' ? x.carry !== null : x.outcome !== null));
  const successes = done.filter((x) => isSuccess(x.outcome)).length;
  const targets: SessionResult['byTarget'] = [];
  for (const x of done) {
    let t = targets.find((b) => b.target === x.target);
    if (!t) targets.push((t = { target: x.target, successes: 0, attempts: 0 }));
    t.attempts++;
    if (isSuccess(x.outcome)) t.successes++;
  }
  const clubs: SessionResult['clubs'] = [];
  if (DRILLS[drill].input === 'carry') {
    const ids = [...new Set(done.map((x) => x.clubId).filter((c): c is string => c !== null))];
    for (const clubId of ids) {
      const carries = done.filter((x) => x.clubId === clubId).map((x) => x.carry!);
      clubs.push({ clubId, average: mean(carries), spread: sd(carries), count: carries.length });
    }
  }
  const spreads = clubs.filter((c) => c.count >= 2).map((c) => c.spread);
  return {
    done: done.length,
    total: attempts.length,
    successes,
    pct: DRILLS[drill].input === 'carry' || !done.length ? null : (successes / done.length) * 100,
    short: done.filter((x) => x.outcome === 'short').length,
    long: done.filter((x) => x.outcome === 'long').length,
    byTarget: targets,
    clubs,
    meanSpread: spreads.length ? mean(spreads) : null,
  };
}

/** A session's headline number for comparisons: success %, or mean spread for calibration. */
export function sessionScore(s: PracticeSession): number | null {
  const r = sessionResult(s.drill, s.attempts);
  return DRILLS[s.drill].input === 'carry' ? r.meanSpread : r.pct;
}

/** Lower is better only for calibration (spread). */
export const lowerIsBetter = (drill: DrillId) => DRILLS[drill].input === 'carry';

export type Direction = 'better' | 'worse' | 'same';

export interface DrillProgress {
  sessions: PracticeSession[];
  latest: number | null;
  /** Average of up to three sessions before the latest. */
  before: number | null;
  priorCount: number;
  best: number | null;
  direction: Direction | null;
}

/**
 * Change needed before calling a session better or worse. A 9–12 attempt
 * session moves ~10 points on one putt, so smaller swings are noise.
 */
export const MEANINGFUL = { pct: 15, spreadYds: 1.5 } as const;

export function drillProgress(all: readonly PracticeSession[], drill: DrillId): DrillProgress {
  const sessions = all.filter((s) => s.drill === drill && sessionScore(s) !== null).sort((a, b) => a.at - b.at);
  const scores = sessions.map((s) => sessionScore(s)!);
  const latest = scores.at(-1) ?? null;
  const prior = scores.slice(-4, -1);
  const before = prior.length ? mean(prior) : null;
  const low = lowerIsBetter(drill);
  const best = scores.length ? (low ? Math.min(...scores) : Math.max(...scores)) : null;
  let direction: Direction | null = null;
  if (latest !== null && before !== null) {
    const diff = low ? before - latest : latest - before;
    const need = low ? MEANINGFUL.spreadYds : MEANINGFUL.pct;
    direction = diff >= need ? 'better' : diff <= -need ? 'worse' : 'same';
  }
  return { sessions, latest, before, priorCount: prior.length, best, direction };
}

export type DrillStatus = 'recommended' | 'starter' | 'unavailable';

export interface DrillAdvice {
  drill: DrillId;
  status: DrillStatus;
  /** For recommended drills: the data behind it. For others: why it isn't personalised. */
  reason: string;
}

/** Rounds with putts recorded needed before putting advice is personal. */
export const MIN_PUTTING_ROUNDS = 3;

export interface AdviceInput {
  rounds: Round[];
  /** The distance ladder (clubs in the bag). */
  ladder: readonly LadderRow[];
  /** Wedge name lookup for text. */
  label: (clubId: string) => string;
  /** Formats yards in the golfer's units, e.g. "24 yds". */
  dist: (yards: number) => string;
}

function puttingRounds(rounds: Round[]): number {
  return rounds.filter((r) => r.status === 'complete' && r.source === 'app' && r.holes.some((h) => h.strokes !== null && h.putts !== null)).length;
}

/** Which drills the golfer's data points to, recommended first. */
export function drillAdvice({ rounds, ladder, label, dist }: AdviceInput): DrillAdvice[] {
  const s = playerStats(rounds);
  const n = puttingRounds(rounds);
  const out: DrillAdvice[] = [];

  // Putting.
  if (n >= MIN_PUTTING_ROUNDS && s.scoringAvg !== null && s.puttsPerRound !== null && s.threePuttsPerRound !== null) {
    const b = benchmarkFor(s.scoringAvg);
    const from = `from ${n} rounds`;
    const lagNeeded = s.threePuttsPerRound >= Math.max(1, b.threePutts);
    const shortNeeded = !lagNeeded && s.puttsPerRound >= b.putts + 1;
    out.push(
      lagNeeded
        ? { drill: 'lag-putting', status: 'recommended', reason: `${s.threePuttsPerRound.toFixed(1)} three-putts per round ${from}. Golfers who shoot around ${Math.round(s.scoringAvg)} average about ${b.threePutts.toFixed(1)}.` }
        : { drill: 'lag-putting', status: 'starter', reason: `Your three-putts (${s.threePuttsPerRound.toFixed(1)} per round) are in line for your scores. Good as a warm-up.` },
      shortNeeded
        ? {
            drill: 'short-putts',
            status: 'recommended',
            reason: `${s.puttsPerRound.toFixed(1)} putts per round ${from}, about ${(s.puttsPerRound - b.putts).toFixed(1)} more than typical, without many three-putts. That usually means short putts are slipping by.`,
          }
        : { drill: 'short-putts', status: 'starter', reason: `Your putts per round (${s.puttsPerRound.toFixed(1)}) are in line for your scores. Good as a warm-up.` },
    );
  } else {
    const why =
      n === 0
        ? 'Not based on your data yet. Record putts on each hole and HitWhat can tell which putting drill you need.'
        : `Not based on your data yet: ${n} of ${MIN_PUTTING_ROUNDS} rounds with putts recorded.`;
    out.push({ drill: 'lag-putting', status: 'starter', reason: why }, { drill: 'short-putts', status: 'starter', reason: why });
  }

  // Wedges.
  const wedges = ladder.filter((r) => r.club.type === 'wedge');
  if (!wedges.length) {
    const why = 'Add a wedge to your bag in Settings to use this drill.';
    out.push({ drill: 'wedge-calibration', status: 'unavailable', reason: why }, { drill: 'wedge-ladder', status: 'unavailable', reason: why });
  } else {
    const unmeasured = wedges.filter((r) => (r.stat?.count ?? 0) < MIN_SHOTS_TO_LEARN);
    out.push(
      unmeasured.length
        ? {
            drill: 'wedge-calibration',
            status: 'recommended',
            reason: `Your ${listText(unmeasured.map((r) => label(r.club.id)))} ${unmeasured.length === 1 ? 'number is' : 'numbers are'} typed, not measured (fewer than ${MIN_SHOTS_TO_LEARN} logged full shots).`,
          }
        : { drill: 'wedge-calibration', status: 'starter', reason: 'All your wedges are measured. Re-check them every few weeks.' },
    );
    // The ladder trains the in-between yardages: point to it when wedge gaps or approach play show the need.
    const wedgeGap = ladder.find((r, i) => r.gapFlag === 'wide' && (r.club.type === 'wedge' || ladder[i + 1]?.club.type === 'wedge'));
    const approach = insights(rounds).areas.find((a) => a.area === 'approach');
    const greens = approachReason(s, approach?.verdict === 'watch');
    out.push(
      wedgeGap && wedgeGap.gapToNext !== null
        ? { drill: 'wedge-ladder', status: 'recommended', reason: `There's a ${dist(wedgeGap.gapToNext)} gap below your ${label(wedgeGap.club.id)} with no full swing for it.` }
        : greens
          ? { drill: 'wedge-ladder', status: 'recommended', reason: greens }
          : { drill: 'wedge-ladder', status: 'starter', reason: 'Not based on your data: a good all-round wedge drill.' },
    );
  }

  const rank: Record<DrillStatus, number> = { recommended: 0, starter: 1, unavailable: 2 };
  return out.map((x, i) => ({ x, i })).sort((a, b) => rank[a.x.status] - rank[b.x.status] || a.i - b.i).map(({ x }) => x);
}

function approachReason(s: PlayerStats, watch: boolean): string | null {
  if (!watch || s.girPerRound === null || s.scoringAvg === null) return null;
  const typical = (benchmarkFor(s.scoringAvg).girPct / 100) * 18;
  return `${s.girPerRound.toFixed(1)} greens per round from your rounds; golfers at your level average about ${typical.toFixed(1)}. Closer wedges are the quickest way to more.`;
}

export interface CourseLink {
  metric: string;
  before: number;
  after: number;
  roundsBefore: number;
  roundsAfter: number;
  /** True when the on-course number moved the right way. */
  improved: boolean;
}

/** Rounds needed on each side of the first session before comparing on-course numbers. */
export const MIN_LINK_ROUNDS = 3;

/**
 * On-course numbers before vs after the golfer started a drill. Returned only
 * with enough rounds on both sides; it shows a change, not a cause.
 */
export function courseLink(drill: DrillId, sessions: readonly PracticeSession[], rounds: Round[]): CourseLink | null {
  const mine = sessions.filter((s) => s.drill === drill);
  if (!mine.length) return null;
  const start = Math.min(...mine.map((s) => s.at));
  const done = rounds.filter((r) => r.status === 'complete' && r.source === 'app');
  const before = done.filter((r) => r.date < start);
  const after = done.filter((r) => r.date >= start);
  if (before.length < MIN_LINK_ROUNDS || after.length < MIN_LINK_ROUNDS) return null;
  const sb = playerStats(before);
  const sa = playerStats(after);
  const pick: Record<DrillId, { metric: string; get: (s: PlayerStats) => number | null; higherBetter: boolean }> = {
    'lag-putting': { metric: 'Three-putts per round', get: (s) => s.threePuttsPerRound, higherBetter: false },
    'short-putts': { metric: 'Putts per round', get: (s) => s.puttsPerRound, higherBetter: false },
    'wedge-calibration': { metric: 'Greens per round', get: (s) => s.girPerRound, higherBetter: true },
    'wedge-ladder': { metric: 'Greens per round', get: (s) => s.girPerRound, higherBetter: true },
  };
  const p = pick[drill];
  const b = p.get(sb);
  const a = p.get(sa);
  if (b === null || a === null) return null;
  return { metric: p.metric, before: b, after: a, roundsBefore: before.length, roundsAfter: after.length, improved: p.higherBetter ? a > b : a < b };
}

function listText(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
