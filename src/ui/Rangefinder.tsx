/**
 * The camera rangefinder. A phone camera alone cannot measure golf distances
 * (Safari exposes no laser, LiDAR or depth data), so this is an honest hybrid:
 *
 *  • GPS mode: your GPS position → a known target (a green mapped in
 *    OpenStreetMap, or a pin spot you saved). The camera and compass show
 *    which target you're pointing at. Accuracy = GPS accuracy, shown.
 *  • Flag mode: freeze the frame and mark the flagstick; its known height gives
 *    an approximate distance with an error range.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { greenDistances, type GreenDistances, type LatLon } from '../core/geo';
import { fmtDistance } from '../core/format';
import { holeNumber } from '../core/round';
import { calibrateVfov, DEFAULT_VFOV_DEG, flagDistance, gpsPlusMinus, gpsQuality, targetsInView, type MappedTarget } from '../core/rangefinder';
import { distanceLabel, feetTo, heightLabel } from '../core/units';
import { CAMERA_FAILURE_TEXT, openCamera, stopStream, type CameraFailure } from '../services/camera';
import { loadCourseMap, OSM_ATTRIBUTION, OSM_FAILURE_TEXT, type CourseMap, type MappedGreen, type OsmFailure } from '../services/osm';
import { compassNeedsPermission, GPS_ERROR_TEXT, requestCompassPermission, terrainElevations, useCompass, useGps } from '../services/sensors';
import { useApp, type RangeResult } from './context';
import { Icon } from './kit';

type Mode = 'gps' | 'flag';
type Target = MappedTarget & { outline: LatLon[] | null; saved: boolean };

/** Assumed horizontal field of view for placing the AR marker (portrait). Approximate by design. */
const HFOV = 50;

