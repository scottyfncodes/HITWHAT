/**
 * CADDIE: "What should I hit here?" The distance and the answer come first;
 * everything that changes the answer sits in one Conditions card below it,
 * always summarised and opened only when the golfer needs to change it.
 */
import { useMemo, useState } from 'preact/hooks';
import { fmtDistance } from '../core/format';
import { LIMITS, recommend } from '../core/recommend';
import { holeNumber, holeYardage, roundPars, type Round } from '../core/round';
import { holePlan, targetAdvice } from '../core/strategy';
import type { PlayerContext } from '../core/types';
import { distanceLabel, toYards, yardsTo } from '../core/units';
import { defaultSituation } from '../state/profile';
import { playingIndex, useApp } from './context';
import { Conditions, type Group } from './Conditions';
import { NumberField } from './controls';
import { Icon } from './kit';
import { RecommendationCard, WhyPanel } from './Recommendation';
import { ShotTracker } from './ShotTracker';

const FIELD_GROUP: Record<string, Group> = { wind: 'wind', elevation: 'elevation', temperature: 'air', altitude: 'air' };

export function CaddieTab() {
  const app = useApp();
  const { profile, units: u, shot, setShot, clubs, pin, setPin, range, setRange, active, clubStats, learned } = app;
  const [request, setRequest] = useState<{ group: Group; n: number } | null>(null);

  const ctx: PlayerContext = useMemo(
    () => ({ clubs, handedness: profile.handedness, tendency: profile.tendency, baseline: profile.baseline }),
    [clubs, profile.handedness, profile.tendency, profile.baseline],
  );
  const result = useMemo(() => recommend(shot, ctx), [shot, ctx]);
  const update = (patch: Partial<typeof shot>) => setShot((s) => ({ ...s, ...patch }));
  const hcp = playingIndex(app);
  const advice = result.status === 'ok' ? targetAdvice({ pin, trouble: shot.trouble, handicap: hcp, clubCarry: result.club.carry }) : null;

  const focusField = (f: string) => {
    if (f === 'settings' || f === 'clubs') return app.openSettings();
    const g = FIELD_GROUP[f];
    if (g) return setRequest((r) => ({ group: g, n: (r?.n ?? 0) + 1 }));
    const el = document.getElementById('distance');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el instanceof HTMLInputElement) el.focus();
  };

  const newShot = () => {
    setShot((s) => ({ ...defaultSituation(), wind: s.wind, temperatureF: s.temperatureF, altitudeFt: s.altitudeFt }));
    setPin(null);
    setRange(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => document.getElementById('distance')?.focus());
  };

  const setDistance = (yd: number | null) => update({ distance: yd });
  const distDisplay = shot.distance === null ? null : yardsTo(shot.distance, u.distance);
  const distInvalid = result.status === 'invalid' && result.field === 'distance';
  const stat = result.status === 'ok' ? clubStats.get(result.club.id) ?? null : null;

  return (
    <div class="stack caddie">
      <section class="card shot-bar" aria-labelledby="distance-label">
        <div class="shot-bar-head">
          <label id="distance-label" class="field-label" for="distance">
            Distance
          </label>
          <button type="button" class="btn small accent" onClick={app.openRangefinder} data-testid="open-rangefinder">
            <Icon name="camera" size={18} /> Rangefinder
          </button>
        </div>
        <div class="distance-row">
          <button type="button" class="step big" aria-label="Minus 5" onClick={() => setDistance(stepDist(distDisplay, -5, u.distance))}>
            −5
          </button>
          <div class="distance-input-wrap">
            <NumberField
              id="distance"
              label={`Distance to target in ${distanceLabel(u.distance)}`}
              value={distDisplay}
              min={LIMITS.distance.min}
              max={LIMITS.distance.max}
              class={`distance-input${distInvalid ? ' invalid' : ''}`}
              placeholder="150"
              invalid={distInvalid}
              onChange={(v) => setDistance(v === null ? null : toYards(v, u.distance))}
            />
            <span class="distance-unit">{distanceLabel(u.distance)}</span>
          </div>
          <button type="button" class="step big" aria-label="Plus 5" onClick={() => setDistance(stepDist(distDisplay, 5, u.distance))}>
            +5
          </button>
        </div>
        <div class="nudge">
          <button type="button" class="chip" aria-label="Minus 1" onClick={() => setDistance(stepDist(distDisplay, -1, u.distance))}>
            −1
          </button>
          <button type="button" class="chip" aria-label="Plus 1" onClick={() => setDistance(stepDist(distDisplay, 1, u.distance))}>
            +1
          </button>
        </div>
        {range?.green && (
          <div class="green-chips" role="group" aria-label="Play to" data-testid="green-chips">
            {(['front', 'center', 'back'] as const).map((k) => {
              const yd = range.green![k];
              const on = shot.distance !== null && Math.abs(shot.distance - yd) < 0.5;
              return (
                <button key={k} type="button" class={`chip${on ? ' on' : ''}`} onClick={() => setDistance(Math.max(1, Math.round(yd)))}>
                  <small>{k === 'center' ? 'Middle' : k === 'front' ? 'Front' : 'Back'}</small> {fmtDistance(yd, u)}
                </button>
              );
            })}
          </div>
        )}
        {range && <p class="fine">{range.label}</p>}
      </section>

      <div id="recommendation-top" class="anchor" />
      <RecommendationCard
        result={result}
        units={u}
        onFocusField={focusField}
        advice={advice}
        clubStat={stat}
        learned={result.status === 'ok' && learned.has(result.club.id)}
        usePersonalLine
      />

      <Conditions shot={shot} update={update} pin={pin} setPin={setPin} units={u} profile={profile} request={request} />

      {result.status === 'ok' && active && (
        <details class="card">
          <summary>
            <span class="card-title">Hit it? Track this shot</span>
          </summary>
          <ShotTracker hole={holeNumber(active, active.current)} defaultClub={result.club.id} compact />
        </details>
      )}

      {active && <HolePlanCard round={active} />}

      {result.status === 'ok' && <WhyPanel rec={result} units={u} learned={learned.has(result.club.id)} />}

      <button type="button" class="btn ghost wide" onClick={newShot} data-testid="new-shot">
        New shot
      </button>
    </div>
  );
}

