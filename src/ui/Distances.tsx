/**
 * Your distances: the bag as a ladder (what the caddie uses for each club,
 * where that number came from, and the gaps), a practice plan read from it,
 * and a range session for logging carries quickly.
 */
import { useMemo, useState } from 'preact/hooks';
import { distanceLadder, practicePlan, type LadderRow, type PracticeItem } from '../core/gapping';
import { clubStats as statsOf, MIN_SHOTS_TO_LEARN, type ShotRecord } from '../core/shots';
import { distanceLabel, toYards, yardsTo, type Units } from '../core/units';
import { newId } from '../state/golf';
import { NumberField, Segmented } from './controls';
import { useApp } from './context';
import { Icon, Sheet } from './kit';

const MIN_YDS = 20;
const MAX_YDS = 400;

/** The ladder rows and plan for the current bag. */
export function useLadder() {
  const { profile, clubs, clubStats, learned, units } = useApp();
  return useMemo(() => {
    const rows = distanceLadder(profile.clubs, clubs, clubStats, learned);
    const unit = distanceLabel(units.distance);
    const plan = practicePlan(rows, { label: (c) => c.name, dist: (y) => `${Math.round(yardsTo(y, units.distance))} ${unit}` });
    return { rows, plan };
  }, [profile.clubs, clubs, clubStats, learned, units.distance]);
}

const shown = (yd: number, u: Units) => Math.round(yardsTo(yd, u.distance));