export function Rangefinder({ onClose, onUse }: { onClose: () => void; onUse: (r: RangeResult) => void }) {
  const app = useApp();
  const { units, active, golf, updateGolf, storage, profile, setProfile } = app;
  const [mode, setMode] = useState<Mode>('gps');
  const [help, setHelp] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState<'starting' | 'on' | CameraFailure>('starting');

  useEffect(() => {
    let cancelled = false;
    openCamera({ facing: 'environment', width: 1920 }).then((r) => {
      if (cancelled) return r.ok && stopStream(r.stream);
      if (!r.ok) return setCam(r.reason);
      streamRef.current = r.stream;
      if (videoRef.current) {
        videoRef.current.srcObject = r.stream;
        void videoRef.current.play().catch(() => {});
      }
      setCam('on');
    });
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
    };
  }, []);

  const course = active?.courseId ? golf.courses.find((c) => c.id === active.courseId) ?? null : null;
  const hole = active ? holeNumber(active, active.current) : null;

  return (
    <div class={`rf${mode === 'flag' ? ' flag-mode' : ''}`} role="dialog" aria-modal="true" aria-label="Rangefinder" data-testid="rangefinder">
      <video ref={videoRef} class="rf-video" playsInline muted autoPlay aria-hidden="true" />
      {cam !== 'on' && cam !== 'starting' && <p class="rf-camera-msg">{CAMERA_FAILURE_TEXT[cam]} GPS distances still work.</p>}

      <header class="rf-top">
        <button type="button" class="rf-icon" aria-label="Close rangefinder" onClick={onClose} data-testid="rf-close">
          <Icon name="close" />
        </button>
        <div class="rf-modes" role="tablist" aria-label="Measuring method">
          {(['gps', 'flag'] as Mode[]).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} class={mode === m ? 'on' : ''} onClick={() => setMode(m)} data-testid={`rf-mode-${m}`}>
              {m === 'gps' ? 'GPS' : 'Flag size'}
            </button>
          ))}
        </div>
        <button type="button" class="rf-icon" aria-label="What can the rangefinder measure?" onClick={() => setHelp(true)} data-testid="rf-help">
          <Icon name="info" />
        </button>
      </header>

      {mode === 'gps' ? (
        <GpsMode
          units={units}
          storage={storage}
          savedTargets={course ? course.targets : {}}
          hole={hole}
          canSave={!!course && hole !== null}
          onSaveTarget={(p) => {
            if (!course || hole === null) return;
            updateGolf((g) => ({ ...g, courses: g.courses.map((c) => (c.id === course.id ? { ...c, targets: { ...c.targets, [hole]: p } } : c)) }));
          }}
          onUse={onUse}
          onManual={() => {
            onClose();
            requestAnimationFrame(() => document.getElementById('distance')?.focus());
          }}
        />
      ) : (
        <FlagMode
          videoRef={videoRef}
          camOn={cam === 'on'}
          units={units}
          longFov={profile.flagVfov}
          flagFt={profile.flagFt}
          onCalibrate={(v) => setProfile((p) => ({ ...p, flagVfov: v }))}
          onUse={onUse}
        />
      )}

      {help && <RangeHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

function GpsMode({
  units,
  storage,
  savedTargets,
  hole,
  canSave,
  onSaveTarget,
  onUse,
  onManual,
}: {
  units: ReturnType<typeof useApp>['units'];
  storage: ReturnType<typeof useApp>['storage'];
  savedTargets: Record<number, LatLon>;
  hole: number | null;
  canSave: boolean;
  onSaveTarget: (p: LatLon) => void;
  onUse: (r: RangeResult) => void;
  onManual: () => void;
}) {
  const gps = useGps(true);
  const [compassOk, setCompassOk] = useState(!compassNeedsPermission());
  const compass = useCompass(true, compassOk);
  const [map, setMap] = useState<CourseMap | null>(null);
  const [mapErr, setMapErr] = useState<OsmFailure | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [elev, setElev] = useState<{ id: string; ft: number } | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const fix = gps.status === 'ok' ? gps.fix : null;
  const heading = compass.status === 'ok' ? compass.heading : null;

  // Load (or reuse cached) map data once we know roughly where we are.
  useEffect(() => {
    if (!fix || map || mapLoading || mapErr) return;
    setMapLoading(true);
    loadCourseMap(fix, storage).then((r) => {
      setMapLoading(false);
      if (r.ok) setMap(r.map);
      else setMapErr(r.reason);
    });
  }, [fix !== null]);

  const targets: Target[] = useMemo(() => {
    const out: Target[] = [];
    for (const [h, p] of Object.entries(savedTargets)) out.push({ id: `saved-${h}`, label: `Hole ${h} (your pin)`, center: p, hole: Number(h), outline: null, saved: true });
    for (const g of map?.greens ?? []) out.push({ ...(g as MappedGreen), outline: g.outline, saved: false });
    return out;
  }, [savedTargets, map]);

  const inView = fix ? targetsInView(fix, heading, targets, { cone: 20, maxYards: 650 }) : [];
  const all = fix ? targetsInView(fix, null, targets, { maxYards: 650 }) : [];
  const holeTarget = hole !== null ? all.find((t) => t.target.hole === hole && t.target.saved) ?? all.find((t) => t.target.hole === hole) : undefined;
  const chosen = (picked && all.find((t) => t.target.id === picked)) || holeTarget || inView[0] || all[0] || null;

  const dists: GreenDistances | null = chosen && fix ? (chosen.target.outline ? greenDistances(fix, chosen.target.outline, chosen.target.center) : { front: chosen.yards, center: chosen.yards, back: chosen.yards }) : null;

  // Terrain elevation of the target vs you (approximate DEM), once per target.
  useEffect(() => {
    if (!chosen || !fix || elev?.id === chosen.target.id) return;
    const id = chosen.target.id;
    terrainElevations([fix, chosen.target.center]).then((e) => e && setElev({ id, ft: (e[1] - e[0]) / 0.3048 }));
  }, [chosen?.target.id, fix !== null]);

  const pm = fix ? gpsPlusMinus(fix.accuracy) : null;
  const quality = fix ? gpsQuality(fix.accuracy) : null;
  const elevFt = elev && chosen && elev.id === chosen.target.id ? elev.ft : null;
  const marker = chosen && heading !== null && Math.abs(chosen.offset) <= HFOV / 2 ? 50 + (chosen.offset / HFOV) * 100 : null;
  const unit = distanceLabel(units.distance);

  return (
    <>
      <div class="rf-reticle" aria-hidden="true">
        <span />
      </div>
      {marker !== null && chosen && (
        <div class="rf-marker" style={{ left: `${marker}%` }} aria-hidden="true">
          <Icon name="flag" size={22} />
          <span>{fmtDistance(chosen.yards, units)}</span>
        </div>
      )}

      <section class="rf-panel" aria-live="polite" data-testid="rf-panel">
        {gps.status === 'error' ? (
          <>
            <p class="rf-msg">{GPS_ERROR_TEXT[gps.reason]}</p>
            <button type="button" class="btn wide" onClick={onManual} data-testid="rf-manual">
              Type the distance instead
            </button>
          </>
        ) : !fix ? (
          <p class="rf-msg">
            <span class="spinner" aria-hidden="true" /> Finding your position…
          </p>
        ) : chosen && dists ? (
          <>
            <p class="rf-target">
              <Icon name="flag" size={16} /> {chosen.target.label}
              {heading !== null && chosen === inView[0] && !picked && !holeTarget ? ' · in view' : ''}
            </p>
            <p class="rf-yards" data-testid="rf-yards">
              {fmtDistance(dists.center, units)}
              <small> {unit.toUpperCase()}</small>
            </p>
            {chosen.target.outline && (
              <p class="rf-fb">
                Front <strong>{fmtDistance(dists.front, units)}</strong> · Back <strong>{fmtDistance(dists.back, units)}</strong>
              </p>
            )}
            <dl class="rf-facts">
              <div>
                <dt>GPS</dt>
                <dd class={`q-${quality}`}>
                  ±{fmtDistance(pm!, units)} {unit}
                </dd>
              </div>
              <div>
                <dt>Green</dt>
                <dd>{elevFt === null ? '—' : `${elevFt >= 0 ? '+' : '−'}${Math.abs(Math.round(feetTo(elevFt, units.height)))} ${heightLabel(units.height)} ≈`}</dd>
              </div>
              <div>
                <dt>Wind</dt>
                <dd>In Caddie</dd>
              </div>
            </dl>
            {quality === 'poor' && <p class="rf-warn">GPS is rough right now. Treat this as approximate.</p>}
            <button
              type="button"
              class="btn primary wide"
              data-testid="rf-use"
              onClick={() =>
                onUse({
                  yards: Math.round(dists.center),
                  green: chosen.target.outline ? dists : null,
                  elevationFt: elevFt,
                  source: chosen.target.saved ? 'saved' : 'gps',
                  label: `${chosen.target.label}: GPS ±${fmtDistance(pm!, units)} ${unit}${chosen.target.saved ? '' : ', green from OpenStreetMap'}${elevFt !== null ? ', elevation from terrain data (approx.)' : ''}.`,
                })
              }
            >
              Use {fmtDistance(dists.center, units)} {unit}
            </button>
            {all.length > 1 && (
              <div class="rf-targets" role="radiogroup" aria-label="Other targets">
                {all.slice(0, 6).map((t) => (
                  <button key={t.target.id} type="button" role="radio" aria-checked={t.target.id === chosen.target.id} class={t.target.id === chosen.target.id ? 'on' : ''} onClick={() => setPicked(t.target.id)}>
                    {t.target.hole !== null ? `#${t.target.hole}` : 'Green'} {fmtDistance(t.yards, units)}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p class="rf-msg" data-testid="rf-no-targets">
            {mapLoading
              ? 'Loading course map…'
              : mapErr
                ? `${OSM_FAILURE_TEXT[mapErr]} You can save a pin spot for each hole when you reach the green.`
                : 'No mapped greens near you. When you reach the green, save its spot below — next time HitWhat measures to it, even offline. Or try Flag size.'}
          </p>
        )}

        <div class="rf-tools">
          {compass.status === 'needs-permission' && (
            <button
              type="button"
              class="btn small ghost"
              onClick={async () => {
                setCompassOk(await requestCompassPermission());
              }}
              data-testid="rf-compass"
            >
              <Icon name="compass" size={18} /> Point to pick target
            </button>
          )}
          {canSave && fix && (
            <button
              type="button"
              class="btn small ghost"
              data-testid="rf-save-target"
              onClick={() => {
                onSaveTarget({ lat: fix.lat, lon: fix.lon });
                setSavedMsg(`Saved this spot as the hole ${hole} pin (±${fmtDistance(gpsPlusMinus(fix.accuracy), units)} ${unit}).`);
              }}
            >
              <Icon name="flag" size={18} /> I’m at the pin: save for hole {hole}
            </button>
          )}
        </div>
        {savedMsg && <p class="rf-fine">{savedMsg}</p>}
        {map && map.greens.length > 0 && <p class="rf-fine">{OSM_ATTRIBUTION}</p>}
      </section>
    </>
  );
}

function FlagMode({
  videoRef,
  camOn,
  units,
  longFov,
  flagFt,
  onCalibrate,
  onUse,
}: {
  videoRef: { current: HTMLVideoElement | null };
  camOn: boolean;
  units: ReturnType<typeof useApp>['units'];
  longFov: number | null;
  flagFt: 7 | 8;
  onCalibrate: (v: number) => void;
  onUse: (r: RangeResult) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [frozen, setFrozen] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [ys, setYs] = useState<[number, number]>([0.4, 0.6]);
  const [zoom, setZoom] = useState(1);
  const [moved, setMoved] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [known, setKnown] = useState('');
  const drag = useRef<0 | 1 | null>(null);
  const unit = distanceLabel(units.distance);

  const freeze = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    setFrozen({ w: v.videoWidth, h: v.videoHeight });
    // Fit the whole frame in the viewing area so marker positions map exactly onto image pixels.
    const area = areaRef.current?.getBoundingClientRect();
    if (area) {
      const k = Math.min(area.width / v.videoWidth, area.height / v.videoHeight);
      setBox({ w: v.videoWidth * k, h: v.videoHeight * k });
    }
    setYs([0.4, 0.6]);
    setZoom(1);
    setMoved(false);
  };

  // Field of view for this frame's vertical axis, from the long-side calibration.
  const vfov = (f: { w: number; h: number }) => {
    const long = longFov ?? DEFAULT_VFOV_DEG;
    if (f.h >= f.w) return long;
    return (2 * Math.atan(Math.tan(((long / 2) * Math.PI) / 180) * (f.h / f.w)) * 180) / Math.PI;
  };
  const span = frozen ? Math.abs(ys[1] - ys[0]) * frozen.h : 0;
  const reading = frozen && moved ? flagDistance(span, frozen.h, vfov(frozen), flagFt) : null;
  // Uncalibrated phones add field-of-view uncertainty (~15%).
  const plusMinus = reading ? (longFov === null ? Math.hypot(reading.plusMinus, reading.yards * 0.15) : reading.plusMinus) : 0;

  const onPointer = (e: PointerEvent) => {
    if (drag.current === null || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setMoved(true);
    setYs((cur) => (drag.current === 0 ? [y, cur[1]] : [cur[0], y]));
  };

  const calibrate = () => {
    if (!frozen) return;
    const k = parseFloat(known);
    const yards = units.distance === 'm' ? k / 0.9144 : k;
    const v = calibrateVfov(span, frozen.h, yards, flagFt);
    if (v === null) return;
    const long = frozen.h >= frozen.w ? v : (2 * Math.atan(Math.tan(((v / 2) * Math.PI) / 180) * (frozen.w / frozen.h)) * 180) / Math.PI;
    if (long > 20 && long < 120) onCalibrate(long);
    setCalibrating(false);
  };

  return (
    <>
      <div ref={areaRef} class={`rf-frozen${frozen ? ' on' : ''}`} onPointerMove={onPointer} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
        <div class="rf-zoom" style={{ transform: `scale(${zoom})` }}>
          <div class="rf-frame" ref={wrapRef} style={box ? { width: `${box.w}px`, height: `${box.h}px` } : undefined}>
            <canvas ref={canvasRef} aria-label="Frozen camera frame" />
            {frozen &&
              ([0, 1] as const).map((i) => (
                <div
                  key={i}
                  class="rf-handle"
                  style={{ top: `${ys[i] * 100}%` }}
                  role="slider"
                  aria-label={i === 0 ? 'Top of flagstick' : 'Bottom of flagstick'}
                  aria-valuenow={Math.round(ys[i] * 1000)}
                  aria-valuemin={0}
                  aria-valuemax={1000}
                  tabIndex={0}
                  onPointerDown={(e) => {
                    drag.current = i;
                    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                  }}
                  onPointerMove={onPointer}
                  onKeyDown={(e) => {
                    const step = e.key === 'ArrowUp' ? -0.002 : e.key === 'ArrowDown' ? 0.002 : 0;
                    if (step) setMoved(true);
                    if (step) setYs((cur) => (i === 0 ? [cur[0] + step, cur[1]] : [cur[0], cur[1] + step]));
                  }}
                />
              ))}
          </div>
        </div>
      </div>
      {!frozen && (
        <div class="rf-reticle flag" aria-hidden="true">
          <span />
        </div>
      )}

      <section class="rf-panel" aria-live="polite">
        {!frozen ? (
          <>
            <p class="rf-msg">Put the flagstick in the middle of the frame, hold steady, and freeze.</p>
            <button type="button" class="btn primary wide" disabled={!camOn} onClick={freeze} data-testid="rf-freeze">
              <Icon name="camera" size={20} /> Freeze frame
            </button>
            <p class="rf-fine">Works best inside about 150 yards with the whole flagstick visible. Uses a {flagFt} ft flagstick (change in Settings).</p>
          </>
        ) : (
          <>
            <p class="rf-target">Drag the bars to the top and bottom of the flagstick</p>
            {reading ? (
              <p class="rf-yards">
                ≈ {fmtDistance(reading.yards, units)}
                <small>
                  {' '}
                  {unit.toUpperCase()} ±{fmtDistance(plusMinus, units)}
                </small>
              </p>
            ) : (
              <p class="rf-msg">Zoom in, then drag the yellow bars onto the top and bottom of the flagstick.</p>
            )}
            <p class="rf-fine">{longFov === null ? 'Uncalibrated: calibrate once for a tighter range.' : 'Calibrated for this phone.'} Flag sizing is approximate; GPS to a mapped green is usually better.</p>
            <div class="row">
              <button type="button" class="btn small ghost" onClick={() => setZoom(zoom >= 4 ? 1 : zoom * 2)}>
                Zoom: {zoom}×
              </button>
              <button type="button" class="btn small ghost" onClick={() => setFrozen(null)}>
                Retake
              </button>
              <button type="button" class="btn small ghost" onClick={() => setCalibrating(!calibrating)}>
                Calibrate
              </button>
            </div>
            {calibrating && (
              <div class="row">
                <input class="text-input" inputMode="decimal" placeholder={`Known distance (${unit})`} value={known} onInput={(e) => setKnown((e.currentTarget as HTMLInputElement).value)} aria-label="Known distance to this flag" />
                <button type="button" class="btn small" onClick={calibrate}>
                  Save
                </button>
              </div>
            )}
            {reading && (
              <button
                type="button"
                class="btn primary wide"
                onClick={() =>
                  onUse({
                    yards: Math.round(reading.yards),
                    green: null,
                    elevationFt: null,
                    source: 'flag',
                    label: `Flag sizing: approximate, ±${fmtDistance(plusMinus, units)} ${unit}.`,
                  })
                }
              >
                Use ≈ {fmtDistance(reading.yards, units)} {unit}
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}

function RangeHelp({ onClose }: { onClose: () => void }) {
  return (
    <div class="rf-help" role="dialog" aria-label="What the rangefinder can measure" data-testid="rf-help-panel">
      <h2>What HitWhat can measure</h2>
      <ul>
        <li>
          <strong>GPS to the green.</strong> Your phone’s GPS position to a green mapped in OpenStreetMap, or to a pin spot you saved. Accuracy is your GPS accuracy, shown as ± on screen (typically 3–10 yards in the open).
        </li>
        <li>
          <strong>Front and back.</strong> Worked out from the green’s mapped outline along your line to it.
        </li>
        <li>
          <strong>Pointing.</strong> The compass picks which green you’re aiming at. Phone compasses can be off by 10–15°, so the on-screen marker is approximate. Your yardage doesn’t depend on it.
        </li>
        <li>
          <strong>Green height.</strong> From a free terrain model with roughly 90 m resolution. Good for “a bit uphill”, not for exact feet.
        </li>
        <li>
          <strong>Flag size.</strong> The flagstick’s apparent height gives an approximate distance. Error grows with distance; the ± shows it.
        </li>
      </ul>
      <h3>What it can’t do</h3>
      <ul>
        <li>No laser: a phone camera can’t time light like a real rangefinder.</li>
        <li>iPhone LiDAR and depth data aren’t available to web apps in Safari, and LiDAR only reaches a few metres anyway.</li>
        <li>The camera can’t find the exact pin on its own. Pin position comes from your saved spot or what you tell the caddie.</li>
        <li>Wind on the course can’t be measured here. Use live weather in Caddie.</li>
      </ul>
      <button type="button" class="btn primary wide" onClick={onClose}>
        Got it
      </button>
    </div>
  );
}
