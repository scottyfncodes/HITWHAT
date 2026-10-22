/**
 * PRACTICE: short-game drills chosen from the golfer's own rounds and club
 * data, a runner for logging each attempt, and progress across sessions.
 */
import { useMemo, useState } from 'preact/hooks';
import {
  courseLink,
  drillAdvice,
  drillProgress,
  DRILLS,
  LADDER_TOLERANCE_YDS,
  LAG_CIRCLE_FT,
  lowerIsBetter,
  planAttempts,
  sessionResult,
  sessionScore,
  type Attempt,
  type DrillAdvice,
  type DrillId,
  type DrillProgress,
  type PracticeSession,
} from '../core/practice';
import type { ShotRecord } from '../core/shots';
import { distanceLabel, feetTo, heightLabel, toYards, yardsTo, type Units } from '../core/units';
import { newId } from '../state/golf';
import { NumberField } from './controls';
import { useApp } from './context';
import { DistancesCard, PracticePlanCard, useLadder } from './Distances';
import { Badge, Icon, Sheet, shortDate, Trend } from './kit';

// ---------- Formatting in the golfer's units ----------

const putt = (ft: number, u: Units) => `${Math.round(feetTo(ft, u.height))} ${heightLabel(u.height)}`;
const yds = (y: number, u: Units) => `${Math.round(yardsTo(y, u.distance))} ${distanceLabel(u.distance)}`;
const target = (drill: DrillId, t: number, u: Units) => (DRILLS[drill].kind === 'putting' ? putt(t, u) : yds(t, u));

/** A session's headline: "67%" or "±3 yds". */
function scoreText(drill: DrillId, score: number | null, u: Units): string {
  if (score === null) return '–';
  if (lowerIsBetter(drill)) return `±${Math.max(0, yardsTo(score, u.distance)).toFixed(1)} ${distanceLabel(u.distance)}`;
  return `${Math.round(score)}%`;
}

function successText(drill: DrillId, u: Units): string {
  if (drill === 'lag-putting') return `Holed or within ${putt(LAG_CIRCLE_FT, u)}`;
  if (drill === 'wedge-ladder') return `Within ${yds(LADDER_TOLERANCE_YDS, u)} of the target`;
  return DRILLS[drill].success;
}

function progressText(drill: DrillId, p: DrillProgress, u: Units, saved: boolean): string | null {
  if (p.latest === null) return null;
  if (p.before === null || p.direction === null)
    return saved ? 'First session logged. Your next one will be compared with it.' : 'Your first session of this drill. Save it to compare future sessions with it.';
  const span = `${p.priorCount === 1 ? 'your previous session' : `the average of your previous ${p.priorCount}`}`;
  const nums = `${scoreText(drill, p.before, u)} → ${scoreText(drill, p.latest, u)}`;
  if (p.direction === 'better') return `Better than ${span} (${nums}).`;
  if (p.direction === 'worse') return `Below ${span} (${nums}).`;
  return `About the same as ${span} (${nums}). A putt or two either way is normal session to session.`;
}

// ---------- The Practice view (inside Stats) ----------

export function PracticeView() {
  const { golf, units: u, openDrill, profile } = useApp();
  const { rows } = useLadder();
  const label = (id: string) => profile.clubs.find((c) => c.id === id)?.name ?? id;
  const advice = useMemo(
    () => drillAdvice({ rounds: golf.rounds, ladder: rows, label, dist: (y) => yds(y, u) }),
    [golf.rounds, rows, u.distance],
  );
  const recommended = advice.filter((a) => a.status === 'recommended');
  const others = advice.filter((a) => a.status !== 'recommended');
  const history = [...golf.practice].sort((a, b) => b.at - a.at);

  return (
    <div class="stack" data-testid="practice">
      {recommended.length > 0 && (
        <section class="practice-group" aria-labelledby="rec-title">
          <h2 class="card-title" id="rec-title">
            From your data
          </h2>
          {recommended.map((a) => (
            <DrillCard key={a.drill} advice={a} onStart={() => openDrill(a.drill)} />
          ))}
        </section>
      )}
      <section class="practice-group" aria-labelledby="drills-title">
        <h2 class="card-title" id="drills-title">
          {recommended.length ? 'More short-game drills' : 'Short-game drills'}
        </h2>
        {others.map((a) => (
          <DrillCard key={a.drill} advice={a} onStart={() => openDrill(a.drill)} />
        ))}
      </section>

      <DistancesCard />
      <PracticePlanCard />

      <PracticeHistory sessions={history} />
    </div>
  );
}

