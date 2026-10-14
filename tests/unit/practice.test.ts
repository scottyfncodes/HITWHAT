import { describe, expect, it } from 'vitest';
import { DEFAULT_CLUBS } from '../../src/core/clubs';
import { distanceLadder } from '../../src/core/gapping';
import {
  courseLink,
  drillAdvice,
  drillProgress,
  planAttempts,
  sessionResult,
  sessionScore,
  type Attempt,
  type DrillId,
  type Outcome,
  type PracticeSession,
} from '../../src/core/practice';
import { clubStats, effectiveClubs, learnedClubIds, type ShotRecord } from '../../src/core/shots';
import type { Club } from '../../src/core/types';
import { buildBackup, parseBackup } from '../../src/state/backup';
import { loadGolf, PRACTICE_KEY, sanitizeGolf, saveGolf } from '../../src/state/golf';
import { defaultProfile } from '../../src/state/profile';
import { played } from './rounds';

let n = 0;
const session = (drill: DrillId, outcomes: (Outcome | number)[], at = ++n): PracticeSession => {
  const plan = planAttempts(drill, wedges());
  return {
    id: `p${++n}`,
    drill,
    at,
    shotIds: [],
    attempts: outcomes.map((o, i): Attempt => (typeof o === 'number' ? { ...plan[i], carry: o } : { ...plan[i], outcome: o })),
  };
};
const wedges = () => DEFAULT_CLUBS.filter((c) => c.type === 'wedge' && c.inBag);
const label = (id: string) => DEFAULT_CLUBS.find((c) => c.id === id)?.name ?? id;
const dist = (y: number) => `${Math.round(y)} yds`;

function ladder(bag: Club[] = DEFAULT_CLUBS.map((c) => ({ ...c })), shots: ShotRecord[] = []) {
  const st = clubStats(shots);
  return distanceLadder(bag, effectiveClubs(bag, st, true), st, learnedClubIds(bag, st, true));
}
let s = 0;
const shotsFor = (clubId: string, ds: number[]): ShotRecord[] =>
  ds.map((distance) => ({ id: `w${++s}`, at: s, clubId, distance, source: 'manual', full: true, roundId: null, hole: null, from: null }));
const measuredWedges = () => ['pw', 'gw', 'sw', 'lw'].flatMap((id) => shotsFor(id, Array(5).fill(DEFAULT_CLUBS.find((c) => c.id === id)!.carry)));

/** A round where each hole has `putts` putts and `threePutts` of them are three-putts. */
const puttRound = (putts: number, threePutts: number, date = ++n) =>
  played(Array(18).fill(1), { date }, (i) => ({ putts: i < threePutts ? 3 : putts }));

describe('drill plans', () => {
  it('lays out a fixed, defined number of attempts', () => {
    expect(planAttempts('lag-putting').map((a) => a.target)).toEqual([20, 20, 20, 30, 30, 30, 40, 40, 40]);
    expect(planAttempts('short-putts')).toHaveLength(12);
  });

  it('builds wedge drills from the golfer’s own wedges', () => {
    const cal = planAttempts('wedge-calibration', wedges());
    expect(cal).toHaveLength(20);
    expect(cal.slice(0, 5).every((a) => a.clubId === 'pw' && a.target === 118)).toBe(true);
    const ladderTargets = [...new Set(planAttempts('wedge-ladder', wedges()).map((a) => a.target))];
    expect(ladderTargets).toEqual([30, 40, 50, 60, 70, 80, 90]);
    expect(planAttempts('wedge-ladder', [])).toEqual([]);
    expect(planAttempts('wedge-calibration', [])).toEqual([]);
  });
});

describe('session results', () => {
  it('scores in / short / long drills and breaks results down by distance', () => {
    const r = sessionResult('lag-putting', session('lag-putting', ['in', 'in', 'short', 'in', 'long', 'short', 'in', 'short', 'in']).attempts);
    expect(r).toMatchObject({ done: 9, total: 9, successes: 5, short: 3, long: 1 });
    expect(r.pct).toBeCloseTo(55.6, 1);
    expect(r.byTarget).toEqual([
      { target: 20, successes: 2, attempts: 3 },
      { target: 30, successes: 1, attempts: 3 },
      { target: 40, successes: 2, attempts: 3 },
    ]);
  });

  it('counts only attempts that have a result', () => {
    const r = sessionResult('short-putts', session('short-putts', ['made', 'missed']).attempts.concat(planAttempts('short-putts').slice(2)));
    expect(r).toMatchObject({ done: 2, total: 12, successes: 1, pct: 50 });
  });

  it('wedge calibration reports per-club averages and spread instead of a percentage', () => {
    const r = sessionResult('wedge-calibration', session('wedge-calibration', [118, 120, 116, 118, 118, 104, 106, 105, 104, 106]).attempts);
    expect(r.pct).toBeNull();
    expect(r.clubs.map((c) => [c.clubId, Math.round(c.average), c.count])).toEqual([
      ['pw', 118, 5],
      ['gw', 105, 5],
    ]);
    expect(r.meanSpread).toBeGreaterThan(0.8);
    expect(r.meanSpread).toBeLessThan(1.5);
  });
});

