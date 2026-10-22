/**
 * The deterministic caddie. Given a situation and a bag, produce ONE club,
 * a swing, an aim and the arithmetic behind it. This is the authority on
 * numbers.
 */
import {
  RULES,
  altitudeYards,
  describeWind,
  elevationYards,
  lieYards,
  stanceAimYards,
  stanceYards,
  temperatureYards,
  tendencyYards,
  windComponents,
  windDriftYards,
  windYards,
} from './adjustments';
import { MAX_TAKEOFF_PCT, eligibleClubs } from './clubs';
import type {
  Adjustment,
  Aim,
  Alternative,
  CaddieResult,
  Club,
  Confidence,
  PlayerContext,
  Recommendation,
  ShotInput,
  SwingType,
} from './types';

export const LIMITS = {
  distance: { min: 1, max: 700 },
  windMph: { min: 0, max: RULES.maxWindMph },
  elevationFt: { min: -300, max: 300 },
  temperatureF: { min: -10, max: 125 },
  altitudeFt: { min: -1500, max: 14000 },
} as const;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const within = (n: number, r: { min: number; max: number }) => n >= r.min && n <= r.max;

/** Validate a situation. Returns a non-ok result, or null if the input is usable. */
export function validate(input: ShotInput, ctx: PlayerContext): Exclude<CaddieResult, Recommendation> | null {
  if (input.distance === null || input.distance === undefined) {
    return { status: 'needs-input', field: 'distance', prompt: 'How far to the target?' };
  }
  if (!finite(input.distance) || !within(input.distance, LIMITS.distance)) {
    return {
      status: 'invalid',
      field: 'distance',
      message: `Enter a distance between ${LIMITS.distance.min} and ${LIMITS.distance.max} yards.`,
    };
  }
  if (!finite(input.wind.speedMph) || !finite(input.wind.fromDeg) || !within(input.wind.speedMph, LIMITS.windMph)) {
    return { status: 'invalid', field: 'wind', message: `Wind must be 0–${LIMITS.windMph.max} mph.` };
  }
  if (!finite(input.elevationFt) || !within(input.elevationFt, LIMITS.elevationFt)) {
    return { status: 'invalid', field: 'elevation', message: 'Elevation change must be within ±300 ft.' };
  }
  if (input.temperatureF !== null && (!finite(input.temperatureF) || !within(input.temperatureF, LIMITS.temperatureF))) {
    return { status: 'invalid', field: 'temperature', message: 'Temperature looks off. Check it.' };
  }
  if (input.altitudeFt !== null && (!finite(input.altitudeFt) || !within(input.altitudeFt, LIMITS.altitudeFt))) {
    return { status: 'invalid', field: 'altitude', message: 'Altitude looks off. Check it.' };
  }
  if (eligibleClubs(ctx.clubs, input.lie).length === 0) {
    return { status: 'needs-input', field: 'clubs', prompt: 'Add at least one club with a carry distance in Settings.' };
  }
  return null;
}

/** All plays-like adjustments, in display order. Zero-effect factors are omitted. */
export function computeAdjustments(input: ShotInput, ctx: PlayerContext): Adjustment[] {
  const d = input.distance ?? 0;
  const out: Adjustment[] = [];
  const push = (kind: Adjustment['kind'], yards: number, label: string) => {
    if (Math.abs(yards) >= 0.05) out.push({ kind, yards, label });
  };

  push('wind', windYards(d, input.wind), describeWind(input.wind));
  const e = input.elevationFt;
  push('elevation', elevationYards(e), `${Math.abs(Math.round(e))} ft ${e >= 0 ? 'uphill' : 'downhill'}`);
  push(
    'temperature',
    temperatureYards(d, input.temperatureF, ctx.baseline.temperatureF),
    `${Math.round(input.temperatureF ?? ctx.baseline.temperatureF)}°F`,
  );
  push(
    'altitude',
    altitudeYards(d, input.altitudeFt, ctx.baseline.altitudeFt),
    `${Math.round(input.altitudeFt ?? 0).toLocaleString('en-US')} ft altitude`,
  );

  const environmental = d + out.reduce((s, a) => s + a.yards, 0);
  push('lie', lieYards(environmental, input.lie), LIE_ADJ_LABEL[input.lie]);
  push('stance', stanceYards(environmental, input.stance), STANCE_ADJ_LABEL[input.stance]);
  push('tendency', tendencyYards(environmental, ctx.tendency), ctx.tendency === 'short' ? 'You tend to come up short' : 'You tend to fly it long');
  return out;
}

const LIE_ADJ_LABEL: Record<ShotInput['lie'], string> = {
  tee: 'Tee',
  fairway: 'Fairway',
  'first-cut': 'First cut',
  rough: 'Rough: ball comes out slower',
  'deep-rough': 'Deep rough: grass grabs the club',
  bunker: 'Fairway bunker: pick it clean',
  hardpan: 'Hardpan',
};

const STANCE_ADJ_LABEL: Record<ShotInput['stance'], string> = {
  flat: 'Flat',
  'ball-above': 'Ball above feet',
  'ball-below': 'Ball below feet: harder to reach',
  uphill: 'Uphill lie: adds loft',
  downhill: 'Downhill lie: takes off loft',
};

