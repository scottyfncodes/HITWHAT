/** ROUND: the heart of the app. Start, score hole by hole with feedback, finish with a summary. */
import { useState } from 'preact/hooks';
import { fmtDistance } from '../core/format';
import {
  holeFeedback,
  holeGir,
  holeNumber,
  holeStrokeIndex,
  holeYardage,
  isPlayed,
  nextUnplayed,
  roundPars,
  roundScore,
  roundTotals,
  scoreName,
  toParText,
  type FairwayResult,
  type HoleFeedback,
  type HoleScore,
  type Round,
} from '../core/round';
import { playerStats } from '../core/stats';
import { distanceLabel } from '../core/units';
import { AddScoreSheet } from './AddScore';
import { useApp } from './context';
import { Empty, Icon, longDate, shortDate } from './kit';
import { RoundSummaryView } from './RoundSummary';
import { ShotTracker } from './ShotTracker';
import { StartRound } from './StartRound';

export function RoundTab() {
  const { active } = useApp();
  const [viewing, setViewing] = useState<string | null>(null);
  if (viewing) return <RoundSummaryView roundId={viewing} onClose={() => setViewing(null)} />;
  if (active) return <ActiveRound round={active} onFinished={(id) => setViewing(id)} />;
  return <RoundHome onOpen={setViewing} />;
}

