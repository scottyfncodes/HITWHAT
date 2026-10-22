/**
 * The caddie's voice: a deterministic one-liner built from the
 * recommendation. No model, no network: it can only say what the engine decided.
 */
import { aimText, displayMath, fmtDistance, swingText } from './format';
import type { Recommendation } from './types';
import { distanceLabel, type Units } from './units';

export function localTake(rec: Recommendation, units: Units): string {
  const unit = distanceLabel(units.distance);
  const { total, rows } = displayMath(rec, units);
  const club = rec.club.name;

  if (rec.leaves !== undefined) {
    return `${club}, full swing. You can't get there in one. It leaves about ${fmtDistance(rec.leaves, units)} ${unit}.`;
  }

  const lead = leadFor(rec, club);

  const biggest = [...rows].sort((a, b) => Math.abs(b.shown) - Math.abs(a.shown))[0];
  const why =
    biggest && Math.abs(biggest.shown) >= 3
      ? ` Plays ${total} ${unit}: ${reasonPhrase(biggest.kind, biggest.shown)}.`
      : ` Plays ${total} ${unit}.`;

  const aim = rec.aim.yards === 0 ? '' : ` ${aimText(rec.aim, units)}.`;
  return `${lead}${why}${aim}`;
}

function reasonPhrase(kind: string, shown: number): string {
  const more = shown > 0;
  switch (kind) {
    case 'wind':
      return more ? 'the wind is knocking it down' : "the wind's helping";
    case 'elevation':
      return more ? "it's playing uphill" : "it's playing downhill";
    case 'temperature':
      return more ? 'cold air, the ball won’t go' : 'warm air, it’ll fly';
    case 'altitude':
      return more ? 'heavier air than home' : 'thin air, it’ll fly';
    case 'lie':
      return 'the lie will cost you some';
    case 'stance':
      return more ? 'the slope adds loft' : 'the slope delofts it';
    case 'tendency':
      return more ? 'your misses come up short' : 'your misses go long';
    default:
      return 'conditions matter here';
  }
}

function leadFor(rec: Recommendation, club: string): string {
  switch (rec.swing) {
    case 'smooth':
      return `Smooth ${club}.`;
    case 'choke-down':
      return `${club}, choked down.`;
    case 'knockdown':
      return `Knockdown ${club}.`;
    case 'hard':
      return `${club}, full and committed.`;
    case 'partial':
      return `${swingText(rec)}, ${club}.`;
    default:
      return `${club}.`;
  }
}