type Bias = 'longer' | 'shorter' | 'none';

function strategicBias(input: ShotInput): Bias {
  const short = input.trouble.includes('short');
  const long = input.trouble.includes('long');
  if (short && !long) return 'longer';
  if (long && !short) return 'shorter';
  return 'none';
}

interface Pick {
  club: Club;
  swing: SwingType;
  swingPct?: number;
  leaves?: number;
  between: boolean;
}

export function selectClub(playsLike: number, clubs: Club[], input: ShotInput): Pick {
  const longest = clubs[0];
  const shortest = clubs[clubs.length - 1];
  const bias = strategicBias(input);
  const { head } = windComponents(input.wind);
  const breezy = head >= 10;

  if (playsLike > longest.carry + 3) {
    return { club: longest, swing: 'full', leaves: playsLike - longest.carry, between: false };
  }
  if (playsLike < shortest.carry - 3) {
    const pct = Math.max(0.2, Math.min(1, playsLike / shortest.carry));
    return { club: shortest, swing: 'partial', swingPct: pct, between: false };
  }

  // Smallest carry that reaches, and largest carry that doesn't.
  const up = [...clubs].reverse().find((c) => c.carry >= playsLike);
  const down = clubs.find((c) => c.carry < playsLike);

  if (!up) return { club: longest, swing: 'full', between: false };
  if (up.carry - playsLike <= 3) {
    // "When it's breezy, swing easy": into the wind, take one more club and flight it down
    // rather than trying to knock down a club that only just gets there.
    if (breezy && bias !== 'shorter') {
      const idx = clubs.indexOf(up);
      const longer = clubs[idx - 1];
      if (longer && longer.carry - playsLike <= longer.carry * MAX_TAKEOFF_PCT[longer.type] * 1.6) {
        return { club: longer, swing: 'knockdown', between: false };
      }
    }
    return { club: up, swing: 'full', between: false };
  }
  if (!down) return { club: up, swing: 'smooth', between: false };
  if (playsLike - down.carry <= 2 && bias !== 'longer') {
    return { club: down, swing: 'full', between: false };
  }

  const takeOff = up.carry - playsLike;
  const shortBy = playsLike - down.carry;
  const maxOff = up.carry * MAX_TAKEOFF_PCT[up.type];

  if (bias === 'shorter' && shortBy <= 5) return { club: down, swing: 'full', between: true };
  if (takeOff <= maxOff || bias === 'longer') {
    const swing: SwingType = breezy ? 'knockdown' : takeOff <= 6 ? 'smooth' : 'choke-down';
    return { club: up, swing, between: true };
  }
  // A real hole in the bag: pick whichever is closer.
  return shortBy < takeOff
    ? { club: down, swing: 'hard', between: true }
    : { club: up, swing: 'choke-down', between: true };
}

export function computeAim(input: ShotInput, playsLike: number, ctx: PlayerContext): Aim {
  const reasons: string[] = [];
  let yards = 0;
  const drift = windDriftYards(playsLike, input.wind);
  if (Math.abs(drift) >= 1) {
    yards += -drift;
    reasons.push(`wind moves it ${Math.round(Math.abs(drift))} ${drift > 0 ? 'right' : 'left'}`);
  }
  const st = stanceAimYards(playsLike, input.stance, ctx.handedness);
  if (st !== 0) {
    yards += st;
    reasons.push(input.stance === 'ball-above' ? 'ball above feet curves it' : 'ball below feet curves it');
  }
  const left = input.trouble.includes('left');
  const right = input.trouble.includes('right');
  if (left !== right) {
    const shade = Math.max(3, Math.min(8, playsLike * 0.03));
    yards += left ? shade : -shade;
    reasons.push(`trouble ${left ? 'left' : 'right'}`);
  }
  const rounded = Math.round(yards);
  return { yards: Math.abs(rounded) < 2 ? 0 : rounded, reasons };
}

function alternativesFor(pick: Pick, playsLike: number, clubs: Club[]): Alternative[] {
  if (pick.swing === 'partial' || pick.leaves !== undefined) return [];
  const idx = clubs.findIndex((c) => c.id === pick.club.id);
  const longer = clubs[idx - 1];
  const shorter = clubs[idx + 1];
  const out: Alternative[] = [];
  if (pick.club.carry >= playsLike && shorter && playsLike - shorter.carry <= 12) {
    out.push({ club: shorter, swing: 'full', note: `Only if you're flushing it. Carries ${Math.round(shorter.carry)}` });
  }
  if (pick.club.carry < playsLike && longer) {
    out.push({ club: longer, swing: 'smooth', note: `Smooth it to be sure you get there. Carries ${Math.round(longer.carry)}` });
  }
  if (pick.club.carry >= playsLike && pick.swing === 'full' && longer && longer.carry - playsLike <= 12) {
    out.push({ club: longer, swing: 'smooth', note: `Easy swing if you'd rather not force it` });
  }
  return out.slice(0, 2);
}