function RoundHome({ onOpen }: { onOpen: (id: string) => void }) {
  const { golf, handicap, profile, go, openPractice } = useApp();
  const [starting, setStarting] = useState(false);
  const [adding, setAdding] = useState(false);
  const done = golf.rounds.filter((r) => r.status === 'complete').sort((a, b) => b.date - a.date);
  const stats = playerStats(golf.rounds);

  return (
    <div class="stack">
      <section class="hero-start">
        <p class="eyebrow">{done.length ? 'Ready for the next one?' : 'Ready to play?'}</p>
        <h1>{done.length ? 'Start a round' : 'Play a round with your caddie'}</h1>
        <p class="lede">Score each hole in a couple of taps. HitWhat gives feedback as you go and learns your game.</p>
        <button type="button" class="btn primary wide" onClick={() => setStarting(true)} data-testid="start-round">
          <Icon name="flag" size={22} /> Start a round
        </button>
        <button type="button" class="btn ghost wide" onClick={() => setAdding(true)} data-testid="add-past-score">
          Add a past score
        </button>
      </section>

      <section class="tiles">
        <button type="button" class="tile" onClick={() => go('handicap')} data-testid="tile-handicap">
          <span class="stat-label">{profile.officialIndex !== null ? 'Official index' : 'HitWhat estimate'}</span>
          <span class="stat-value">{profile.officialIndex ?? handicap.estimate ?? '—'}</span>
          <span class="stat-sub">{profile.officialIndex !== null ? 'Entered by you' : handicap.estimate !== null ? 'Handicap estimate' : `${handicap.needed} more score${handicap.needed === 1 ? '' : 's'} needed`}</span>
        </button>
        <button type="button" class="tile" onClick={() => go('stats')}>
          <span class="stat-label">Scoring average</span>
          <span class="stat-value">{stats.scoringAvg !== null ? stats.scoringAvg.toFixed(1) : '—'}</span>
          <span class="stat-sub">{stats.rounds ? `${stats.rounds} round${stats.rounds === 1 ? '' : 's'}` : 'No rounds yet'}</span>
        </button>
        <button type="button" class="tile tile-wide" onClick={() => openPractice()} data-testid="tile-practice">
          <span class="tile-icon" aria-hidden="true">
            <Icon name="caddie" />
          </span>
          <span>
            <strong>Range session</strong>
            <span class="stat-sub">Log carries, see your gaps</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      </section>

      {done.length > 0 ? (
        <section class="card">
          <h2 class="card-title">Recent rounds</h2>
          <ul class="round-list" data-testid="round-list">
            {done.slice(0, 12).map((r) => {
              const score = roundScore(r);
              const t = r.source === 'app' ? roundTotals(r) : null;
              const shown = score ?? t?.strokes ?? null;
              const par = r.source === 'manual' ? null : t;
              return (
                <li key={r.id}>
                  <button type="button" class="round-row" onClick={() => onOpen(r.id)}>
                    <span class="round-score">{shown ?? '—'}</span>
                    <span class="round-meta">
                      <strong>{r.courseName}</strong>
                      <small>
                        {shortDate(r.date)} · {r.holeCount} holes
                        {par && par.holesPlayed < r.holeCount ? ` · ${par.holesPlayed} played` : ''}
                        {r.source === 'manual' ? ' · score only' : ''}
                      </small>
                    </span>
                    {par && par.holesPlayed > 0 && <span class="round-topar">{toParText(par.toPar)}</span>}
                    <Icon name="chevron" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <Empty icon="round" title="Your rounds will show up here">
          <p class="muted">Each round feeds your stats, your handicap estimate and the caddie’s advice.</p>
        </Empty>
      )}

      {starting && <StartRound onClose={() => setStarting(false)} onStarted={() => setStarting(false)} />}
      {adding && <AddScoreSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

function ActiveRound({ round, onFinished }: { round: Round; onFinished: (id: string) => void }) {
  const { updateGolf, profile, units, go, setShot } = useApp();
  const [feedback, setFeedback] = useState<{ idx: number; fb: HoleFeedback } | null>(null);
  const [menu, setMenu] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const idx = round.current;
  const pars = roundPars(round);
  const par = pars[idx] ?? 4;
  const h = round.holes[idx];
  const number = holeNumber(round, idx);
  const yards = holeYardage(round, idx);
  const si = holeStrokeIndex(round, idx);
  const totals = roundTotals(round);
  const isLast = idx === round.holeCount - 1;

  const patchRound = (fn: (r: Round) => Round) => updateGolf((g) => ({ ...g, rounds: g.rounds.map((r) => (r.id === round.id ? fn(r) : r)) }));
  const patchHole = (patch: Partial<HoleScore>) => patchRound((r) => ({ ...r, holes: r.holes.map((x, i) => (i === idx ? { ...x, ...patch } : x)) }));
  const goTo = (i: number) => {
    patchRound((r) => ({ ...r, current: i }));
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finish = () => {
    patchRound((r) => ({ ...r, status: 'complete' }));
    onFinished(round.id);
  };

  const saveHole = () => {
    // The hole is already saved on every tap; this records feedback and moves on.
    const fb = holeFeedback(round, idx);
    if (fb) setFeedback({ idx, fb });
    const remaining = nextUnplayed(round);
    if (remaining === null) return finish();
    const nxt = round.holes.findIndex((x, i) => i > idx && !isPlayed(x));
    goTo(nxt !== -1 ? nxt : remaining);
  };

  const askCaddie = () => {
    if (yards !== null && par === 3) setShot((s) => ({ ...s, distance: yards, lie: 'tee' }));
    go('caddie');
  };

  const quick = [par - 1, par, par + 1, par + 2, par + 3].filter((n) => n >= 1);
  const gir = holeGir(h, par);
  const bag = profile.clubs.filter((c) => c.inBag);

  return (
    <div class="stack round-active">
      <header class="hole-head">
        <div>
          <p class="eyebrow">
            {round.courseName} · {round.tee.name}
          </p>
          <h1 class="hole-number" data-testid="hole-number">
            Hole {number}
          </h1>
          <p class="hole-meta">
            Par {par}
            {yards !== null && ` · ${fmtDistance(yards, units)} ${distanceLabel(units.distance)}`}
            {si !== null && ` · Index ${si}`}
          </p>
        </div>
        <div class="hole-score" data-testid="running-score">
          <span class="stat-label">Score</span>
          <strong>{totals.holesPlayed ? toParText(totals.toPar) : 'E'}</strong>
          <small>{totals.holesPlayed ? `thru ${totals.holesPlayed} · ${totals.strokes}` : 'not started'}</small>
        </div>
      </header>

      <nav class="hole-strip" aria-label="Holes">
        {round.holes.map((x, i) => {
          const d = x.strokes !== null ? x.strokes - (pars[i] ?? 4) : null;
          const cls = d === null ? '' : d < 0 ? ' under' : d === 0 ? ' even' : d === 1 ? ' over' : ' over2';
          return (
            <button key={i} type="button" class={`hole-dot${cls}${i === idx ? ' on' : ''}`} aria-label={`Hole ${holeNumber(round, i)}${x.strokes !== null ? `, ${x.strokes}` : ''}`} aria-current={i === idx ? 'step' : undefined} onClick={() => goTo(i)}>
              <small>{holeNumber(round, i)}</small>
              <span>{x.strokes ?? '·'}</span>
            </button>
          );
        })}
      </nav>

      {feedback && feedback.idx !== idx && (
        <div class={`feedback tone-${feedback.fb.tone}`} role="status" data-testid="hole-feedback">
          <div>
            <strong>
              Hole {holeNumber(round, feedback.idx)}: {feedback.fb.headline}
            </strong>
            <p>{feedback.fb.detail}</p>
          </div>
          <button type="button" class="icon-btn small" aria-label="Dismiss" onClick={() => setFeedback(null)}>
            <Icon name="close" size={18} />
          </button>
        </div>
      )}

      <section class="card score-card" aria-label="Score">
        <div class="field-head">
          <h2 class="field-label">Score</h2>
          <span class="field-hint" data-testid="score-name">
            {h.strokes !== null ? scoreName(h.strokes, par) : 'Tap your score'}
          </span>
        </div>
        <div class="score-pick" role="radiogroup" aria-label="Strokes">
          {quick.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={h.strokes === n} class={`score-btn${h.strokes === n ? ' on' : ''}${n === par ? ' is-par' : ''}`} onClick={() => patchHole({ strokes: n })}>
              {n}
            </button>
          ))}
        </div>
        <div class="score-adjust">
          <button type="button" class="step" aria-label="One fewer stroke" disabled={!h.strokes || h.strokes <= 1} onClick={() => patchHole({ strokes: Math.max(1, (h.strokes ?? par) - 1) })}>
            −
          </button>
          <output aria-live="polite" class={h.strokes === null ? 'unset' : undefined}>{h.strokes ?? 'More'}</output>
          <button type="button" class="step" aria-label="One more stroke" disabled={(h.strokes ?? 0) >= 20} onClick={() => patchHole({ strokes: Math.min(20, (h.strokes ?? par) + 1) })}>
            +
          </button>
        </div>
      </section>

      <section class="card" aria-label="Putts">
        <h2 class="field-label">Putts</h2>
        <div class="chips" role="radiogroup" aria-label="Putts" style={{ '--cols': 5 }}>
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={h.putts === n} class={`chip${h.putts === n ? ' on' : ''}`} onClick={() => patchHole({ putts: n })}>
              {n === 4 ? '4+' : n}
            </button>
          ))}
        </div>
      </section>

      {par >= 4 && (
        <section class="card" aria-label="Tee shot">
          <h2 class="field-label">Tee shot</h2>
          <div class="chips fairway" role="radiogroup" aria-label="Fairway" style={{ '--cols': 4 }}>
            {(
              [
                { v: 'left', label: '← Left' },
                { v: 'hit', label: 'Fairway' },
                { v: 'right', label: 'Right →' },
                { v: 'short', label: 'Short' },
              ] as { v: FairwayResult; label: string }[]
            ).map((o) => (
              <button key={o.v} type="button" role="radio" aria-checked={h.fairway === o.v} class={`chip${h.fairway === o.v ? ' on' : ''}`} onClick={() => patchHole({ fairway: h.fairway === o.v ? null : o.v })}>
                {o.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section class="card compact-rows">
        <div class="row-line">
          <span>
            <strong>Green in regulation</strong>
            <small>{h.gir === null ? (gir === null ? 'Set from score and putts' : 'Worked out from score and putts') : 'Set by you'}</small>
          </span>
          <div class="chips mini" role="radiogroup" aria-label="Green in regulation" style={{ '--cols': 2 }}>
            {[true, false].map((v) => (
              <button key={String(v)} type="button" role="radio" aria-checked={gir === v} class={`chip${gir === v ? ' on' : ''}`} onClick={() => patchHole({ gir: h.gir === v ? null : v })}>
                {v ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
        </div>
        <div class="row-line">
          <span>
            <strong>Penalty strokes</strong>
          </span>
          <div class="stepper small" role="group" aria-label="Penalty strokes">
            <button type="button" class="step" aria-label="Fewer penalties" disabled={h.penalties <= 0} onClick={() => patchHole({ penalties: Math.max(0, h.penalties - 1) })}>
              −
            </button>
            <output class="step-value" data-testid="penalties">
              {h.penalties}
            </output>
            <button type="button" class="step" aria-label="More penalties" onClick={() => patchHole({ penalties: Math.min(10, h.penalties + 1) })}>
              +
            </button>
          </div>
        </div>
      </section>

      <details class="card" open={moreOpen} onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>
          <span class="card-title">Club, shots & notes</span>
          <span class="muted">{[h.teeClub && profile.clubs.find((c) => c.id === h.teeClub)?.short, h.note && 'note'].filter(Boolean).join(' · ') || 'Optional'}</span>
        </summary>
        <label class="inline-select">
          <span>{par === 3 ? 'Club off the tee' : 'Tee club'}</span>
          <select value={h.teeClub ?? ''} aria-label="Club off the tee" onChange={(e) => patchHole({ teeClub: (e.currentTarget as HTMLSelectElement).value || null })}>
            <option value="">—</option>
            {bag.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <textarea class="note" rows={2} maxLength={280} placeholder="Notes (pin back left, greens fast…)" value={h.note} onInput={(e) => patchHole({ note: (e.currentTarget as HTMLTextAreaElement).value })} aria-label="Hole notes" />
        <h3 class="field-label">Track shots with GPS</h3>
        <ShotTracker hole={number} defaultClub={h.teeClub} />
      </details>

      <div class="round-actions">
        <button type="button" class="btn ghost" onClick={askCaddie} data-testid="ask-caddie">
          <Icon name="caddie" size={20} /> Caddie
        </button>
        <button type="button" class="btn primary grow" disabled={h.strokes === null} onClick={saveHole} data-testid="save-hole">
          {h.strokes === null ? 'Enter a score' : nextUnplayed(round) === null ? 'Finish round' : isLast ? 'Save hole' : `Save · Hole ${holeNumber(round, idx + 1)}`}
        </button>
      </div>

      <div class="round-footer">
        <button type="button" class="link" onClick={() => setMenu(!menu)} aria-expanded={menu} data-testid="round-menu">
          Round options
        </button>
        {menu && (
          <div class="round-menu">
            <button type="button" class="btn ghost" onClick={finish} data-testid="finish-early">
              Finish round now ({totals.holesPlayed} of {round.holeCount} holes)
            </button>
            <button
              type="button"
              class="btn danger"
              onClick={() => {
                if (confirm('Delete this round? This can’t be undone.')) updateGolf((g) => ({ ...g, rounds: g.rounds.filter((r) => r.id !== round.id) }));
              }}
            >
              Delete this round
            </button>
            <p class="fine">Started {longDate(round.date)}. Saved on this phone after every tap, even with no signal.</p>
          </div>
        )}
      </div>
    </div>
  );
}
