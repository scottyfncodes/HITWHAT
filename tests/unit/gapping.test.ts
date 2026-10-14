import { describe, expect, it } from 'vitest';
import { DEFAULT_CLUBS } from '../../src/core/clubs';
import { distanceLadder, practicePlan } from '../../src/core/gapping';
import { clubStats, effectiveClubs, learnedClubIds, type ShotRecord } from '../../src/core/shots';
import type { Club } from '../../src/core/types';

let id = 0;
const shots = (clubId: string, ds: number[]): ShotRecord[] =>
  ds.map((distance) => ({ id: `s${++id}`, at: id, clubId, distance, source: 'manual', full: true, roundId: null, hole: null, from: null }));

function ladderFor(bag: Club[], recs: ShotRecord[] = [], learn = true) {
  const stats = clubStats(recs);
  return distanceLadder(bag, effectiveClubs(bag, stats, learn), stats, learnedClubIds(bag, stats, learn));
}

const bag = () => DEFAULT_CLUBS.map((c) => ({ ...c }));

describe('distance ladder', () => {
  it('lists clubs in the bag, longest first, with gaps to the next club', () => {
    const rows = ladderFor(bag());
    expect(rows.map((r) => r.club.id)).toEqual(['dr', '3w', '5w', '4h', '5i', '6i', '7i', '8i', '9i', 'pw', 'gw', 'sw', 'lw']);
    expect(rows.every((r) => r.basis === 'typed')).toBe(true);
    expect(rows[0].gapToNext).toBe(20);
    expect(rows.at(-1)!.gapToNext).toBeNull();
    // The default bag is evenly gapped.
    expect(rows.filter((r) => r.gapFlag)).toEqual([]);
  });

  it('uses the tracked average once a club has enough shots, and shows its spread', () => {
    const rows = ladderFor(bag(), shots('7i', [158, 160, 162, 160, 160]));
    const seven = rows.find((r) => r.club.id === '7i')!;
    expect(seven.basis).toBe('tracked');
    expect(seven.number).toBe(160);
    expect(seven.band!.lo).toBeLessThan(160);
    expect(seven.band!.hi).toBeGreaterThan(160);
    // 6i (162) and 7i (160) now do the same job.
    expect(rows.find((r) => r.club.id === '6i')!.gapFlag).toBe('overlap');
  });

  it('keeps the typed number when learning is off, and gives no band with too few shots', () => {
    const rows = ladderFor(bag(), shots('7i', [158, 160, 162, 160, 160]), false);
    expect(rows.find((r) => r.club.id === '7i')!).toMatchObject({ basis: 'typed', number: 152 });
    const few = ladderFor(bag(), shots('8i', [140, 142, 141]));
    expect(few.find((r) => r.club.id === '8i')!.band).toBeNull();
  });

  it('flags wide gaps, allowing woods more room', () => {
    const b = bag().map((c) => (c.id === 'gw' ? { ...c, inBag: false } : c.id === '3w' ? { ...c, carry: 208 } : c));
    const rows = ladderFor(b);
    expect(rows.find((r) => r.club.id === 'pw')!).toMatchObject({ gapToNext: 28, gapFlag: 'wide' });
    const driverish = ladderFor(bag().map((c) => (c.id === 'dr' ? { ...c, carry: 232 } : c.id === '3w' ? { ...c, carry: 210 } : c)));
    expect(driverish[0].gapFlag).toBeNull();
  });

  it('skips clubs out of the bag or without a carry', () => {
    const rows = ladderFor(bag().map((c) => (c.id === 'lw' ? { ...c, carry: 0 } : c)));
    expect(rows.find((r) => r.club.id === 'lw')).toBeUndefined();
    expect(rows.find((r) => r.club.id === '4i')).toBeUndefined();
  });
});

describe('practice plan', () => {
  it('starts with measuring the scoring clubs nearest 140 yards', () => {
    const plan = practicePlan(ladderFor(bag()));
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ kind: 'measure', clubIds: ['8i', '9i', '7i'] });
    expect(plan[0].title).toBe('Measure your 8 Iron, 9 Iron and 7 Iron');
    expect(plan[0].detail).toContain('Log 5 full-swing carries with each');
  });

  it('names the least consistent club with its real spread', () => {
    const recs = [...shots('7i', [145, 160, 175, 150, 170, 160]), ...shots('8i', [140, 141, 139, 140, 141])];
    const plan = practicePlan(ladderFor(bag(), recs));
    const c = plan.find((p) => p.kind === 'consistency')!;
    expect(c.clubIds).toEqual(['7i']);
    expect(c.detail).toMatch(/±\d+ yds, the most in your bag \(from 6 shots\)/);
  });

  it('calls out the worst gap with the yardage between the two clubs', () => {
    const b = bag().map((c) => (c.id === 'gw' ? { ...c, inBag: false } : c));
    const g = practicePlan(ladderFor(b)).find((p) => p.kind === 'gap')!;
    expect(g.title).toBe('Fill the 28 yds gap');
    expect(g.detail).toContain('Pitching Wedge (118 yds) and Sand Wedge (90 yds)');
    expect(g.detail).toContain('about 104 yds');
  });

  it('formats distances in the golfer’s units', () => {
    const b = bag().map((c) => (c.id === 'gw' ? { ...c, inBag: false } : c));
    const g = practicePlan(ladderFor(b), { label: (c) => c.short, dist: (y) => `${Math.round(y * 0.9144)} m` }).find((p) => p.kind === 'gap')!;
    expect(g.detail).toContain('PW (108 m) and SW (82 m)');
  });

  it('has nothing to say about a measured, consistent, evenly gapped bag', () => {
    const b = bag().filter((c) => ['7i', '8i', '9i'].includes(c.id));
    const recs = [...shots('7i', [152, 152, 153, 151, 152]), ...shots('8i', [141, 141, 142, 140, 141]), ...shots('9i', [130, 130, 131, 129, 130])];
    expect(practicePlan(ladderFor(b, recs))).toEqual([]);
  });
});
