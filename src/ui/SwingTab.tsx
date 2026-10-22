/** SWING: record, analyze on-device, save, compare and spot recurring tendencies. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { BONES, goodCount, swingTendencies, type CameraAngle, type KeyFrames, type Landmark, type Rating } from '../core/swing';
import { newId } from '../state/golf';
import { deleteSwing, listSwings, loadVideo, saveSwing, updateSwing, type SavedSwing } from '../state/swings';
import { useApp } from './context';
import { Badge, Empty, Icon, longDate, shortDate, type Tone } from './kit';
import { ANGLE_LABEL, AngleDiagram, SwingCapture } from './SwingCapture';

const RATING: Record<Rating, { text: string; tone: Tone }> = {
  good: { text: 'Good', tone: 'good' },
  ok: { text: 'OK', tone: 'ok' },
  watch: { text: 'Watch', tone: 'watch' },
  na: { text: 'n/a', tone: 'muted' },
};

type View =
  | { kind: 'home' }
  | { kind: 'capture'; angle: CameraAngle; video: Blob | null }
  | { kind: 'result'; swing: SavedSwing; video: Blob | null; unsaved: boolean }
  | { kind: 'compare'; a: SavedSwing; b: SavedSwing };

export function SwingTab() {
  const [swings, setSwings] = useState<SavedSwing[] | null>(null);
  const [storageErr, setStorageErr] = useState(false);
  const [view, setView] = useState<View>({ kind: 'home' });
  const [pickAngle, setPickAngle] = useState<CameraAngle | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listSwings()
      .then(setSwings)
      .catch(() => {
        setSwings([]);
        setStorageErr(true);
      });
  useEffect(() => void refresh(), []);

  const analyses = (swings ?? []).map((s) => s.analysis);
  const tendencies = swingTendencies(analyses);

  if (view.kind === 'capture') {
    return (
      <SwingCapture
        angle={view.angle}
        initialVideo={view.video}
        onClose={() => setView({ kind: 'home' })}
        onAnalyzed={(r, video) => {
          if (!r.ok) return;
          const swing: SavedSwing = { id: newId(), at: Date.now(), angle: view.angle, analysis: r, starred: false, note: '', clubId: null, videoType: video.type, videoBytes: video.size };
          setView({ kind: 'result', swing, video, unsaved: true });
        }}
      />
    );
  }

  if (view.kind === 'result') {
    const previous = (swings ?? []).filter((s) => s.id !== view.swing.id && s.angle === view.swing.angle && s.at < view.swing.at)[0] ?? null;
    const best = bestOf((swings ?? []).filter((s) => s.id !== view.swing.id && s.angle === view.swing.angle));
    return (
      <SwingResultView
        swing={view.swing}
        video={view.video}
        unsaved={view.unsaved}
        previous={previous}
        best={best && best.id !== previous?.id ? best : null}
        onBack={() => setView({ kind: 'home' })}
        onSave={async (s) => {
          try {
            await saveSwing(s, view.video);
            await refresh();
            setView({ ...view, swing: s, unsaved: false });
          } catch {
            setStorageErr(true);
          }
        }}
        onUpdate={async (s) => {
          if (!view.unsaved) await updateSwing(s).catch(() => setStorageErr(true));
          setView({ ...view, swing: s });
          if (!view.unsaved) void refresh();
        }}
        onDelete={async () => {
          await deleteSwing(view.swing.id).catch(() => {});
          await refresh();
          setView({ kind: 'home' });
        }}
        onCompare={(b) => setView({ kind: 'compare', a: view.swing, b })}
      />
    );
  }

  if (view.kind === 'compare') {
    return <Compare a={view.a} b={view.b} onBack={() => setView({ kind: 'home' })} />;
  }

  return (
    <div class="stack">
      <section class="hero-start">
        <p class="eyebrow">Swing check</p>
        <h1>Film a swing. Get one thing to work on.</h1>
        <p class="lede">Prop your phone on your bag, pick the angle, and HitWhat checks tempo, posture, head movement, turn and balance.</p>
        <div class="angle-pick">
          {(['dtl', 'face-on'] as CameraAngle[]).map((a) => (
            <button key={a} type="button" class="angle-card" onClick={() => setView({ kind: 'capture', angle: a, video: null })} data-testid={`angle-${a}`}>
              <AngleDiagram angle={a} />
              <strong>{ANGLE_LABEL[a]}</strong>
              <small>{a === 'dtl' ? 'Posture & path' : 'Tempo, turn & balance'}</small>
            </button>
          ))}
        </div>
        <button type="button" class="btn ghost wide" onClick={() => setPickAngle(pickAngle ? null : 'face-on')} data-testid="swing-from-library" aria-expanded={pickAngle !== null}>
          <Icon name="video" size={20} /> Use a video from Photos
        </button>
        {pickAngle && (
          <div class="library-pick">
            <p class="sub">Which angle was it filmed from?</p>
            <div class="chips" role="radiogroup" aria-label="Video angle" style={{ '--cols': 2 }}>
              {(['dtl', 'face-on'] as CameraAngle[]).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={pickAngle === a} class={`chip${pickAngle === a ? ' on' : ''}`} onClick={() => setPickAngle(a)}>
                  {ANGLE_LABEL[a]}
                </button>
              ))}
            </div>
            <button type="button" class="btn wide" onClick={() => fileRef.current?.click()}>
              Choose video
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              hidden
              data-testid="swing-file"
              onChange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                if (f) setView({ kind: 'capture', angle: pickAngle, video: f });
                setPickAngle(null);
              }}
            />
          </div>
        )}
        <p class="fine">
          <Icon name="info" size={14} /> Videos and analysis stay on this phone. Nothing is uploaded. HitWhat coaches body movement it can see on camera; it doesn’t measure club speed, path or face angle.
        </p>
      </section>

      {storageErr && <p class="banner warn">This browser isn’t letting HitWhat save swings (private browsing?). You can still analyze them.</p>}

      {tendencies.length > 0 && (
        <section class="card" data-testid="tendencies">
          <h2 class="card-title">Your recurring tendencies</h2>
          <ul class="plain-list">
            {tendencies.map((t) => (
              <li key={t.key}>{t.text}</li>
            ))}
          </ul>
        </section>
      )}

      {swings && swings.length > 0 ? (
        <section class="card">
          <h2 class="card-title">Saved swings</h2>
          <ul class="swing-list" data-testid="swing-list">
            {swings.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  class="swing-row"
                  onClick={async () => setView({ kind: 'result', swing: s, video: await loadVideo(s.id).catch(() => null), unsaved: false })}
                >
                  <span class="swing-tempo">{s.analysis.tempo ? `${s.analysis.tempo.ratio.toFixed(1)}:1` : '–'}</span>
                  <span class="round-meta">
                    <strong>
                      {s.starred && <Icon name="star" size={14} filled />} {s.analysis.focus.title}
                    </strong>
                    <small>
                      {shortDate(s.at)} · {ANGLE_LABEL[s.angle]} · {goodCount(s.analysis)} good checks
                    </small>
                  </span>
                  <Icon name="chevron" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        swings && (
          <Empty icon="swing" title="No saved swings yet">
            <p class="muted">Save swings to compare them and let HitWhat spot what keeps coming back.</p>
          </Empty>
        )
      )}
    </div>
  );
}

const bestOf = (list: SavedSwing[]) => list.find((s) => s.starred) ?? [...list].sort((a, b) => goodCount(b.analysis) - goodCount(a.analysis))[0] ?? null;

function SwingResultView({
  swing,
  video,
  unsaved,
  previous,
  best,
  onBack,
  onSave,
  onUpdate,
  onDelete,
  onCompare,
}: {
  swing: SavedSwing;
  video: Blob | null;
  unsaved: boolean;
  previous: SavedSwing | null;
  best: SavedSwing | null;
  onBack: () => void;
  onSave: (s: SavedSwing) => void;
  onUpdate: (s: SavedSwing) => void;
  onDelete: () => void;
  onCompare: (b: SavedSwing) => void;
}) {
  const { profile } = useApp();
  const a = swing.analysis;
  return (
    <div class="stack" data-testid="swing-result">
      <button type="button" class="back-link" onClick={onBack}>
        <Icon name="back" size={18} /> Swing
      </button>
      <section class="card swing-check">
        <div class="field-head">
          <h2 class="card-title">Swing check</h2>
          <span class="muted">
            {ANGLE_LABEL[swing.angle]} · {longDate(swing.at)}
          </span>
        </div>
        <ul class="metric-list" data-testid="metrics">
          {a.metrics
            .filter((m) => m.rating !== 'na')
            .map((m) => (
              <li key={m.key}>
                <span class="metric-name">
                  <strong>{m.label}</strong>
                  <span class="metric-value">{m.value}</span>
                </span>
                <Badge tone={RATING[m.rating].tone}>{RATING[m.rating].text}</Badge>
                <small class="metric-detail">{m.detail}</small>
              </li>
            ))}
        </ul>
        <div class="focus" data-testid="focus">
          <span class="eyebrow">One thing to work on</span>
          <strong>{a.focus.title}</strong>
          <p>“{a.focus.tip}”</p>
        </div>
        {a.quality.warnings.map((w) => (
          <p key={w} class="fine">
            {w}
          </p>
        ))}
        <details>
          <summary class="fine">Not measured from this angle ({a.metrics.filter((m) => m.rating === 'na').length})</summary>
          <ul class="plain-list fine">
            {a.metrics
              .filter((m) => m.rating === 'na')
              .map((m) => (
                <li key={m.key}>
                  {m.label}: {m.detail}
                </li>
              ))}
          </ul>
        </details>
      </section>

      {video && <KeyFrameStrip video={video} keyFrames={a.keyFrames} poses={a.keyPoses} />}

      <section class="card">
        {unsaved ? (
          <button type="button" class="btn primary wide" onClick={() => onSave(swing)} data-testid="save-swing">
            Save swing
          </button>
        ) : (
          <div class="row">
            <button type="button" class={`btn ghost${swing.starred ? ' starred' : ''}`} onClick={() => onUpdate({ ...swing, starred: !swing.starred })} aria-pressed={swing.starred}>
              <Icon name="star" size={18} filled={swing.starred} /> {swing.starred ? 'Best swing' : 'Mark as best'}
            </button>
            <button type="button" class="btn ghost" onClick={() => confirm('Delete this swing and its video?') && onDelete()}>
              <Icon name="trash" size={18} /> Delete
            </button>
          </div>
        )}
        <label class="inline-select">
          <span>Club</span>
          <select value={swing.clubId ?? ''} onChange={(e) => onUpdate({ ...swing, clubId: (e.currentTarget as HTMLSelectElement).value || null })} aria-label="Club in this swing">
            <option value="">–</option>
            {profile.clubs
              .filter((c) => c.inBag)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        {(previous || best) && (
          <div class="row">
            {previous && (
              <button type="button" class="btn ghost" onClick={() => onCompare(previous)} data-testid="compare-previous">
                Compare with previous
              </button>
            )}
            {best && (
              <button type="button" class="btn ghost" onClick={() => onCompare(best)}>
                Compare with best
              </button>
            )}
          </div>
        )}
        <p class="fine">
          {unsaved ? 'Saving keeps the video and analysis in this browser on this phone.' : `Stored on this phone${swing.videoBytes ? ` (${(swing.videoBytes / 1e6).toFixed(1)} MB video)` : ''}.`}
        </p>
      </section>
    </div>
  );
}

/** Four key positions with the detected skeleton drawn over the frame. */
function KeyFrameStrip({ video, keyFrames, poses }: { video: Blob; keyFrames: KeyFrames; poses: Record<keyof KeyFrames, Landmark[]> }) {
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  const keys: (keyof KeyFrames)[] = ['address', 'top', 'impact', 'finish'];
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(video);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    (async () => {
      await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }));
      for (let i = 0; i < keys.length; i++) {
        if (cancelled) return;
        await new Promise<void>((r) => {
          const done = () => (v.removeEventListener('seeked', done), r());
          v.addEventListener('seeked', done);
          v.currentTime = keyFrames[keys[i]];
          setTimeout(done, 1500);
        });
        const c = refs.current[i];
        if (!c || !v.videoWidth) continue;
        const scale = 240 / v.videoHeight;
        c.width = Math.round(v.videoWidth * scale);
        c.height = 240;
        const ctx = c.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const p = poses[keys[i]];
        ctx.strokeStyle = '#5fd38d';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        for (const [a, b] of BONES) {
          if (!p[a] || !p[b]) continue;
          ctx.beginPath();
          ctx.moveTo(p[a].x * c.width, p[a].y * c.height);
          ctx.lineTo(p[b].x * c.width, p[b].y * c.height);
          ctx.stroke();
        }
      }
    })();
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [video]);
  return (
    <section class="card">
      <h2 class="card-title">Key positions</h2>
      <div class="keyframes">
        {keys.map((k, i) => (
          <figure key={k}>
            <canvas ref={(el) => {
                refs.current[i] = el;
              }} aria-label={`${k} position`} />
            <figcaption>{k[0].toUpperCase() + k.slice(1)}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Compare({ a, b, onBack }: { a: SavedSwing; b: SavedSwing; onBack: () => void }) {
  const [urls, setUrls] = useState<(string | null)[]>([null, null]);
  const vids = useRef<(HTMLVideoElement | null)[]>([]);
  useEffect(() => {
    let made: (string | null)[] = [];
    Promise.all([loadVideo(a.id).catch(() => null), loadVideo(b.id).catch(() => null)]).then((blobs) => {
      made = blobs.map((x) => (x ? URL.createObjectURL(x) : null));
      setUrls(made);
    });
    return () => made.forEach((u) => u && URL.revokeObjectURL(u));
  }, [a.id, b.id]);

  const playBoth = (rate: number) => {
    // Line both clips up on their address frames, then play together.
    const start = [a.analysis.keyFrames, b.analysis.keyFrames].map((k) => k.address);
    vids.current.forEach((v, i) => {
      if (!v) return;
      v.pause();
      v.currentTime = start[i];
      v.playbackRate = rate;
    });
    vids.current.forEach((v) => v && void v.play().catch(() => {}));
  };

  const keys = [...new Set([...a.analysis.metrics, ...b.analysis.metrics].map((m) => m.key))];
  return (
    <div class="stack" data-testid="swing-compare">
      <button type="button" class="back-link" onClick={onBack}>
        <Icon name="back" size={18} /> Swing
      </button>
      <section class="compare-videos">
        {[a, b].map((s, i) => (
          <figure key={s.id}>
            {urls[i] ? <video ref={(el) => {
                  vids.current[i] = el;
                }} src={urls[i]!} playsInline muted /> : <div class="video-missing">No video</div>}
            <figcaption>
              {i === 0 ? 'This swing' : s.starred ? 'Best' : 'Earlier'} · {shortDate(s.at)}
            </figcaption>
          </figure>
        ))}
      </section>
      <div class="row">
        <button type="button" class="btn" onClick={() => playBoth(1)}>
          Play both
        </button>
        <button type="button" class="btn ghost" onClick={() => playBoth(0.25)}>
          Slow motion
        </button>
      </div>
      <section class="card">
        <table class="data-table compare">
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">This</th>
              <th scope="col">{b.starred ? 'Best' : 'Earlier'}</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const ma = a.analysis.metrics.find((m) => m.key === k);
              const mb = b.analysis.metrics.find((m) => m.key === k);
              if (ma?.rating === 'na' && mb?.rating === 'na') return null;
              return (
                <tr key={k}>
                  <th scope="row">{ma?.label ?? mb?.label}</th>
                  {[ma, mb].map((m, i) => (
                    <td key={i}>
                      {m && m.rating !== 'na' ? (
                        <>
                          <Badge tone={RATING[m.rating].tone}>{RATING[m.rating].text}</Badge>
                          <small>{m.value}</small>
                        </>
                      ) : (
                        '–'
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {a.angle !== b.angle && <p class="fine">These swings were filmed from different angles, so some checks can’t be compared.</p>}
      </section>
    </div>
  );
}