describe('progress across sessions', () => {
  it('needs two sessions before comparing', () => {
    const p = drillProgress([session('short-putts', Array(12).fill('made'))], 'short-putts');
    expect(p).toMatchObject({ latest: 100, before: null, direction: null, priorCount: 0 });
  });

  it('compares the latest with the average of up to three before it', () => {
    const mk = (made: number) => session('short-putts', [...Array(made).fill('made'), ...Array(12 - made).fill('missed')]);
    const all = [mk(3), mk(6), mk(6), mk(6), mk(10)];
    const p = drillProgress(all, 'short-putts');
    expect(p.before).toBe(50);
    expect(p.latest).toBeCloseTo(83.3, 1);
    expect(p.priorCount).toBe(3);
    expect(p.direction).toBe('better');
    expect(p.best).toBeCloseTo(83.3, 1);
  });

  it('calls a one-putt swing "about the same", not progress', () => {
    const all = [session('lag-putting', ['in', 'in', 'in', 'in', 'short', 'short', 'short', 'short', 'short']), session('lag-putting', ['in', 'in', 'in', 'in', 'in', 'short', 'short', 'short', 'short'])];
    expect(drillProgress(all, 'lag-putting').direction).toBe('same');
  });

  it('treats a smaller spread as better for wedge calibration', () => {
    const wide = session('wedge-calibration', [110, 126, 112, 124, 118]);
    const tight = session('wedge-calibration', [117, 119, 118, 118, 118]);
    const p = drillProgress([wide, tight], 'wedge-calibration');
    expect(p.direction).toBe('better');
    expect(p.best).toBe(sessionScore(tight));
  });

  it('ignores other drills and sessions without a score', () => {
    const empty: PracticeSession = { id: 'e', drill: 'lag-putting', at: 1, attempts: planAttempts('lag-putting'), shotIds: [] };
    expect(drillProgress([empty, session('short-putts', ['made'])], 'lag-putting').sessions).toEqual([]);
  });
});

describe('drill advice', () => {
  const advice = (rounds = [] as ReturnType<typeof played>[], l = ladder()) => drillAdvice({ rounds, ladder: l, label, dist });

  it('offers starter drills, clearly unpersonalised, when there is no data', () => {
    const a = advice();
    const putting = a.filter((x) => x.drill === 'lag-putting' || x.drill === 'short-putts');
    expect(putting.every((x) => x.status === 'starter' && x.reason.startsWith('Not based on your data yet'))).toBe(true);
    // Unmeasured wedges are a fact about the data, so calibration is recommended.
    expect(a[0]).toMatchObject({ drill: 'wedge-calibration', status: 'recommended' });
    expect(a[0].reason).toContain('Pitching Wedge, Gap Wedge, Sand Wedge and Lob Wedge numbers are typed');
    expect(a.find((x) => x.drill === 'wedge-ladder')!.status).toBe('starter');
  });

  it('says how many putting rounds are still needed', () => {
    const a = advice([puttRound(2, 3), puttRound(2, 3)]);
    expect(a.find((x) => x.drill === 'lag-putting')!.reason).toContain('2 of 3 rounds with putts recorded');
  });

  it('recommends lag putting when three-putts run above typical, with the numbers', () => {
    const a = advice([puttRound(2, 4), puttRound(2, 3), puttRound(2, 4)], ladder(undefined, measuredWedges()));
    expect(a[0]).toMatchObject({ drill: 'lag-putting', status: 'recommended' });
    expect(a[0].reason).toMatch(/^3\.7 three-putts per round from 3 rounds\. Golfers who shoot around 90 average about 2\.4\.$/);
    expect(a.find((x) => x.drill === 'short-putts')!.status).toBe('starter');
  });

  it('recommends the short-putt circle when putts are high without three-putts', () => {
    // 2 putts everywhere and no one-putts: 36 putts, zero three-putts.
    const a = advice([puttRound(2, 0), puttRound(2, 0), puttRound(2, 0)], ladder(undefined, measuredWedges()));
    expect(a[0]).toMatchObject({ drill: 'short-putts', status: 'recommended' });
    expect(a[0].reason).toContain('36.0 putts per round from 3 rounds');
    expect(a.find((x) => x.drill === 'lag-putting')!.status).toBe('starter');
  });

  it('points to the wedge ladder for a wide wedge gap', () => {
    const bag = DEFAULT_CLUBS.map((c) => (c.id === 'gw' ? { ...c, inBag: false } : { ...c }));
    const l = ladder(bag, ['pw', 'sw', 'lw'].flatMap((id) => shotsFor(id, Array(5).fill(DEFAULT_CLUBS.find((c) => c.id === id)!.carry))));
    const a = advice([], l);
    expect(a.find((x) => x.drill === 'wedge-ladder')).toMatchObject({ status: 'recommended', reason: 'There\'s a 28 yds gap below your Pitching Wedge with no full swing for it.' });
    expect(a.find((x) => x.drill === 'wedge-calibration')!.status).toBe('starter');
  });

  it('makes wedge drills unavailable without wedges', () => {
    const a = advice([], ladder(DEFAULT_CLUBS.map((c) => (c.type === 'wedge' ? { ...c, inBag: false } : { ...c }))));
    expect(a.slice(-2).map((x) => x.status)).toEqual(['unavailable', 'unavailable']);
  });
});

