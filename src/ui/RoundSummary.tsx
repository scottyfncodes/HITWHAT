/** End-of-round summary, and the read-only view of any saved round. */
import { useState } from 'preact/hooks';
import { scoreDifferential } from '../core/handicap';
import { holeNumber, roundPar, roundPars, toParText, type Round } from '../core/round';
import { summarizeRound } from '../core/stats';
import { useApp } from './context';
import { Icon, longDate, Stat } from './kit';
import { TeeEditor } from './TeeEditor';

export function RoundSummaryView({ roundId, onClose }: { roundId: string; onClose: () => void }) {
  const { golf, updateGolf, handicap } = useApp();
  const [editing, setEditing] = useState(false);
  const r = golf.rounds.find((x) => x.id === roundId);
  if (!r) {
    return (
      <div class="stack">
        <button type="button" class="back-link" onClick={onClose}>
          <Icon name="back" size={18} /> Rounds
        </button>
      </div>
    );
  }
  const remove = () => {
    if (!confirm('Delete this round? It will also leave your stats and handicap estimate.')) return;
    updateGolf((g) => ({ ...g, rounds: g.rounds.filter((x) => x.id !== r.id), shots: g.shots.filter((s) => s.roundId !== r.id) }));
    onClose();
  };
  const row = handicap.rows.find((x) => x.roundIds.includes(r.id));
  const excluded = handicap.excluded.find((x) => x.roundId === r.id);

  return (
    <div class="stack" data-testid="round-summary">
      <button type="button" class="back-link" onClick={onClose}>
        <Icon name="back" size={18} /> Rounds
      </button>
      {r.source === 'manual' ? <ManualSummary r={r} /> : <PlayedSummary r={r} history={golf.rounds} />}

      <section class="card">
        <h2 class="card-title">Handicap</h2>
        {row ? (
          <p>
            Score differential <strong>{row.differential.toFixed(1)}</strong>
            {row.used ? ' · counts toward your estimate' : ''}
            {row.method !== '18' ? ' · 9-hole score, combined' : ''}.
          </p>
        ) : excluded?.reason === 'no-rating' ? (
          <p class="muted">Not counted: add the course rating and slope from the scorecard.</p>
        ) : excluded?.reason === 'incomplete' ? (
          <p class="muted">Not counted: only complete rounds count toward a handicap.</p>
        ) : excluded?.reason === 'unpaired-nine' ? (
          <p class="muted">Waiting for another 9-hole score to pair with.</p>
        ) : (
          <p class="muted">Not counted.</p>
        )}
        <button type="button" class="link" onClick={() => setEditing(!editing)} aria-expanded={editing}>
          {editing ? 'Done editing' : 'Edit course rating, slope & par'}
        </button>
        {editing && (
          <TeeEditor
            tee={r.tee}
            onChange={(tee) => updateGolf((g) => ({ ...g, rounds: g.rounds.map((x) => (x.id === r.id ? { ...x, tee: tee.par.length === x.tee.par.length ? tee : x.tee } : x)) }))}
          />
        )}
      </section>

      <button type="button" class="btn primary wide" onClick={onClose} data-testid="summary-done">
        Done
      </button>
      <button type="button" class="btn danger wide" onClick={remove}>
        Delete round
      </button>
    </div>
  );
}

function PlayedSummary({ r, history }: { r: Round; history: Round[] }) {
  const s = summarizeRound(r, history);
  const pars = roundPars(r);
  const nines = r.holeCount === 18 ? [r.holes.slice(0, 9), r.holes.slice(9)] : [r.holes];
  return (
    <>
      <section class="summary-hero">
        <p class="eyebrow">
          {r.courseName} · {longDate(r.date)}
        </p>
        <div class="summary-score">
          <strong data-testid="summary-score">{s.score}</strong>
          <span>
            {toParText(s.toPar)}
            {s.holes < r.holeCount && <small> · {s.holes} of {r.holeCount} holes</small>}
          </span>
        </div>
        {s.vsAverage !== null && (
          <p class="summary-vs">{s.vsAverage === 0 ? 'Right on your average' : s.vsAverage < 0 ? `${Math.abs(s.vsAverage).toFixed(1)} better than your average` : `${s.vsAverage.toFixed(1)} above your average`}</p>
        )}
      </section>

      <section class="stat-grid">
        <Stat label="Putts" value={s.putts ?? '–'} testid="summary-putts" />
        <Stat label="Greens" value={s.gir ?? '–'} />
        <Stat label="Fairways" value={s.fairways ?? '–'} />
        <Stat label="Penalties" value={s.penalties} />
      </section>

      <section class="card insight-list">
        {s.strongest && (
          <div>
            <span class="eyebrow">Strongest area</span>
            <p>{s.strongest}</p>
          </div>
        )}
        {s.opportunity && (
          <div>
            <span class="eyebrow">Biggest opportunity</span>
            <p>{s.opportunity}</p>
          </div>
        )}
        <div>
          <span class="eyebrow">Key takeaway</span>
          <p data-testid="summary-takeaway">{s.takeaway}</p>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Scorecard</h2>
        {nines.map((holes, n) => (
          <div class="scorecard" key={n} role="table" aria-label={n ? 'Back nine' : 'Front nine'}>
            <div role="row" class="sc-row sc-head">
              <span role="rowheader">Hole</span>
              {holes.map((_, i) => (
                <span role="cell" key={i}>
                  {holeNumber(r, n * 9 + i)}
                </span>
              ))}
            </div>
            <div role="row" class="sc-row">
              <span role="rowheader">Par</span>
              {holes.map((_, i) => (
                <span role="cell" key={i}>
                  {pars[n * 9 + i]}
                </span>
              ))}
            </div>
            <div role="row" class="sc-row sc-score">
              <span role="rowheader">Score</span>
              {holes.map((h, i) => {
                const d = h.strokes === null ? null : h.strokes - (pars[n * 9 + i] ?? 4);
                return (
                  <span role="cell" key={i} class={d === null ? '' : d < 0 ? 'under' : d === 0 ? '' : d === 1 ? 'over' : 'over2'}>
                    {h.strokes ?? '·'}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function ManualSummary({ r }: { r: Round }) {
  const par = roundPar(r);
  const diff = r.manualScore !== null && r.tee.rating !== null && r.tee.slope !== null ? scoreDifferential(r.manualScore, r.holeCount === 9 ? r.tee.rating / 2 : r.tee.rating, r.tee.slope) : null;
  return (
    <section class="summary-hero">
      <p class="eyebrow">
        {r.courseName} · {longDate(r.date)} · score only
      </p>
      <div class="summary-score">
        <strong data-testid="summary-score">{r.manualScore ?? '–'}</strong>
        <span>{r.manualScore !== null ? toParText(r.manualScore - par) : ''}</span>
      </div>
      <p class="summary-vs">
        {r.holeCount} holes{r.tee.rating !== null ? ` · rating ${r.tee.rating} / slope ${r.tee.slope}` : ''}
        {diff !== null && r.holeCount === 18 ? ` · differential ${diff.toFixed(1)}` : ''}
      </p>
    </section>
  );
}
