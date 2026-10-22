/**
 * Everything about the shot except the distance, in one place: a row of
 * summary chips that always shows the current conditions (anything that
 * changes the shot is highlighted), and an editor that opens on demand.
 */
import { useEffect, useState } from 'preact/hooks';
import { windText } from '../core/format';
import { pinText, type PinPosition } from '../core/strategy';
import type { Lie, ShotInput, Stance } from '../core/types';
import { fahrenheitTo, feetTo, heightLabel, mphTo, tempLabel, toFahrenheit, toFeet, toMph, windLabel, type Units } from '../core/units';
import { CONDITIONS_FAILURE_TEXT, fetchLiveConditions, relativeWindDeg, type ConditionsFailure, type LiveConditions } from '../services/conditions';
import type { Profile } from '../state/profile';
import { Segmented, Stepper } from './controls';
import { Icon } from './kit';
import { PinPicker } from './PinPicker';
import { TroublePicker } from './TroublePicker';
import { AimingPicker, WindPicker, compassName } from './WindPicker';

export const LIES: { value: Lie; label: string }[] = [
  { value: 'tee', label: 'Tee' },
  { value: 'fairway', label: 'Fairway' },
  { value: 'first-cut', label: 'First cut' },
  { value: 'rough', label: 'Rough' },
  { value: 'deep-rough', label: 'Deep rough' },
  { value: 'bunker', label: 'Bunker' },
  { value: 'hardpan', label: 'Hardpan' },
];

export const STANCES: { value: Stance; label: string }[] = [
  { value: 'flat', label: 'Flat' },
  { value: 'uphill', label: 'Uphill lie' },
  { value: 'downhill', label: 'Downhill lie' },
  { value: 'ball-above', label: 'Ball above feet' },
  { value: 'ball-below', label: 'Ball below feet' },
];

export type Group = 'green' | 'wind' | 'elevation' | 'lie' | 'air';

type Live =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ok'; data: LiveConditions; aimingDeg: number | null }
  | { phase: 'error'; reason: ConditionsFailure };

// Remembered while the app is open, so switching tabs doesn't collapse it.
let rememberedOpen = false;

interface Props {
  shot: ShotInput;
  update: (patch: Partial<ShotInput>) => void;
  pin: PinPosition | null;
  setPin: (p: PinPosition | null) => void;
  units: Units;
  profile: Profile;
  /** Set by the caddie to open the editor at a group (e.g. when an input needs fixing). */
  request: { group: Group; n: number } | null;
}