export function DistanceLadder({ rows }: { rows: LadderRow[] }) {
  const { units: u } = useApp();
  if (!rows.length) return <p class="muted">Add clubs and their carries in your bag to see your distances.</p>;
  const unit = distanceLabel(u.distance);
  // A dot plot on a shared axis: no bar from zero, so small gaps stay visible.
  const lows = rows.map((r) => Math.min(r.number, r.band?.lo ?? r.number));
  const highs = rows.map((r) => Math.max(r.number, r.band?.hi ?? r.number));
  const lo = Math.max(0, Math.floor((Math.min(...lows) - 8) / 10) * 10);
  const hi = Math.ceil((Math.max(...highs) + 8) / 10) * 10;
  const pos = (yd: number) => `${(((yd - lo) / (hi - lo)) * 100).toFixed(2)}%`;
  return (
    <ol class="ladder" data-testid="ladder" aria-label="Your distances, longest club first">
      {rows.map((r) => (
        <li key={r.club.id} class="ladder-item">
          <div class="ladder-row" data-testid={`ladder-${r.club.id}`}>
            <span class="ladder-club">
              <strong>{r.club.short}</strong>
              <small>{r.basis === 'tracked' ? `${r.stat!.count} shots` : 'Typed'}</small>
            </span>
            <span class="ladder-track" aria-hidden="true">
              {r.band && <span class="ladder-band" style={{ left: pos(r.band.lo), width: `calc(${pos(r.band.hi)} - ${pos(r.band.lo)})` }} />}
              <span class={`ladder-dot ${r.basis}`} style={{ left: pos(r.number) }} />
            </span>
            <span class="ladder-num">
              {shown(r.number, u)}
              <span class="visually-hidden">
                {' '}
                {unit}, {r.club.name}, {r.basis === 'tracked' ? `your average from ${r.stat!.count} shots` : 'typed carry'}
                {r.band ? `, usually ${shown(r.band.lo, u)} to ${shown(r.band.hi, u)}` : ''}
              </span>
            </span>
          </div>
          {r.gapFlag && r.gapToNext !== null && (
            <p class={`ladder-gap ${r.gapFlag}`} data-testid="ladder-gap">
              {r.gapFlag === 'wide' ? `${shown(r.gapToNext, u)} ${unit} gap — no full swing for this` : r.gapToNext <= 0 ? 'Same distance as the next club' : `Only ${shown(r.gapToNext, u)} ${unit} to the next club`}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Stats card: the ladder, with a way to log more shots. */
export function DistancesCard() {
  const { openSettings, openPractice } = useApp();
  const { rows } = useLadder();
  const tracked = rows.filter((r) => r.basis === 'tracked').length;
  return (
    <section class="card" data-testid="distances">
      <div class="field-head">
        <h2 class="card-title">Your distances</h2>
        <button type="button" class="link" onClick={openSettings}>
          Edit bag
        </button>
      </div>
      <DistanceLadder rows={rows} />
      <ul class="ladder-legend" aria-hidden="true">
        <li>
          <span class="ladder-dot tracked" /> Your average
        </li>
        <li>
          <span class="ladder-dot typed" /> Typed carry
        </li>
        <li>
          <span class="ladder-band" /> 2 in 3 shots
        </li>
      </ul>
      <p class="fine">
        {tracked
          ? `${tracked} club${tracked === 1 ? '' : 's'} use${tracked === 1 ? 's' : ''} your own average (${MIN_SHOTS_TO_LEARN}+ full shots). GPS-tracked shots include roll, so woods keep your typed carry.`
          : `Each club uses the carry you typed until it has ${MIN_SHOTS_TO_LEARN} full shots logged — then the caddie switches to your real average.`}
      </p>
      <button type="button" class="btn wide" onClick={() => openPractice()} data-testid="open-practice">
        <Icon name="plus" size={20} /> Log range shots
      </button>
    </section>
  );
}

/** Stats card: what to practise next, read straight off the ladder. */
export function PracticePlanCard() {
  const { openPractice } = useApp();
  const { plan } = useLadder();
  if (!plan.length) return null;
  return (
    <section class="card" data-testid="practice-plan">
      <h2 class="card-title">Next range session</h2>
      <ol class="plan-steps">
        {plan.map((p, i) => (
          <PlanStep key={p.kind} item={p} n={i + 1} onStart={() => openPractice(p.clubIds[0])} />
        ))}
      </ol>
    </section>
  );
}

function PlanStep({ item, n, onStart }: { item: PracticeItem; n: number; onStart: () => void }) {
  return (
    <li class="plan-step">
      <span class="plan-n" aria-hidden="true">
        {n}
      </span>
      <div>
        <strong>{item.title}</strong>
        <p class="muted">{item.detail}</p>
        <button type="button" class="link" onClick={onStart}>
          Start logging
        </button>
      </div>
    </li>
  );
}

/** Log carries one after another: pick a club, type the number, tap Log. */
export function RangeSession({ onClose, startClub }: { onClose: () => void; startClub: string | null }) {
  const { profile, golf, updateGolf, clubs, units: u } = useApp();
  const bag = clubs.filter((c) => c.inBag && c.carry > 0).sort((a, b) => b.carry - a.carry);
  const [clubId, setClubId] = useState(() => (startClub && bag.some((c) => c.id === startClub) ? startClub : bag.find((c) => c.id === '7i')?.id ?? bag[0]?.id ?? ''));
  const [carry, setCarry] = useState<number | null>(null);
  const [full, setFull] = useState<'full' | 'mishit'>('full');
  const [ids, setIds] = useState<string[]>([]);
  const unit = distanceLabel(u.distance);
  const club = bag.find((c) => c.id === clubId) ?? null;
  const yds = carry === null ? null : toYards(carry, u.distance);
  const valid = yds !== null && yds >= MIN_YDS && yds <= MAX_YDS;

  const session = golf.shots.filter((s) => ids.includes(s.id));
  const allStats = statsOf(golf.shots);
  const st = club ? allStats.get(club.id) : undefined;
  const count = st?.count ?? 0;

  const log = () => {
    if (!club || !valid) return;
    const s: ShotRecord = { id: newId(), at: Date.now(), clubId: club.id, distance: Math.round(yds!), source: 'manual', full: full === 'full', roundId: null, hole: null, from: null };
    updateGolf((g) => ({ ...g, shots: [...g.shots, s] }));
    setIds((xs) => [...xs, s.id]);
    setCarry(null);
    requestAnimationFrame(() => document.getElementById('range-carry')?.focus());
  };
  const undo = (id: string) => {
    updateGolf((g) => ({ ...g, shots: g.shots.filter((s) => s.id !== id) }));
    setIds((xs) => xs.filter((x) => x !== id));
  };
  const nudge = (d: number) => {
    const base = carry ?? (club ? Math.round(yardsTo(club.carry, u.distance)) : 150);
    setCarry(Math.max(1, Math.min(Math.round(yardsTo(MAX_YDS, u.distance)), base + d)));
  };

  // This session, grouped by club in bag order.
  const byClub = bag
    .map((c) => ({ c, list: session.filter((s) => s.clubId === c.id) }))
    .filter((x) => x.list.length)
    .map(({ c, list }) => {
      const fulls = list.filter((s) => s.full && s.distance !== null).map((s) => s.distance!);
      return { c, list, avg: fulls.length ? fulls.reduce((a, b) => a + b, 0) / fulls.length : null };
    });

  return (
    <Sheet title="Range session" onClose={onClose} testid="range-session">
      <section class="card">
        <h3 class="field-label" id="range-club-label">
          Club
        </h3>
        <Segmented label="Club" value={clubId} options={bag.map((c) => ({ value: c.id, label: c.short }))} onChange={(v) => setClubId(v)} columns={5} />
        {club && (
          <p class="muted" data-testid="range-club-status">
            {club.name}: {count >= MIN_SHOTS_TO_LEARN ? (
              <>
                your average is <strong>{Math.round(yardsTo(st!.recent, u.distance))} {unit}</strong> from {count} shots
                {!profile.learnFromShots && ' (the caddie is set to use your typed carries)'}.
              </>
            ) : (
              <>
                {count} of {MIN_SHOTS_TO_LEARN} full shots logged — {MIN_SHOTS_TO_LEARN - count} more and the caddie uses your real number.
              </>
            )}
          </p>
        )}
      </section>

      <form
        class="card"
        onSubmit={(e) => {
          e.preventDefault();
          log();
        }}
      >
        <label class="field-label" for="range-carry">
          Carry
        </label>
        <div class="distance-row">
          <button type="button" class="step big" aria-label="Minus 1" onClick={() => nudge(-1)}>
            −1
          </button>
          <div class="distance-input-wrap">
            <NumberField
              id="range-carry"
              label={`Carry in ${unit}`}
              value={carry}
              min={Math.round(yardsTo(MIN_YDS, u.distance))}
              max={Math.round(yardsTo(MAX_YDS, u.distance))}
              class="distance-input"
              placeholder={club ? String(Math.round(yardsTo(club.carry, u.distance))) : '150'}
              onChange={setCarry}
              onEnter={log}
            />
            <span class="distance-unit">{unit}</span>
          </div>
          <button type="button" class="step big" aria-label="Plus 1" onClick={() => nudge(1)}>
            +1
          </button>
        </div>
        <Segmented
          label="Shot quality"
          value={full}
          options={[
            { value: 'full', label: 'Good full swing' },
            { value: 'mishit', label: 'Mishit' },
          ]}
          onChange={setFull}
          columns={2}
        />
        <button type="submit" class="btn primary wide" disabled={!club || !valid} data-testid="log-range-shot">
          Log {club?.short ?? 'shot'}
          {valid ? ` · ${carry} ${unit}` : ''}
        </button>
        {carry !== null && !valid && (
          <p class="error-text" role="alert">
            Enter a carry between {Math.round(yardsTo(MIN_YDS, u.distance))} and {Math.round(yardsTo(MAX_YDS, u.distance))} {unit}.
          </p>
        )}
        <p class="fine">Log the carry from a launch monitor, or to a range flag whose yardage you know. Range balls can fly shorter than your own ball. Mishits are saved but never count toward your averages.</p>
      </form>

      <section class="card" aria-live="polite" data-testid="range-log">
        <h3 class="card-title">This session</h3>
        {byClub.length === 0 ? (
          <p class="muted">Shots you log appear here. Each one is saved straight away.</p>
        ) : (
          <ul class="range-groups">
            {byClub.map(({ c, list, avg }) => (
              <li key={c.id}>
                <div class="range-group-head">
                  <strong>{c.name}</strong>
                  <span class="muted">
                    {list.length} shot{list.length === 1 ? '' : 's'}
                    {avg !== null && ` · avg ${Math.round(yardsTo(avg, u.distance))} ${unit}`}
                  </span>
                </div>
                <ul class="range-shots">
                  {list.map((s) => (
                    <li key={s.id}>
                      <button type="button" class={`range-shot${s.full ? '' : ' mishit'}`} onClick={() => undo(s.id)} aria-label={`Remove ${c.name} ${Math.round(yardsTo(s.distance ?? 0, u.distance))} ${unit}${s.full ? '' : ' mishit'}`}>
                        {Math.round(yardsTo(s.distance ?? 0, u.distance))}
                        <Icon name="close" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {byClub.length > 0 && <p class="fine">Tap a number to remove it.</p>}
      </section>
    </Sheet>
  );
}