function DrillCard({ advice, onStart }: { advice: DrillAdvice; onStart: () => void }) {
  const { golf, units: u } = useApp();
  const d = DRILLS[advice.drill];
  const p = drillProgress(golf.practice, advice.drill);
  const off = advice.status === 'unavailable';
  return (
    <article class={`card drill-card${advice.status === 'recommended' ? ' recommended' : ''}`} data-testid={`drill-${d.id}`}>
      <div class="drill-head">
        <span class="drill-icon" aria-hidden="true">
          <Icon name={d.kind === 'putting' ? 'flag' : 'caddie'} size={22} />
        </span>
        <div>
          <h3>{d.name}</h3>
          <p class="muted">{d.objective}</p>
        </div>
      </div>
      <p class={`drill-why ${advice.status}`} data-testid="drill-why">
        {advice.status === 'recommended' ? (
          <Badge tone="good">For you</Badge>
        ) : advice.status === 'starter' ? (
          <Badge tone="muted">Starter drill</Badge>
        ) : null}{' '}
        {advice.reason}
      </p>
      <div class="drill-foot">
        <span class="drill-last" data-testid="drill-last">
          {p.latest !== null ? (
            <>
              Last: <strong>{scoreText(d.id, p.latest, u)}</strong> · {p.sessions.length} session{p.sessions.length === 1 ? '' : 's'}
            </>
          ) : (
            'Not tried yet'
          )}
        </span>
        <button type="button" class={`btn small${advice.status === 'recommended' ? ' primary' : ''}`} onClick={onStart} disabled={off} aria-label={`Start ${d.name}`}>
          Start
        </button>
      </div>
    </article>
  );
}