/** "How should I play this hole?" — shown when a round is in progress. */
function HolePlanCard({ round }: { round: Round }) {
  const { golf, clubs, clubStats, units, go } = useApp();
  const idx = round.current;
  const par = roundPars(round)[idx] ?? 4;
  const yards = holeYardage(round, idx);
  const number = holeNumber(round, idx);
  const plan = useMemo(() => {
    const done = golf.rounds.filter((r) => r.status === 'complete' && r.source === 'app').sort((a, b) => b.date - a.date);
    const misses = { left: 0, right: 0, hit: 0 };
    for (const r of done.slice(0, 10)) for (const h of r.holes) {
      if (h.fairway === 'left') misses.left++;
      else if (h.fairway === 'right') misses.right++;
      else if (h.fairway === 'hit') misses.hit++;
    }
    const history = done
      .filter((r) => r.courseId && r.courseId === round.courseId)
      .map((r) => r.holes[number - 1 - r.startHole]?.strokes)
      .filter((s): s is number => typeof s === 'number');
    const driver = clubs.find((c) => c.type === 'driver');
    const drive = driver ? clubStats.get(driver.id) : undefined;
    return holePlan({ par, yards, clubs, driveTotal: drive && drive.count >= 3 ? drive.recent : null, misses, history });
  }, [golf.rounds, clubs, clubStats, par, yards, number, round.courseId]);

  return (
    <section class="card plan" aria-label="How to play this hole" data-testid="hole-plan">
      <div class="plan-head">
        <p class="eyebrow">
          Hole {number} · Par {par}
          {yards !== null && ` · ${fmtDistance(yards, units)} ${distanceLabel(units.distance)}`}
        </p>
        <button type="button" class="link" onClick={() => go('round')}>
          Scorecard
        </button>
      </div>
      {plan.teeClub && (
        <p class="plan-club">
          Off the tee: <strong>{plan.teeClub.name}</strong>
        </p>
      )}
      <ul class="plan-lines">
        {plan.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}

function stepDist(current: number | null, delta: number, unit: 'yd' | 'm'): number {
  const base = current === null ? (unit === 'm' ? 135 : 150) : Math.round(current);
  const next = Math.min(LIMITS.distance.max, Math.max(LIMITS.distance.min, base + delta));
  return toYards(next, unit);
}
