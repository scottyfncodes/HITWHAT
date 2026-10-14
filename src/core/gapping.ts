/**
 * The distance ladder: every club in the bag, the number the caddie uses for
 * it, where that number came from, and the gap to the next club down. Plus a
 * short practice plan built only from what the golfer's data actually shows.
 * Pure functions; distances are yards.
 */
import { MIN_SHOTS_TO_LEARN, learnableClub, type ClubDistanceStat } from './shots';
import type { Club } from './types';

export type GapFlag = 'overlap' | 'wide';

export interface LadderRow {
  club: Club;
  /** The carry the caddie uses: the golfer's recent average once learned, else the typed carry. */
  number: number;
  /** Where `number` comes from. */
  basis: 'tracked' | 'typed';
  stat: ClubDistanceStat | null;
  /**
   * Typical range from tracked full shots (recent average ± one standard
   * deviation, roughly two shots in three). Only with 4+ shots; fewer can't
   * describe a spread honestly.
   */
  band: { lo: number; hi: number } | null;
  /** Yards to the next shorter club, or null for the shortest club. */
  gapToNext: number | null;
  gapFlag: GapFlag | null;
}

/** Gaps under this many yards mean two clubs do the same job. */
export const OVERLAP_YDS = 5;
/** Gaps over this leave a yardage the golfer has no full swing for. Woods are allowed more. */
export const WIDE_YDS = { short: 18, long: 25 } as const;

const MIN_BAND_SHOTS = 4;

const wideLimit = (longer: Club) => (longer.type === 'driver' || longer.type === 'wood' ? WIDE_YDS.long : WIDE_YDS.short);

/**
 * Builds the ladder for the clubs in the bag, longest first.
 * `effective` are the carries the caddie uses (see `effectiveClubs`); `typed`
 * are the carries the golfer entered.
 */
export function distanceLadder(
  typed: readonly Club[],
  effective: readonly Club[],
  stats: Map<string, ClubDistanceStat>,
  learned: ReadonlySet<string>,
): LadderRow[] {
  const byId = new Map(effective.map((c) => [c.id, c]));
  const rows = typed
    .filter((c) => c.inBag && c.carry > 0)
    .map((club): LadderRow => {
      const eff = byId.get(club.id);
      const number = Math.round(eff?.carry ?? club.carry);
      const stat = stats.get(club.id) ?? null;
      const band = stat && stat.count >= MIN_BAND_SHOTS ? { lo: Math.round(stat.recent - stat.spread), hi: Math.round(stat.recent + stat.spread) } : null;
      return { club, number, basis: learned.has(club.id) ? 'tracked' : 'typed', stat, band, gapToNext: null, gapFlag: null };
    })
    .sort((a, b) => b.number - a.number);
  for (let i = 0; i < rows.length - 1; i++) {
    const gap = rows[i].number - rows[i + 1].number;
    rows[i].gapToNext = gap;
    rows[i].gapFlag = gap < OVERLAP_YDS ? 'overlap' : gap > wideLimit(rows[i].club) ? 'wide' : null;
  }
  return rows;
}

export type PracticeKind = 'measure' | 'consistency' | 'gap';

export interface PracticeItem {
  kind: PracticeKind;
  clubIds: string[];
  title: string;
  detail: string;
}

/** The yardage most approach shots come from; clubs near it are measured first. */
const SCORING_YDS = 140;

/**
 * Up to three range jobs, most useful first. Each one is a literal reading of
 * the ladder: clubs without enough tracked shots, the least consistent club,
 * and the worst gap. Nothing is suggested without data behind it.
 */
export interface PlanText {
  /** Club name as the golfer reads it. */
  label: (c: Club) => string;
  /** A distance in yards, formatted with its unit in the golfer's units, e.g. "130 yds". */
  dist: (yards: number) => string;
}

const DEFAULT_TEXT: PlanText = { label: (c) => c.name, dist: (y) => `${Math.round(y)} yds` };

export function practicePlan(rows: readonly LadderRow[], text: PlanText = DEFAULT_TEXT): PracticeItem[] {
  const { label, dist } = text;
  const items: PracticeItem[] = [];

  const unmeasured = rows
    .filter((r) => learnableClub(r.club) && (r.stat?.count ?? 0) < MIN_SHOTS_TO_LEARN)
    .sort((a, b) => Math.abs(a.number - SCORING_YDS) - Math.abs(b.number - SCORING_YDS))
    .slice(0, 3);
  if (unmeasured.length) {
    const names = listText(unmeasured.map((r) => label(r.club)));
    const need = unmeasured.map((r) => MIN_SHOTS_TO_LEARN - (r.stat?.count ?? 0));
    const reps = Math.max(...need);
    items.push({
      kind: 'measure',
      clubIds: unmeasured.map((r) => r.club.id),
      title: `Measure your ${names}`,
      detail: `Log ${reps === MIN_SHOTS_TO_LEARN ? MIN_SHOTS_TO_LEARN : `up to ${reps} more`} full-swing carries with ${unmeasured.length === 1 ? 'it' : 'each'}. Until then the caddie uses the number you typed.`,
    });
  }

  const varied = rows
    .filter((r) => r.stat && r.stat.count >= MIN_SHOTS_TO_LEARN && r.stat.spread / r.stat.recent > 0.06)
    .sort((a, b) => b.stat!.spread / b.stat!.recent - a.stat!.spread / a.stat!.recent)[0];
  if (varied) {
    const sp = varied.stat!.spread;
    items.push({
      kind: 'consistency',
      clubIds: [varied.club.id],
      title: `Tighten your ${label(varied.club)}`,
      detail: `It varies by about ±${dist(sp)}, the most in your bag (from ${varied.stat!.count} shots). Hit 10 at one target with the same swing and log every carry.`,
    });
  }

  const gaps = rows.filter((r, i) => r.gapFlag && rows[i + 1]).map((r) => ({ r, next: rows[rows.indexOf(r) + 1] }));
  const worst = gaps.sort((a, b) => gapSeverity(b.r) - gapSeverity(a.r))[0];
  if (worst) {
    const g = worst.r.gapToNext!;
    const a = label(worst.r.club);
    const b = label(worst.next.club);
    items.push(
      worst.r.gapFlag === 'wide'
        ? {
            kind: 'gap',
            clubIds: [worst.r.club.id, worst.next.club.id],
            title: `Fill the ${dist(g)} gap`,
            detail: `Between ${a} (${dist(worst.r.number)}) and ${b} (${dist(worst.next.number)}) you have no full swing. Practise a smooth ${a} to about ${dist((worst.r.number + worst.next.number) / 2)}.`,
          }
        : {
            kind: 'gap',
            clubIds: [worst.r.club.id, worst.next.club.id],
            title: `${a} and ${b} overlap`,
            detail: `They go ${g <= 0 ? 'the same distance' : `${dist(g)} apart`}. Hit 5 of each to check, then keep the one you trust or re-gap.`,
          },
    );
  }

  return items;
}

/** How far a gap is outside the comfortable range, in yards. */
function gapSeverity(r: LadderRow): number {
  if (r.gapToNext === null || !r.gapFlag) return 0;
  return r.gapFlag === 'overlap' ? OVERLAP_YDS - r.gapToNext : r.gapToNext - wideLimit(r.club);
}

function listText(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