describe('practice and the course', () => {
  it('compares rounds before and after only with enough of both', () => {
    const lag = [session('lag-putting', Array(9).fill('in'), 100)];
    const before = [puttRound(2, 4, 10), puttRound(2, 4, 20), puttRound(2, 4, 30)];
    const after = [puttRound(2, 1, 110), puttRound(2, 1, 120)];
    expect(courseLink('lag-putting', lag, [...before, ...after])).toBeNull();
    const link = courseLink('lag-putting', lag, [...before, ...after, puttRound(2, 1, 130)])!;
    expect(link).toMatchObject({ metric: 'Three-putts per round', before: 4, after: 1, roundsBefore: 3, roundsAfter: 3, improved: true });
    expect(courseLink('short-putts', lag, [...before, ...after])).toBeNull();
  });
});

describe('practice storage and backup', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  it('saves and loads sessions next to rounds and shots', () => {
    const st = memory();
    const p = session('lag-putting', Array(9).fill('in'));
    expect(saveGolf({ rounds: [played(1)], courses: [], shots: [], practice: [p] }, st)).toBe(true);
    const back = loadGolf(st);
    expect(back.practice).toEqual([p]);
    expect(back.rounds).toHaveLength(1);
  });

  it('drops corrupt sessions and bad attempts without touching other data', () => {
    const st = memory();
    st.setItem(PRACTICE_KEY, JSON.stringify([{ id: 'x', drill: 'juggling', at: 1, attempts: [{ target: 3 }] }, { id: 'ok', drill: 'short-putts', at: 2, attempts: [{ target: 3, outcome: 'made' }, { target: 'far' }, { target: 4, outcome: 'nope' }], shotIds: ['a', '../bad'] }, 'junk']));
    const g = loadGolf(st);
    expect(g.practice).toEqual([
      {
        id: 'ok',
        drill: 'short-putts',
        at: 2,
        attempts: [
          { target: 3, clubId: null, outcome: 'made', carry: null },
          { target: 4, clubId: null, outcome: null, carry: null },
        ],
        shotIds: ['a'],
      },
    ]);
  });

  it('round-trips practice through a backup, and restores older backups without it', () => {
    const p = session('wedge-calibration', [118, 119, 117, 118, 118]);
    const r = parseBackup(JSON.stringify(buildBackup(defaultProfile(), { rounds: [], courses: [], shots: [], practice: [p] }, [], 5)));
    expect(r.ok && r.golf.practice).toEqual([p]);
    const old = { format: 'hitwhat-backup', version: 1, exportedAt: 5, profile: defaultProfile(), golf: { rounds: [played(1)], courses: [], shots: [] }, swings: [] };
    const o = parseBackup(JSON.stringify(old));
    expect(o.ok && o.golf.practice).toEqual([]);
    expect(o.ok && o.golf.rounds).toHaveLength(1);
    expect(sanitizeGolf({}).practice).toEqual([]);
  });
});