export function Conditions({ shot, update, pin, setPin, units: u, profile, request }: Props) {
  const [open, setOpenState] = useState(rememberedOpen);
  const [live, setLive] = useState<Live>({ phase: 'idle' });
  const setOpen = (v: boolean) => {
    rememberedOpen = v;
    setOpenState(v);
  };

  const reveal = (g: Group) => {
    setOpen(true);
    requestAnimationFrame(() => document.getElementById(`cond-${g}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  useEffect(() => {
    if (request) reveal(request.group);
  }, [request?.n]);

  const getLive = async () => {
    setLive({ phase: 'loading' });
    const r = await fetchLiveConditions();
    if (!r.ok) return setLive({ phase: 'error', reason: r.reason });
    const prevAim = live.phase === 'ok' ? live.aimingDeg : null;
    setLive({ phase: 'ok', data: r.conditions, aimingDeg: prevAim });
    update({
      temperatureF: Math.round(r.conditions.temperatureF),
      altitudeFt: r.conditions.altitudeFt !== null ? Math.round(r.conditions.altitudeFt) : shot.altitudeFt,
      wind: {
        speedMph: Math.min(50, Math.round(r.conditions.windMph)),
        fromDeg: prevAim !== null ? relativeWindDeg(r.conditions.windFromDeg, prevAim) : shot.wind.fromDeg,
      },
    });
  };
  const setAiming = (deg: number) => {
    if (live.phase !== 'ok') return;
    setLive({ ...live, aimingDeg: deg });
    update({ wind: { speedMph: shot.wind.speedMph, fromDeg: relativeWindDeg(live.data.windFromDeg, deg) } });
  };

  const windDisplay = Math.round(mphTo(shot.wind.speedMph, u.wind));
  const elevDisplay = Math.round(feetTo(shot.elevationFt, u.height));
  const air =
    shot.temperatureF === null && shot.altitudeFt === null
      ? 'Normal'
      : [
          shot.temperatureF !== null ? `${Math.round(fahrenheitTo(shot.temperatureF, u.temperature))}${tempLabel(u.temperature)}` : null,
          shot.altitudeFt !== null ? `${Math.round(feetTo(shot.altitudeFt, u.height)).toLocaleString()} ${heightLabel(u.height)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
  const green = [pin ? `Pin ${pinText(pin).toLowerCase()}` : null, shot.trouble.length ? `Trouble ${shot.trouble.join(', ')}` : null].filter(Boolean).join(' · ') || 'Not set';

  const chips: { g: Group; label: string; value: string; set: boolean }[] = [
    { g: 'wind', label: 'Wind', value: windText(shot.wind.speedMph, shot.wind.fromDeg, u), set: windDisplay > 0 },
    { g: 'elevation', label: 'Slope', value: elevDisplay === 0 ? 'Level' : `${elevDisplay > 0 ? 'Up' : 'Down'} ${Math.abs(elevDisplay)} ${heightLabel(u.height)}`, set: elevDisplay !== 0 },
    { g: 'lie', label: 'Lie', value: [LIES.find((l) => l.value === shot.lie)!.label, shot.stance === 'flat' ? null : STANCES.find((s) => s.value === shot.stance)!.label].filter(Boolean).join(' · '), set: shot.lie !== 'fairway' || shot.stance !== 'flat' },
    { g: 'air', label: 'Air', value: air, set: air !== 'Normal' },
    { g: 'green', label: 'Green', value: green, set: green !== 'Not set' },
  ];

  return (
    <section class="card conditions" aria-labelledby="conditions-title" data-testid="conditions">
      <div class="conditions-head">
        <h2 class="card-title" id="conditions-title">
          Conditions
        </h2>
        <button type="button" class="link" aria-expanded={open} aria-controls="conditions-panel" onClick={() => setOpen(!open)} data-testid="conditions-toggle">
          {open ? 'Done' : 'Edit'}
        </button>
      </div>
      <ul class="cond-chips" aria-label="Current conditions">
        {chips.map((c) => (
          <li key={c.g} class={c.g === 'green' ? 'wide' : undefined}>
            <button type="button" class={`cond-chip${c.set ? ' set' : ''}`} onClick={() => reveal(c.g)} data-testid={`cond-${c.g}-chip`}>
              <small>{c.label}</small>
              <span>{c.value}</span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div class="cond-panel" id="conditions-panel">
          <section class="cond-group" id="cond-wind" aria-labelledby="wind-label">
            <div class="field-head">
              <h3 class="field-label" id="wind-label">
                Wind
              </h3>
              <button type="button" class="btn small ghost" onClick={getLive} disabled={live.phase === 'loading'} data-testid="live-weather">
                {live.phase === 'loading' ? (
                  <>
                    <span class="spinner" aria-hidden="true" /> Getting weather…
                  </>
                ) : live.phase === 'ok' ? (
                  'Refresh live'
                ) : (
                  'Use live weather'
                )}
              </button>
            </div>
            <div aria-live="polite">
              {live.phase === 'error' && (
                <p class="banner warn" data-testid="live-error">
                  {CONDITIONS_FAILURE_TEXT[live.reason]}
                </p>
              )}
              {live.phase === 'ok' && (
                <div class="live" data-testid="live-ok">
                  <p>
                    Live: <strong>{Math.round(mphTo(live.data.windMph, u.wind))} {windLabel(u.wind)}</strong> from <strong>{compassName(live.data.windFromDeg)}</strong>
                    {live.data.gustMph !== null && live.data.gustMph > live.data.windMph + 4 && <> · gusts {Math.round(mphTo(live.data.gustMph, u.wind))}</>} ·{' '}
                    {Math.round(fahrenheitTo(live.data.temperatureF, u.temperature))}
                    {tempLabel(u.temperature)}
                  </p>
                  <p class="sub">{live.aimingDeg === null ? 'Which way are you hitting? That places the wind.' : 'Hitting toward'}</p>
                  <AimingPicker value={live.aimingDeg} onChange={setAiming} />
                  <p class="fine">Weather station wind at 10 m, from Open-Meteo. Wind on the course can differ.</p>
                </div>
              )}
            </div>
            <div class="wind-grid">
              <WindPicker fromDeg={shot.wind.fromDeg} onChange={(deg) => update({ wind: { ...shot.wind, fromDeg: deg } })} disabled={shot.wind.speedMph === 0} />
              <div class="wind-speed">
                <Stepper
                  label="Wind speed"
                  value={windDisplay}
                  step={u.wind === 'kmh' ? 5 : 2}
                  min={0}
                  max={Math.round(mphTo(50, u.wind))}
                  unit={windLabel(u.wind)}
                  describe={(v) => (v === 0 || v === null ? 'Calm' : `${v} ${windLabel(u.wind)}`)}
                  onChange={(v) => update({ wind: { ...shot.wind, speedMph: toMph(v ?? 0, u.wind) } })}
                />
                <Segmented
                  label="Quick wind speed"
                  value={String(windDisplay)}
                  options={(u.wind === 'kmh' ? [0, 10, 20, 30] : [0, 5, 10, 20]).map((n) => ({ value: String(n), label: n === 0 ? 'Calm' : String(n) }))}
                  onChange={(v) => update({ wind: { ...shot.wind, speedMph: toMph(Number(v), u.wind) } })}
                  columns={4}
                />
              </div>
            </div>
          </section>

          <section class="cond-group" id="cond-elevation" aria-labelledby="elevation-label">
            <div class="field-head">
              <h3 class="field-label" id="elevation-label">
                Slope to target
              </h3>
              <span class="field-hint">{elevDisplay === 0 ? 'Level' : elevDisplay > 0 ? 'Target above you' : 'Target below you'}</span>
            </div>
            <Stepper
              label="Elevation change"
              value={elevDisplay}
              step={u.height === 'm' ? 2 : 5}
              min={Math.round(feetTo(-300, u.height))}
              max={Math.round(feetTo(300, u.height))}
              unit={heightLabel(u.height)}
              describe={(v) => (!v ? 'Flat' : `${v > 0 ? 'Up' : 'Down'} ${Math.abs(v)} ${heightLabel(u.height)}`)}
              onChange={(v) => update({ elevationFt: toFeet(v ?? 0, u.height) })}
            />
          </section>

          <section class="cond-group" id="cond-lie" aria-labelledby="lie-label">
            <h3 class="field-label" id="lie-label">
              Lie
            </h3>
            <Segmented label="Lie" value={shot.lie} options={LIES} onChange={(lie) => update({ lie })} columns={4} />
            <h3 class="field-label">Stance</h3>
            <Segmented label="Stance" value={shot.stance} options={STANCES} onChange={(stance) => update({ stance })} columns={3} />
          </section>

          <section class="cond-group" id="cond-air" aria-labelledby="air-label">
            <h3 class="field-label" id="air-label">
              Air
            </h3>
            <div class="field-stack" id="temperature-section">
              <span class="field-hint">Temperature</span>
              <Stepper
                label="Temperature"
                value={shot.temperatureF === null ? null : Math.round(fahrenheitTo(shot.temperatureF, u.temperature))}
                step={u.temperature === 'C' ? 2 : 5}
                min={Math.round(fahrenheitTo(-10, u.temperature))}
                max={Math.round(fahrenheitTo(125, u.temperature))}
                unit={tempLabel(u.temperature)}
                seed={Math.round(fahrenheitTo(profile.baseline.temperatureF, u.temperature))}
                nullable
                describe={(v) => (v === null ? 'Normal' : `${v}${tempLabel(u.temperature)}`)}
                onChange={(v) => update({ temperatureF: v === null ? null : toFahrenheit(v, u.temperature) })}
              />
            </div>
            <div class="field-stack" id="altitude-section">
              <span class="field-hint">Course altitude</span>
              <Stepper
                label="Course altitude"
                value={shot.altitudeFt === null ? null : Math.round(feetTo(shot.altitudeFt, u.height))}
                step={u.height === 'm' ? 100 : 250}
                min={0}
                max={Math.round(feetTo(14000, u.height))}
                unit={heightLabel(u.height)}
                seed={Math.round(feetTo(profile.baseline.altitudeFt, u.height))}
                nullable
                describe={(v) => (v === null ? 'Same as home' : `${v.toLocaleString()} ${heightLabel(u.height)}`)}
                onChange={(v) => update({ altitudeFt: v === null ? null : toFeet(v, u.height) })}
              />
            </div>
          </section>

          <section class="cond-group" id="cond-green" aria-labelledby="green-label">
            <h3 class="field-label" id="green-label">
              The green
            </h3>
            <div class="green-grid">
              <PinPicker value={pin} onChange={setPin} />
              <div>
                <p class="sub">Trouble: tap where you can't miss</p>
                <TroublePicker value={shot.trouble} onChange={(trouble) => update({ trouble })} />
              </div>
            </div>
          </section>

          <button
            type="button"
            class="btn ghost wide"
            onClick={() => {
              setOpen(false);
              document.getElementById('recommendation-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <Icon name="check" size={20} /> Close conditions
          </button>
        </div>
      )}
    </section>
  );
}