function PracticeHistory({ sessions }: { sessions: PracticeSession[] }) {
  const { units: u, updateGolf } = useApp();
  const [confirm, setConfirm] = useState<string | null>(null);
  const remove = (s: PracticeSession) => {
    updateGolf((g) => ({ ...g, practice: g.practice.filter((x) => x.id !== s.id), shots: g.shots.filter((x) => !s.shotIds.includes(x.id)) }));
    setConfirm(null);
  };
  return (
    <section class="card" aria-labelledby="history-title" data-testid="practice-history">
      <h2 class="card-title" id="history-title">
        Practice log
      </h2>
      {sessions.length === 0 ? (
        <p class="muted">Finished drills are saved here, so you can see whether your practice is paying off.</p>
      ) : (
        <ul class="history">
          {sessions.slice(0, 20).map((s) => (
            <li key={s.id}>
              <span class="history-main">
                <strong>{DRILLS[s.drill].name}</strong>
                <small>
                  {shortDate(s.at)} · {sessionResult(s.drill, s.attempts).done} attempts
                </small>
              </span>
              <span class="history-score">{scoreText(s.drill, sessionScore(s), u)}</span>
              {confirm === s.id ? (
                <button type="button" class="btn small danger" onClick={() => remove(s)}>
                  Delete{s.shotIds.length ? ` + ${s.shotIds.length} shots` : ''}
                </button>
              ) : (
                <button type="button" class="icon-btn small" aria-label={`Delete ${DRILLS[s.drill].name} session from ${shortDate(s.at)}`} onClick={() => setConfirm(s.id)}>
                  <Icon name="trash" size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Running a drill ----------

type Phase = 'brief' | 'run' | 'done' | 'saved';

export function DrillSheet({ drill, onClose }: { drill: DrillId; onClose: () => void }) {
  const { golf, updateGolf, clubs, profile, units: u } = useApp();
  const d = DRILLS[drill];
  const { rows } = useLadder();
  const label = (id: string) => profile.clubs.find((c) => c.id === id)?.name ?? id;
  const advice = useMemo(() => drillAdvice({ rounds: golf.rounds, ladder: rows, label, dist: (y) => yds(y, u) }).find((a) => a.drill === drill)!, [golf.rounds, rows]);
  const wedges = clubs.filter((c) => c.inBag && c.type === 'wedge' && c.carry > 0);
  const [phase, setPhase] = useState<Phase>('brief');
  const [attempts, setAttempts] = useState<Attempt[]>(() => planAttempts(drill, wedges));
  const [carry, setCarry] = useState<number | null>(null);
  const [mishits, setMishits] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [saved, setSaved] = useState<PracticeSession | null>(null);

  const isCarry = d.input === 'carry';
  const doneCount = attempts.filter((a) => (isCarry ? a.carry !== null : a.outcome !== null)).length;
  const current = attempts[doneCount] ?? null;
  const result = sessionResult(drill, attempts);
  const prior = golf.practice.filter((s) => s.drill === drill);

  const record = (patch: Partial<Attempt>) => {
    const i = doneCount;
    const next = attempts.map((a, k) => (k === i ? { ...a, ...patch } : a));
    setAttempts(next);
    setCarry(null);
    if (i + 1 >= next.length) setPhase('done');
    else if (isCarry) requestAnimationFrame(() => document.getElementById('drill-carry')?.focus());
  };
  const undo = () => {
    if (!doneCount) return;
    setAttempts(attempts.map((a, k) => (k === doneCount - 1 ? { ...a, outcome: null, carry: null } : a)));
    setPhase('run');
  };
  const logCarry = () => {
    if (carry === null) return;
    const y = toYards(carry, u.distance);
    if (y < 10 || y > 200) return;
    record({ carry: Math.round(y) });
  };

  const save = () => {
    const at = Date.now();
    const shots: ShotRecord[] = isCarry
      ? attempts
          .filter((a) => a.carry !== null && a.clubId)
          .map((a, i) => ({ id: newId() + i, at: at + i, clubId: a.clubId!, distance: a.carry, source: 'manual', full: true, roundId: null, hole: null, from: null }))
      : [];
    const session: PracticeSession = { id: newId(), drill, at, attempts, shotIds: shots.map((s) => s.id) };
    updateGolf((g) => ({ ...g, practice: [...g.practice, session], shots: [...g.shots, ...shots] }));
    setSaved(session);
    setPhase('saved');
  };
  const again = () => {
    setAttempts(planAttempts(drill, wedges));
    setSaved(null);
    setMishits(0);
    setPhase('run');
  };
  const close = () => {
    if (phase === 'run' && doneCount > 0) return setLeaving(true);
    onClose();
  };

  // Progress including this session, for the summary.
  const pending: PracticeSession = saved ?? { id: 'pending', drill, at: Date.now(), attempts, shotIds: [] };
  const progress = drillProgress([...prior.filter((s) => s.id !== pending.id), pending], drill);
  const link = phase === 'saved' ? courseLink(drill, golf.practice, golf.rounds) : null;

  return (
    <Sheet
      title={d.name}
      onClose={close}
      testid="drill"
      action={
        <button type="button" class="btn small" onClick={close} data-testid="drill-close">
          {phase === 'saved' ? 'Done' : 'Close'}
        </button>
      }
    >
      {leaving && (
        <div class="banner warn" role="alertdialog" aria-label="Leave the drill?">
          <p>
            You've logged {doneCount} of {attempts.length}. Leaving now discards this session.
          </p>
          <div class="row">
            <button type="button" class="btn small danger" onClick={onClose} data-testid="drill-discard">
              Discard and close
            </button>
            <button type="button" class="btn small" onClick={() => setLeaving(false)}>
              Keep going
            </button>
          </div>
        </div>
      )}

      {phase === 'brief' && (
        <>
          <section class="card">
            <p class="drill-objective">{d.objective}</p>
            <p class={`drill-why ${advice.status}`}>
              {advice.status === 'recommended' ? <Badge tone="good">For you</Badge> : <Badge tone="muted">Starter drill</Badge>} {advice.reason}
            </p>
          </section>
          <section class="card">
            <h3 class="card-title">Set up</h3>
            <ol class="drill-setup">
              {d.setup.map((s) => (
                <li key={s}>{unitsInText(s, u)}</li>
              ))}
            </ol>
            <dl class="drill-facts">
              <div>
                <dt>Attempts</dt>
                <dd>{attempts.length}</dd>
              </div>
              <div>
                <dt>Scored as</dt>
                <dd>{successText(drill, u)}</dd>
              </div>
            </dl>
            {isCarry && wedges.length > 0 && <p class="fine">Five shots each with {wedges.map((w) => w.short).join(', ')}. Your carries are added to your club distances, so the caddie learns them.</p>}
          </section>
          <DrillHistory drill={drill} sessions={prior} />
          <button type="button" class="btn primary wide" onClick={() => setPhase('run')} disabled={!attempts.length} data-testid="drill-start">
            Start · {attempts.length} attempts
          </button>
        </>
      )}

      {phase === 'run' && current && (
        <section class="card drill-run" aria-live="polite">
          <ol class="drill-dots" aria-label={`${doneCount} of ${attempts.length} done`}>
            {attempts.map((a, i) => (
              <li key={i} class={i === doneCount ? 'now' : a.outcome === 'in' || a.outcome === 'made' ? 'ok' : a.outcome || a.carry !== null ? 'miss' : ''} />
            ))}
          </ol>
          <p class="drill-count" data-testid="drill-count">
            Attempt {doneCount + 1} of {attempts.length}
          </p>
          <p class="drill-target" data-testid="drill-target">
            {isCarry ? (
              <>
                {label(current.clubId ?? '')} <small>· full swing</small>
              </>
            ) : (
              <>
                {target(drill, current.target, u)} {drill === 'wedge-ladder' && <small>carry</small>}
              </>
            )}
          </p>
          {d.input === 'in-short-long' && (
            <div class="drill-buttons">
              <button type="button" class="btn primary wide big" onClick={() => record({ outcome: 'in' })} data-testid="out-in">
                {drill === 'lag-putting' ? `Holed or inside ${putt(LAG_CIRCLE_FT, u)}` : `On target (±${yds(LADDER_TOLERANCE_YDS, u)})`}
              </button>
              <div class="row two">
                <button type="button" class="btn big" onClick={() => record({ outcome: 'short' })} data-testid="out-short">
                  Short
                </button>
                <button type="button" class="btn big" onClick={() => record({ outcome: 'long' })} data-testid="out-long">
                  Long
                </button>
              </div>
            </div>
          )}
          {d.input === 'made-missed' && (
            <div class="row two drill-buttons">
              <button type="button" class="btn primary big" onClick={() => record({ outcome: 'made' })} data-testid="out-made">
                Holed
              </button>
              <button type="button" class="btn big" onClick={() => record({ outcome: 'missed' })} data-testid="out-missed">
                Missed
              </button>
            </div>
          )}
          {isCarry && (
            <form
              class="drill-buttons"
              onSubmit={(e) => {
                e.preventDefault();
                logCarry();
              }}
            >
              <div class="distance-input-wrap">
                <NumberField
                  id="drill-carry"
                  label={`Carry in ${distanceLabel(u.distance)}`}
                  value={carry}
                  min={Math.round(yardsTo(10, u.distance))}
                  max={Math.round(yardsTo(200, u.distance))}
                  class="distance-input"
                  placeholder={String(Math.round(yardsTo(current.target, u.distance)))}
                  onChange={setCarry}
                  onEnter={logCarry}
                />
                <span class="distance-unit">{distanceLabel(u.distance)}</span>
              </div>
              <button type="submit" class="btn primary wide big" disabled={carry === null} data-testid="log-carry">
                Log carry
              </button>
              <button type="button" class="link" onClick={() => setMishits(mishits + 1)}>
                Mishit? Hit another{mishits ? ` (${mishits} so far)` : ''}
              </button>
              {carry !== null && (toYards(carry, u.distance) < 10 || toYards(carry, u.distance) > 200) && (
                <p class="error-text" role="alert">
                  Enter a carry between {Math.round(yardsTo(10, u.distance))} and {Math.round(yardsTo(200, u.distance))} {distanceLabel(u.distance)}.
                </p>
              )}
            </form>
          )}
          <div class="drill-run-foot">
            <span class="muted" data-testid="drill-tally">
              {isCarry ? `${doneCount} logged` : `${result.successes} of ${doneCount} so far`}
            </span>
            <button type="button" class="link" onClick={undo} disabled={!doneCount} data-testid="drill-undo">
              Undo last
            </button>
          </div>
        </section>
      )}

      {(phase === 'done' || phase === 'saved') && (
        <>
          <section class="card drill-summary" data-testid="drill-summary">
            <p class="eyebrow">Session complete</p>
            {isCarry ? (
              <ul class="carry-results">
                {result.clubs.map((c) => (
                  <li key={c.clubId}>
                    <strong>{label(c.clubId)}</strong>
                    <span>
                      {yds(c.average, u)} <small>avg</small>
                    </span>
                    <span class="muted">±{Math.round(yardsTo(c.spread, u.distance))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="drill-score">
                <strong>
                  {result.successes}/{result.done}
                </strong>{' '}
                <span>{successText(drill, u).toLowerCase()}</span>
              </p>
            )}
            {!isCarry && result.byTarget.length > 1 && (
              <ul class="by-target">
                {result.byTarget.map((t) => (
                  <li key={t.target}>
                    <span>{target(drill, t.target, u)}</span>
                    <strong>
                      {t.successes}/{t.attempts}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
            {d.input === 'in-short-long' && result.short + result.long > 0 && <p class="muted">{missPattern(result.short, result.long)}</p>}
            <p class="drill-progress" data-testid="drill-progress">
              {progressText(drill, progress, u, phase === 'saved')}
            </p>
            {link && (
              <p class="fine" data-testid="course-link">
                On the course, {link.metric.toLowerCase()}: {link.before.toFixed(1)} in your {link.roundsBefore} rounds before you started this drill, {link.after.toFixed(1)} in {link.roundsAfter} since.
                {' '}
                {link.improved ? 'That’s moving the right way, though rounds and practice changing together doesn’t prove the drill caused it.' : 'No improvement on the course yet.'}
              </p>
            )}
          </section>
          {phase === 'done' ? (
            <div class="row">
              <button type="button" class="btn primary grow" onClick={save} data-testid="drill-save">
                Save session
              </button>
              <button type="button" class="btn ghost" onClick={undo}>
                Undo last
              </button>
            </div>
          ) : (
            <>
              <p class="banner" role="status" data-testid="drill-saved">
                <Icon name="check" size={18} /> Saved to your practice log{saved?.shotIds.length ? ` and your club distances (${saved.shotIds.length} shots)` : ''}.
              </p>
              <div class="row">
                <button type="button" class="btn grow" onClick={again}>
                  Go again
                </button>
                <button type="button" class="btn primary grow" onClick={onClose}>
                  Done
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function DrillHistory({ drill, sessions }: { drill: DrillId; sessions: PracticeSession[] }) {
  const { units: u } = useApp();
  const p = drillProgress(sessions, drill);
  if (!p.sessions.length) return null;
  const pts = p.sessions.slice(-12).map((s) => ({ x: s.at, y: sessionScore(s)!, title: `${shortDate(s.at)}: ${scoreText(drill, sessionScore(s), u)}` }));
  return (
    <section class="card" data-testid="drill-history">
      <h3 class="card-title">Your sessions</h3>
      {pts.length >= 2 ? (
        <Trend points={pts} label={lowerIsBetter(drill) ? 'Spread per session (lower is better)' : 'Success per session'} format={(n) => scoreText(drill, n, u)} />
      ) : (
        <p class="muted">
          {shortDate(p.sessions[0].at)}: <strong>{scoreText(drill, p.latest, u)}</strong>
        </p>
      )}
      <p class="muted">
        {p.sessions.length} session{p.sessions.length === 1 ? '' : 's'} · best {scoreText(drill, p.best, u)}
      </p>
    </section>
  );
}

function missPattern(short: number, long: number): string {
  if (short >= long * 2 && short >= 2) return `Most misses were short (${short} short, ${long} long). Give the next ones a little more pace.`;
  if (long >= short * 2 && long >= 2) return `Most misses were long (${long} long, ${short} short). Ease off a touch.`;
  return `Misses: ${short} short, ${long} long.`;
}

/** Setup text is written in feet; show metres when the golfer uses them. */
function unitsInText(text: string, u: Units): string {
  if (u.height !== 'm') return text;
  return text.replace(/(\d+)(, (\d+) and (\d+))? (feet|ft)/g, (_m, a: string, _b, c?: string, d?: string) => {
    const m = (x: string) => Math.round(feetTo(Number(x), 'm'));
    return c && d ? `${m(a)}, ${m(c)} and ${m(d)} m` : `${m(a)} m`;
  });
}