function notesFor(input: ShotInput, pick: Pick, aim: Aim, ctx: PlayerContext): string[] {
  const notes: string[] = [];
  const { head, cross } = windComponents(input.wind);
  if (pick.leaves !== undefined) {
    notes.push(`Can't get there in one. This leaves about ${Math.round(pick.leaves)}.`);
    if (input.trouble.includes('short')) notes.push('Trouble short: lay up to a number you like instead of forcing it.');
  }
  if (pick.swing === 'partial' && pick.swingPct !== undefined) {
    notes.push(pick.swingPct < 0.45 ? 'Short pitch: soft hands, let the loft work.' : 'Controlled partial swing, accelerate through.');
  }
  if (head >= 10) notes.push("Into the wind: swing easy, ball back an inch, keep the finish low. Spin makes it balloon.");
  else if (head <= -8) notes.push('Downwind: less spin, more release. Land it short of the target.');
  if (Math.abs(cross) >= 8) notes.push(`Crosswind ${cross > 0 ? 'off the right' : 'off the left'}: start it into the wind and let it drift back.`);
  const lieNote: Partial<Record<ShotInput['lie'], string>> = {
    'first-cut': 'Flyer risk from the first cut. It may come out hot with less spin. Favor the front.',
    rough: 'Rough: grip firmer, steeper swing, expect less spin.',
    'deep-rough': "Deep rough: priority one is getting it out. Take loft, don't be a hero.",
    bunker: 'Fairway bunker: choke down, ball first, quiet lower body.',
    hardpan: 'Hardpan: ball back, trap it. The bounce will skip.',
  };
  if (lieNote[input.lie]) notes.push(lieNote[input.lie]!);
  const sideRight = ctx.handedness === 'right';
  const stanceNote: Partial<Record<ShotInput['stance'], string>> = {
    uphill: 'Uphill lie: shoulders with the slope. It flies higher and shorter.',
    downhill: 'Downhill lie: swing down the slope. It comes out lower and runs.',
    'ball-above': `Ball above feet: choke down, it wants to go ${sideRight ? 'left' : 'right'}.`,
    'ball-below': `Ball below feet: sit into it, it wants to go ${sideRight ? 'right' : 'left'}.`,
  };
  if (stanceNote[input.stance]) notes.push(stanceNote[input.stance]!);
  const short = input.trouble.includes('short');
  const long = input.trouble.includes('long');
  if (short && long) notes.push('Trouble short and long. The middle of the green is a win.');
  else if (short && pick.leaves === undefined) notes.push('Nothing good short. Make sure you get there.');
  else if (long) notes.push('Long is dead. The back edge is your enemy.');
  if (pick.swing === 'hard') notes.push('Big gap in your bag here. Commit to a full, aggressive swing.');
  if (aim.yards === 0 && (input.trouble.includes('left') || input.trouble.includes('right'))) {
    notes.push('Wind and trouble cancel out. Aim straight at it.');
  }
  return notes;
}

function confidenceFor(input: ShotInput, pick: Pick): Confidence {
  const { head, cross } = windComponents(input.wind);
  const windMag = Math.hypot(head, cross);
  if (pick.leaves !== undefined || input.lie === 'deep-rough' || windMag >= 25) return 'low';
  let doubts = 0;
  if (pick.between) doubts++;
  if (windMag >= 12) doubts++;
  if (input.lie === 'rough' || input.lie === 'bunker' || input.lie === 'first-cut') doubts++;
  if (input.stance !== 'flat') doubts++;
  if (pick.swing === 'hard' || pick.swing === 'partial') doubts++;
  return doubts === 0 ? 'high' : doubts <= 2 ? 'medium' : 'low';
}

/** The whole deterministic caddie: situation in, one clear answer out. */
export function recommend(input: ShotInput, ctx: PlayerContext): CaddieResult {
  const problem = validate(input, ctx);
  if (problem) return problem;
  const distance = input.distance as number;
  const clubs = eligibleClubs(ctx.clubs, input.lie);
  const adjustments = computeAdjustments(input, ctx);
  const playsLike = Math.max(1, distance + adjustments.reduce((s, a) => s + a.yards, 0));
  const pick = selectClub(playsLike, clubs, input);
  const aim = computeAim(input, playsLike, ctx);
  return {
    status: 'ok',
    input,
    club: pick.club,
    swing: pick.swing,
    swingPct: pick.swingPct,
    distance,
    playsLike,
    adjustments,
    aim,
    alternatives: alternativesFor(pick, playsLike, clubs),
    confidence: confidenceFor(input, pick),
    notes: notesFor(input, pick, aim, ctx),
    leaves: pick.leaves,
  };
}

export const SWING_LABEL: Record<SwingType, string> = {
  full: 'Full swing',
  smooth: 'Smooth swing',
  'choke-down': 'Choke down',
  knockdown: 'Knockdown',
  partial: 'Partial swing',
  hard: 'Full & committed',
};

export function partialSwingLabel(pct: number): string {
  if (pct >= 0.85) return 'Three-quarter swing';
  if (pct >= 0.65) return 'Half-to-¾ swing';
  if (pct >= 0.45) return 'Half swing';
  return 'Pitch';
}
