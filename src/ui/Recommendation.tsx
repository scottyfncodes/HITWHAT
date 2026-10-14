/** The answer. Everything else on the Caddie screen exists to feed this card. */
import { aimText, displayMath, fmtDistance, swingText } from '../core/format';
import type { ClubDistanceStat } from '../core/shots';
import type { TargetAdvice } from '../core/strategy';
import type { CaddieResult, Recommendation as Rec } from '../core/types';
import { distanceLabel, type Units } from '../core/units';
import { localTake } from '../core/voice';

const CONFIDENCE_TEXT = { high: 'Confident', medium: 'Good call', low: 'Tough one' } as const;

/** Short names for what moved the number, shown on the answer card. The full labels are in The math. */
const ADJ_SHORT: Record<Rec['adjustments'][number]['kind'], string> = {
  wind: 'Wind',
  elevation: 'Slope',
  temperature: 'Temp',
  altitude: 'Altitude',
  lie: 'Lie',
  stance: 'Stance',
  tendency: 'Your tendency',
};

interface Props {
  result: CaddieResult;
  units: Units;
  onFocusField: (f: string) => void;
  advice: TargetAdvice | null;
  clubStat: ClubDistanceStat | null;
  learned: boolean;
  usePersonalLine: boolean;
}

export function RecommendationCard({ result, units, onFocusField, advice, clubStat, learned, usePersonalLine }: Props) {
  if (result.status !== 'ok') {
    const isInvalid = result.status === 'invalid';
    const text = isInvalid ? result.message : result.prompt;
    return (
      <section class={`hero hero-empty${isInvalid ? ' hero-invalid' : ''}`} aria-live="polite" data-testid="recommendation" aria-label="Caddie recommendation">
        <p class="hero-kicker">{isInvalid ? 'Check that number' : 'What should I hit?'}</p>
        <p class="hero-ask" role={isInvalid ? 'alert' : undefined}>
          {text}
        </p>
        {result.field === 'clubs' && (
          <button type="button" class="btn" onClick={() => onFocusField('settings')}>
            Open your bag
          </button>
        )}
      </section>
    );
  }
  return <Answer rec={result} units={units} advice={advice} clubStat={clubStat} learned={learned} usePersonalLine={usePersonalLine} />;
}

function personalLine(rec: Rec, stat: ClubDistanceStat | null, learned: boolean, units: Units): string | null {
  if (!stat || stat.count < 3) return null;
  const n = fmtDistance(stat.recent, units);
  const club = rec.club.name.replace(/ Iron$/, '-iron').replace(/ Wood$/, '-wood').replace(/ Hybrid$/, '-hybrid').toLowerCase();
  return learned ? `Using your recent ${club} average of ${n} (${stat.count} shots).` : `Your recent ${club} average is ${n}.`;
}

function Answer({ rec, units, advice, clubStat, learned, usePersonalLine }: Omit<Props, 'result' | 'onFocusField'> & { rec: Rec }) {
  const unit = distanceLabel(units.distance);
  const { total, distance, rows } = displayMath(rec, units);
  const personal = usePersonalLine ? personalLine(rec, clubStat, learned, units) : null;
  const strategic = advice && (advice.why || advice.aim !== 'Aim at the flag.');
  const line = strategic ? [advice!.aim, advice!.why, personal].filter(Boolean).join(' ') : [localTake(rec, units), personal].filter(Boolean).join(' ');
  return (
    <section class="hero" aria-live="polite" data-testid="recommendation" aria-label="Caddie recommendation">
      <div class="hero-top">
        <p class="hero-distance">
          <strong>{distance}</strong> {unit.toUpperCase()}
          {total !== distance && <span> · plays {total}</span>}
        </p>
        <span class={`pill conf-${rec.confidence}`}>{CONFIDENCE_TEXT[rec.confidence]}</span>
      </div>
      <h2 class="hero-club" data-testid="club">
        {rec.club.name}
      </h2>
      <p class="hero-swing" data-testid="swing">
        {swingText(rec)}
        {rec.swing === 'partial' && rec.swingPct !== undefined && ` · ~${Math.round(rec.swingPct * 100)}%`}
      </p>
      <p class="hero-take" data-testid="local-take">
        “{line}”
      </p>
      {rows.length > 0 && (
        <ul class="adj-chips" aria-label={`Plays ${total} ${unit}: what changed it`} data-testid="adjustments">
          {rows.map((r) => (
            <li key={r.kind} class={r.shown > 0 ? 'plus' : 'minus'}>
              {ADJ_SHORT[r.kind]} <strong>{r.shown > 0 ? '+' : '−'}{Math.abs(r.shown)}</strong>
            </li>
          ))}
        </ul>
      )}
      <dl class="hero-stats">
        <div>
          <dt>Plays like</dt>
          <dd data-testid="plays-like">
            {total}
            <small> {unit}</small>
          </dd>
        </div>
        <div>
          <dt>Aim</dt>
          <dd class="aim" data-testid="aim">
            {rec.aim.yards === 0 ? (
              'Center'
            ) : (
              <>
                {fmtDistance(Math.abs(rec.aim.yards), units)}
                <small> {unit}</small> {rec.aim.yards > 0 ? 'R' : 'L'}
              </>
            )}
          </dd>
        </div>
        {rec.leaves !== undefined && (
          <div>
            <dt>Leaves</dt>
            <dd>
              {fmtDistance(rec.leaves, units)}
              <small> {unit}</small>
            </dd>
          </div>
        )}
      </dl>
      {rec.aim.yards !== 0 && rec.aim.reasons.length > 0 && (
        <p class="hero-note">
          {aimText(rec.aim, units)}: {rec.aim.reasons.join(', ')}.
        </p>
      )}
      {advice?.safeMiss && (
        <p class="hero-note" data-testid="safe-miss">
          {advice.safeMiss}
        </p>
      )}
      {rec.notes.length > 0 && (
        <ul class="hero-cautions" aria-label="Keep in mind" data-testid="cautions">
          {rec.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {rec.alternatives.length > 0 && (
        <ul class="alts" aria-label="Other options">
          {rec.alternatives.map((a) => (
            <li key={a.club.id}>
              <strong>{a.club.name}</strong> <span>{a.note}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The arithmetic, shown so the golfer can trust (or overrule) the number. */
export function WhyPanel({ rec, units, learned }: { rec: Rec; units: Units; learned: boolean }) {
  const unit = distanceLabel(units.distance);
  const { distance, rows, total } = displayMath(rec, units);
  return (
    <details class="card why">
      <summary>
        <span class="card-title">The math</span>
        <span class="muted">
          {distance} → {total} {unit}
        </span>
      </summary>
      <table class="math" data-testid="math">
        <tbody>
          <tr>
            <th scope="row">To target</th>
            <td>
              {distance} {unit}
            </td>
          </tr>
          {rows.map((r) => (
            <tr key={r.kind}>
              <th scope="row">{r.label}</th>
              <td class={r.shown > 0 ? 'plus' : 'minus'}>
                {r.shown > 0 ? '+' : '−'}
                {Math.abs(r.shown)}
              </td>
            </tr>
          ))}
          <tr class="total">
            <th scope="row">Plays like</th>
            <td>
              {total} {unit}
            </td>
          </tr>
          <tr class="carry">
            <th scope="row">
              {rec.club.name} {learned ? 'averages (your shots)' : 'carries'}
            </th>
            <td>
              {fmtDistance(rec.club.carry, units)} {unit}
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  );
}
