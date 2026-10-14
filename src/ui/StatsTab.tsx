/** STATS: the 2–3 things that matter about your game right now, then the numbers behind them. */
import { useMemo } from 'preact/hooks';
import { roundScore, roundTotals } from '../core/round';
import { AREA_LABEL, insights, playerStats, type Verdict } from '../core/stats';
import { useApp } from './context';
import { DistancesCard, PracticePlanCard } from './Distances';
import { Badge, Empty, shortDate, Stat, Trend, type Tone } from './kit';

const VERDICT: Record<Verdict, { text: string; tone: Tone }> = {
  good: { text: 'Good', tone: 'good' },
  ok: { text: 'OK', tone: 'ok' },
  watch: { text: 'Watch', tone: 'watch' },
};

const f1 = (n: number | null, suffix = '') => (n === null ? '—' : `${n.toFixed(1)}${suffix}`);
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`);
const signed = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}`);

export function StatsTab() {
  const { golf, handicap, profile, go, active } = useApp();
  const s = useMemo(() => playerStats(golf.rounds), [golf.rounds]);
  const ins = useMemo(() => insights(golf.rounds), [golf.rounds]);
  const recent = useMemo(
    () =>
      golf.rounds
        .filter((r) => r.status === 'complete' && r.holeCount === 18)
        .map((r) => ({ r, score: roundScore(r) }))
        .filter((x): x is { r: typeof x.r; score: number } => x.score !== null)
        .sort((a, b) => a.r.date - b.r.date)
        .slice(-12),
    [golf.rounds],
  );

  if (s.rounds === 0) {
    return (
      <div class="stack">
        <Empty icon="stats" title="Your game, in numbers">
          <p class="muted">
            {active
              ? 'Finish your round and this page shows where you’re strong, where you lose strokes, and whether it’s getting better.'
              : 'Play a round in HitWhat (or add past scores) and this page shows where you’re strong, where you lose strokes, and whether it’s getting better.'}
          </p>
          <button type="button" class="btn primary" onClick={() => go('round')}>
            {active ? 'Back to your round' : 'Start a round'}
          </button>
        </Empty>
        <DistancesCard />
        <PracticePlanCard />
      </div>
    );
  }

  return (
    <div class="stack">
      {ins.areas.length > 0 ? (
        <section class="card game-now" data-testid="game-now">
          <h2 class="card-title">Your game right now</h2>
          <ul class="verdicts">
            {ins.areas.map((a) => (
              <li key={a.area}>
                <span class="verdict-name">
                  <strong>{AREA_LABEL[a.area]}</strong>
                  <small>{a.value}</small>
                </span>
                <span class="verdict-badges">
                  {a.trend && a.trend !== 'steady' && <Badge tone={a.trend === 'improving' ? 'good' : 'watch'}>{a.trend === 'improving' ? 'Improving' : 'Slipping'}</Badge>}
                  <Badge tone={VERDICT[a.verdict].tone}>{VERDICT[a.verdict].text}</Badge>
                </span>
              </li>
            ))}
          </ul>
          {ins.opportunity && (
            <div class="opportunity" data-testid="opportunity">
              <span class="eyebrow">Biggest opportunity</span>
              <p>{ins.opportunity.text}</p>
            </div>
          )}
          <p class="fine">
            Ratings compare you with typical golfers who shoot around your average ({f1(s.scoringAvg)}). Benchmarks are approximate. Based on {s.detailedRounds} round{s.detailedRounds === 1 ? '' : 's'} scored hole by hole.
          </p>
        </section>
      ) : (
        <section class="card">
          <p class="muted">Score a round hole by hole in HitWhat to unlock putting, approach, driving and penalty insights. Score-only rounds count toward your average and handicap.</p>
        </section>
      )}

      <section class="stat-grid">
        <Stat label="Scoring avg" value={f1(s.scoringAvg)} sub={`${s.rounds} round${s.rounds === 1 ? '' : 's'}`} testid="stat-avg" />
        <Stat label="Handicap" value={profile.officialIndex ?? handicap.estimate ?? '—'} sub={profile.officialIndex !== null ? 'Official' : 'Estimate'} />
        <Stat label="Fairways" value={pct(s.fairwayPct)} />
        <Stat label="Greens" value={pct(s.girPct)} sub={s.girPerRound !== null ? `${s.girPerRound.toFixed(1)} per round` : undefined} />
        <Stat label="Putts / round" value={f1(s.puttsPerRound)} />
        <Stat label="Putts per GIR" value={s.puttsPerGir !== null ? s.puttsPerGir.toFixed(2) : '—'} />
        <Stat label="Penalties" value={f1(s.penaltiesPerRound)} sub="per round" />
        <Stat label="3-putts" value={f1(s.threePuttsPerRound)} sub="per round" />
      </section>

      {recent.length >= 2 && (
        <section class="card">
          <h2 class="card-title">Scores</h2>
          <Trend label="18-hole scores, oldest to newest" points={recent.map((x) => ({ x: x.r.date, y: x.score, title: `${shortDate(x.r.date)} · ${x.r.courseName}: ${x.score}` }))} testid="score-trend" />
        </section>
      )}

      {s.detailedRounds > 0 && (
        <section class="card">
          <h2 class="card-title">Where the strokes go</h2>
          <table class="data-table">
            <tbody>
              <tr>
                <th scope="row">Par 3s</th>
                <td>{signed(s.parAvg[3])}</td>
                <th scope="row">Front 9</th>
                <td>{s.front9 === null ? '—' : `${s.front9 > 0 ? '+' : ''}${s.front9.toFixed(1)}`}</td>
              </tr>
              <tr>
                <th scope="row">Par 4s</th>
                <td>{signed(s.parAvg[4])}</td>
                <th scope="row">Back 9</th>
                <td>{s.back9 === null ? '—' : `${s.back9 > 0 ? '+' : ''}${s.back9.toFixed(1)}`}</td>
              </tr>
              <tr>
                <th scope="row">Par 5s</th>
                <td>{signed(s.parAvg[5])}</td>
                <th scope="row">Doubles+</th>
                <td>{f1(s.doublesPerRound)}</td>
              </tr>
            </tbody>
          </table>
          <p class="fine">Par types: average strokes over par per hole. Nines: strokes over par per nine.</p>
          {s.missLeftPct !== null && (
            <p class="muted">
              Missed fairways: {Math.round(s.missLeftPct)}% left, {Math.round(s.missRightPct ?? 0)}% right of tee shots on par 4s and 5s.
            </p>
          )}
        </section>
      )}

      <DistancesCard />
      <PracticePlanCard />

      <section class="card">
        <h2 class="card-title">Recent rounds</h2>
        <ul class="plain-list">
          {golf.rounds
            .filter((r) => r.status === 'complete')
            .sort((a, b) => b.date - a.date)
            .slice(0, 5)
            .map((r) => {
              const t = r.source === 'app' ? roundTotals(r) : null;
              return (
                <li key={r.id}>
                  <strong>{roundScore(r) ?? t?.strokes ?? '—'}</strong> · {r.courseName} · {shortDate(r.date)}
                  {t && t.puttsHoles ? ` · ${t.putts} putts` : ''}
                  {t && t.penalties ? ` · ${t.penalties} pen.` : ''}
                </li>
              );
            })}
        </ul>
      </section>
    </div>
  );
}
