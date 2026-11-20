/**
 * HANDICAP: a HitWhat estimate built from your rounds, kept clearly apart from
 * an official Handicap Index (which only an authorised association can issue).
 */
import { useState } from 'preact/hooks';
import { courseHandicap, explainEstimate } from '../core/handicap';
import { AddScoreSheet } from './AddScore';
import { useApp } from './context';
import { Icon, longDate, SectionTitle, shortDate, Trend } from './kit';

export function HandicapTab() {
  const { handicap: rep, profile, setProfile, golf } = useApp();
  const [adding, setAdding] = useState(false);
  const [editOfficial, setEditOfficial] = useState(false);
  const [officialText, setOfficialText] = useState(profile.officialIndex?.toString() ?? '');
  const [chCourse, setChCourse] = useState<string>(golf.courses[0]?.id ?? '');
  const [chTee, setChTee] = useState(0);
  const [chUse, setChUse] = useState<'estimate' | 'official'>(profile.officialIndex !== null ? 'official' : 'estimate');

  const total = rep.rows.length;
  const plusIndex = (n: number) => (n < 0 ? `+${Math.abs(n).toFixed(1)}` : n.toFixed(1));
  const saveOfficial = () => {
    const v = parseFloat(officialText.replace('+', '-'));
    const ok = officialText.trim() === '' || (Number.isFinite(v) && v >= -10 && v <= 54);
    if (!ok) return;
    setProfile((p) => ({ ...p, officialIndex: officialText.trim() === '' ? null : Math.round(v * 10) / 10 }));
    setEditOfficial(false);
  };

  const course = golf.courses.find((c) => c.id === chCourse);
  const tee = course?.tees[chTee] ?? course?.tees[0];
  const chIndex = chUse === 'official' ? profile.officialIndex : rep.estimate;
  const chPar = tee ? tee.par.reduce((a, b) => a + b, 0) : null;
  const ch =
    tee && chIndex !== null && tee.rating !== null && tee.slope !== null && chPar !== null
      ? tee.par.length === 18
        ? courseHandicap(chIndex, tee.slope, tee.rating, chPar)
        : null
      : null;

  return (
    <div class="stack">
      <section class="hcp-hero" data-testid="hcp-estimate">
        <p class="eyebrow">HitWhat estimate</p>
        {rep.estimate !== null ? (
          <>
            <p class="hcp-number" data-testid="hcp-number">
              {plusIndex(rep.estimate)}
            </p>
            <p class="hcp-sub">
              {explainEstimate(rep)} {total < 20 ? `It firms up as you reach 20 scores (${total} so far).` : ''}
            </p>
          </>
        ) : (
          <>
            <p class="hcp-sub" data-testid="hcp-missing">
              {total === 0 && rep.excluded.length === 0
                ? 'No handicap yet? Add 3 scores with the course rating and slope, and HitWhat will estimate one.'
                : `Add ${rep.needed} more score${rep.needed === 1 ? '' : 's'} with course rating and slope to get an estimate.`}
            </p>
            <div class="progress-dots" role="img" aria-label={`${total} of 3 scores`}>
              {[0, 1, 2].map((i) => (
                <span key={i} class={i < total ? 'on' : ''} />
              ))}
            </div>
          </>
        )}
        <p class="fine">Not an official Handicap Index. Calculated on this phone with the World Handicap System formulas, but without your association’s scoring record or daily playing-conditions adjustment.</p>
        <button type="button" class="btn primary wide" onClick={() => setAdding(true)} data-testid="hcp-add">
          <Icon name="plus" size={20} /> Add a past score
        </button>
      </section>

      {rep.trend.length >= 2 && (
        <section class="card">
          <h2 class="card-title">Trend</h2>
          <Trend
            label="Estimate after each score"
            points={rep.trend.slice(-20).map((p) => ({ x: p.date, y: p.index, title: `${shortDate(p.date)}: ${plusIndex(p.index)}` }))}
            format={(n) => plusIndex(n)}
            testid="hcp-trend"
          />
          {rep.lowIndex !== null && <p class="fine">Lowest estimate so far: {plusIndex(rep.lowIndex)}.</p>}
        </section>
      )}

      <section class="card official" data-testid="hcp-official">
        <div class="field-head">
          <h2 class="card-title">Official Handicap Index</h2>
          {!editOfficial && (
            <button type="button" class="link" onClick={() => setEditOfficial(true)} data-testid="edit-official">
              {profile.officialIndex === null ? 'Enter' : 'Edit'}
            </button>
          )}
        </div>
        {editOfficial ? (
          <div class="row">
            <input
              class="text-input"
              inputMode="decimal"
              placeholder="e.g. 14.3"
              value={officialText}
              aria-label="Official Handicap Index"
              onInput={(e) => setOfficialText((e.currentTarget as HTMLInputElement).value)}
              data-testid="official-input"
            />
            <button type="button" class="btn" onClick={saveOfficial} data-testid="official-save">
              Save
            </button>
          </div>
        ) : (
          <p class={`official-value${profile.officialIndex === null ? ' none' : ''}`}>{profile.officialIndex !== null ? plusIndex(profile.officialIndex) : 'Not entered'}</p>
        )}
        <p class="fine">Only your golf association can issue an official index. If you have one, enter it from your club or association app. HitWhat uses it for strategy but never changes it.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Course handicap</h2>
        {golf.courses.length === 0 ? (
          <p class="muted">Save a course with rating and slope (start a round or add it from a score) to see how many strokes you get.</p>
        ) : (
          <>
            <div class="form-grid">
              <label class="field-stack">
                <span>Course</span>
                <select
                  class="text-input"
                  value={chCourse}
                  onChange={(e) => {
                    setChCourse((e.currentTarget as HTMLSelectElement).value);
                    setChTee(0);
                  }}
                  aria-label="Course for course handicap"
                >
                  {golf.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {course && course.tees.length > 1 && (
                <label class="field-stack">
                  <span>Tees</span>
                  <select class="text-input" value={chTee} onChange={(e) => setChTee(Number((e.currentTarget as HTMLSelectElement).value))} aria-label="Tees">
                    {course.tees.map((t, i) => (
                      <option key={i} value={i}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {profile.officialIndex !== null && rep.estimate !== null && (
              <div class="chips" role="radiogroup" aria-label="Index to use" style={{ '--cols': 2 }}>
                {(['official', 'estimate'] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={chUse === k} class={`chip${chUse === k ? ' on' : ''}`} onClick={() => setChUse(k)}>
                    {k === 'official' ? 'Official index' : 'HitWhat estimate'}
                  </button>
                ))}
              </div>
            )}
            {ch !== null ? (
              <p class="ch-result" data-testid="course-handicap">
                <strong>{ch < 0 ? `+${Math.abs(ch)}` : ch}</strong> strokes from the {tee!.name} tees
                <small>
                  {plusIndex(chIndex!)} × {tee!.slope}/113 + ({tee!.rating} − {chPar})
                </small>
              </p>
            ) : (
              <p class="muted">
                {chIndex === null
                  ? 'Needs a handicap: an estimate or your official index.'
                  : tee && tee.par.length !== 18
                    ? 'Course handicap needs an 18-hole card.'
                    : 'Add this course’s rating and slope from the scorecard (Round › start a round › tees).'}
              </p>
            )}
          </>
        )}
      </section>

      {rep.rows.length > 0 && (
        <section class="card">
          <SectionTitle aside={<span class="muted">{rep.rows.filter((r) => r.used).length} of {Math.min(20, rep.rows.length)} count</span>}>Recent scores</SectionTitle>
          <ul class="diff-list" data-testid="diff-list">
            {rep.rows.slice(0, 20).map((r) => (
              <li key={r.roundIds.join('+')} class={r.used ? 'used' : ''}>
                <span class="diff-val">{r.differential.toFixed(1)}</span>
                <span class="diff-meta">
                  <strong>{r.courseName}</strong>
                  <small>
                    {longDate(r.date)} · {r.gross}
                    {r.ags !== r.gross ? ` (adjusted ${r.ags})` : ''}
                    {r.method === 'nine-paired' ? ' · two 9s' : r.method === 'nine-expected' ? ' · 9 holes + expected' : ''}
                    {r.approx ? ' · approx.' : ''}
                  </small>
                </span>
                {r.used && <span class="diff-used">Counts</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rep.excluded.length > 0 && (
        <section class="card">
          <h2 class="card-title">Not counted yet</h2>
          <ul class="plain-list">
            {rep.excluded.slice(0, 10).map((x) => (
              <li key={x.roundId}>
                <strong>
                  {x.courseName}, {shortDate(x.date)}
                </strong>
                :{' '}
                {x.reason === 'no-rating'
                  ? 'needs course rating and slope. Open the round under Round › Recent rounds to add them.'
                  : x.reason === 'incomplete'
                    ? 'not all holes were scored.'
                    : 'a 9-hole score waiting for another 9 to pair with.'}
              </li>
            ))}
          </ul>
        </section>
      )}

      <details class="card">
        <summary>
          <span class="card-title">How HitWhat calculates this</span>
        </summary>
        <ol class="explain">
          <li>
            Each round becomes a <strong>score differential</strong>: (113 ÷ slope) × (adjusted score − course rating). It measures how you played against how hard the course is.
          </li>
          <li>
            For rounds scored hole by hole in HitWhat, each hole is capped at <strong>net double bogey</strong> (par + 2 + any strokes you get there) before the differential is worked out. Before you have an estimate the cap is par + 5.
          </li>
          <li>
            Your estimate is the average of your <strong>best 8 of your last 20</strong> differentials. With fewer scores, fewer count (best 1 of 3, minus 2.0, and so on up).
          </li>
          <li>9-hole scores are paired into 18, or, once you have an estimate, combined with the score you’d be expected to shoot on the other nine.</li>
          <li>A sharp rise is softened once you have 20 scores (soft and hard caps based on your lowest estimate).</li>
          <li>
            Not included: the daily <strong>playing-conditions adjustment</strong> and exceptional-score reductions, which need your association’s data. That is one reason this is an estimate.
          </li>
        </ol>
      </details>

      {adding && <AddScoreSheet onClose={() => setAdding(false)} />}
    </div>
  );
}
