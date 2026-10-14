/** Your bag, preferences, and where your data lives. Saved on every change. */
import { useEffect, useState } from 'preact/hooks';
import { findGapIssues } from '../core/clubs';
import { MIN_SHOTS_TO_LEARN, learnableClub, type ShotRecord } from '../core/shots';
import type { Club } from '../core/types';
import { IMPERIAL, METRIC, distanceLabel, feetTo, heightLabel, toFeet, toYards, yardsTo } from '../core/units';
import { buildBackup, parseBackup } from '../state/backup';
import { newId } from '../state/golf';
import { defaultProfile } from '../state/profile';
import { clearSwings, listSwings, saveSwing, storageEstimate } from '../state/swings';
import { NumberField, Segmented } from './controls';
import { useApp } from './context';
import { Badge, Sheet } from './kit';
import { Wordmark } from './Wordmark';

export function Settings({ onClose }: { onClose: () => void }) {
  const { profile, setProfile, golf, updateGolf, storageOk, clubStats, units: u } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const set = (patch: Partial<typeof profile>) => setProfile((p) => ({ ...p, ...patch }));
  const setClub = (id: string, patch: Partial<Club>) => setProfile((p) => ({ ...p, clubs: p.clubs.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const gaps = findGapIssues(profile.clubs.filter((c) => c.carry > 0));
  const unit = distanceLabel(u.distance);

  useEffect(() => {
    storageEstimate().then((e) => e && setUsage(`${(e.usage / 1e6).toFixed(1)} MB used on this phone`));
  }, []);

  const exportBackup = async () => {
    const swings = await listSwings().catch(() => []);
    const blob = new Blob([JSON.stringify(buildBackup(profile, golf, swings))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hitwhat-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const importBackup = async (file: File) => {
    const r = parseBackup(await file.text());
    if (!r.ok) return setRestoreMsg(r.reason);
    setProfile({ ...r.profile, onboarded: true });
    updateGolf(() => r.golf);
    for (const s of r.swings) await saveSwing(s, null).catch(() => {});
    setRestoreMsg(`Restored ${r.golf.rounds.length} rounds, ${r.golf.shots.length} shots, ${r.golf.practice.length} practice sessions and ${r.swings.length} swing analyses.`);
  };

  const addShot = (clubId: string, distanceYds: number, full: boolean) => {
    const s: ShotRecord = { id: newId(), at: Date.now(), clubId, distance: Math.round(distanceYds), source: 'manual', full, roundId: null, hole: null, from: null };
    updateGolf((g) => ({ ...g, shots: [...g.shots, s] }));
  };

  return (
    <Sheet title="Settings" onClose={onClose} testid="settings">
      {!storageOk && (
        <p class="banner warn" role="status">
          This browser isn’t letting HitWhat save (private browsing?). Changes will reset when you close the app.
        </p>
      )}

      <section class="card">
        <h3 class="card-title">My bag</h3>
        <p class="muted">Your stock full-swing carry for each club. As you track shots, your real averages show up next to them.</p>
        <label class="switch">
          <input type="checkbox" checked={profile.learnFromShots} onChange={(e) => set({ learnFromShots: (e.currentTarget as HTMLInputElement).checked })} />
          <span>Let the caddie use my tracked averages (irons, hybrids and wedges with {MIN_SHOTS_TO_LEARN}+ full shots)</span>
        </label>
        <ul class="bag" data-testid="bag">
          {profile.clubs.map((c) => {
            const st = clubStats.get(c.id);
            const expanded = open === c.id;
            return (
              <li key={c.id} class={c.inBag ? '' : 'out'}>
                <div class="bag-row">
                  <label class="bag-toggle">
                    <input type="checkbox" checked={c.inBag} onChange={(e) => setClub(c.id, { inBag: (e.currentTarget as HTMLInputElement).checked })} />
                    <span>{c.name}</span>
                  </label>
                  <span class="bag-carry">
                    <NumberField
                      id={`carry-${c.id}`}
                      label={`${c.name} carry in ${unit}`}
                      value={c.carry > 0 ? yardsTo(c.carry, u.distance) : null}
                      min={1}
                      max={400}
                      class="carry-input"
                      onChange={(v) => setClub(c.id, { carry: v === null ? 0 : toYards(v, u.distance) })}
                    />
                    <small>{unit}</small>
                  </span>
                  <button type="button" class="bag-more" aria-expanded={expanded} aria-label={`${c.name} details`} onClick={() => setOpen(expanded ? null : c.id)}>
                    {st ? (
                      <>
                        <span>{Math.round(yardsTo(st.recent, u.distance))}</span>
                        <small>avg</small>
                      </>
                    ) : (
                      <small>Log</small>
                    )}
                  </button>
                </div>
                {expanded && (
                  <ClubDetail
                    club={c}
                    unit={unit}
                    units={u}
                    stat={st ?? null}
                    note={profile.clubNotes[c.id] ?? ''}
                    onNote={(n) => set({ clubNotes: { ...profile.clubNotes, [c.id]: n } })}
                    onUseAverage={() => st && setClub(c.id, { carry: Math.round(st.recent) })}
                    onAddShot={(d, full) => addShot(c.id, d, full)}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {gaps.length > 0 && (
          <ul class="gaps" aria-label="Distance gaps">
            {gaps.map((g) => (
              <li key={g.longer.id}>
                {g.longer.short} → {g.shorter.short}: {Math.round(yardsTo(g.gap, u.distance))} {unit} {g.gap < 4 ? '— these two overlap' : '— big gap, expect choked-down shots'}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="card">
        <h3 class="card-title">Display</h3>
        <Segmented
          label="Theme"
          value={profile.theme}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'light', label: 'Sun (light)' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(theme) => set({ theme })}
          columns={3}
        />
        <p class="fine">Sun mode is the easiest to read in bright light.</p>
        <Segmented
          label="Unit system"
          value={u.distance === 'm' ? 'metric' : 'imperial'}
          options={[
            { value: 'imperial', label: 'Yards · mph · °F' },
            { value: 'metric', label: 'Meters · km/h · °C' },
          ]}
          onChange={(v) => set({ units: v === 'metric' ? { ...METRIC } : { ...IMPERIAL } })}
          columns={2}
        />
      </section>

      <section class="card">
        <h3 class="card-title">You</h3>
        <p class="sub">Handedness</p>
        <Segmented
          label="Handedness"
          value={profile.handedness}
          options={[
            { value: 'right', label: 'Right-handed' },
            { value: 'left', label: 'Left-handed' },
          ]}
          onChange={(v) => set({ handedness: v })}
          columns={2}
        />
        <p class="sub">When you miss the number, you usually…</p>
        <Segmented
          label="Distance tendency"
          value={profile.tendency}
          options={[
            { value: 'short', label: 'Come up short' },
            { value: 'neutral', label: 'Hit it right' },
            { value: 'long', label: 'Go long' },
          ]}
          onChange={(v) => set({ tendency: v })}
          columns={3}
        />
        <p class="sub">Home course altitude (where your carries were measured)</p>
        <div class="inline-field">
          <NumberField
            id="home-altitude"
            label={`Home altitude in ${heightLabel(u.height)}`}
            value={Math.round(feetTo(profile.baseline.altitudeFt, u.height))}
            min={0}
            max={14000}
            class="carry-input wide"
            onChange={(v) => set({ baseline: { ...profile.baseline, altitudeFt: Math.min(14000, toFeet(v ?? 0, u.height)) } })}
          />
          <small>{heightLabel(u.height)}</small>
        </div>
      </section>

      <section class="card">
        <h3 class="card-title">Rangefinder</h3>
        <p class="sub">Flagstick height for flag sizing</p>
        <Segmented
          label="Flagstick height"
          value={String(profile.flagFt)}
          options={[
            { value: '7', label: '7 ft (most courses)' },
            { value: '8', label: '8 ft' },
          ]}
          onChange={(v) => set({ flagFt: v === '8' ? 8 : 7 })}
          columns={2}
        />
        <p class="fine">
          {profile.flagVfov === null ? 'Not calibrated. Calibrate from the rangefinder’s Flag size mode at a known distance.' : 'Calibrated for this phone.'}{' '}
          {profile.flagVfov !== null && (
            <button type="button" class="link" onClick={() => set({ flagVfov: null })}>
              Reset calibration
            </button>
          )}
        </p>
      </section>

      <section class="card" data-testid="privacy">
        <h3 class="card-title">Your data</h3>
        <ul class="plain-list">
          <li>Rounds, scores, shots and settings are stored in this browser on this phone. There’s no account and no server copy.</li>
          <li>Swing videos stay on this phone and are analyzed on it. They are never uploaded.</li>
          <li>Location is used only on your phone, to measure distances and find course maps. To load a course map, HitWhat sends your rough position to OpenStreetMap’s free map service; for live weather and terrain height, to Open-Meteo.</li>
          <li>Add HitWhat to your Home Screen (Share › Add to Home Screen). Safari can clear data for websites you haven’t opened in a while; Home Screen apps keep theirs.</li>
        </ul>
        {usage && <p class="fine">{usage}.</p>}
        <div class="row">
          <button type="button" class="btn ghost" onClick={exportBackup} data-testid="export-backup">
            Export backup
          </button>
          <label class="btn ghost file-btn">
            Restore backup
            <input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void importBackup(f); }} />
          </label>
        </div>
        <p class="fine">Backups include rounds, courses, shots, practice sessions, settings and swing analyses (not the videos). Keep one in Files or iCloud Drive to move to a new phone.</p>
        {restoreMsg && (
          <p class="banner" role="status">
            {restoreMsg}
          </p>
        )}
      </section>

      <section class="card">
        <h3 class="card-title">Start over</h3>
        {confirmReset ? (
          <div class="row">
            <button
              type="button"
              class="btn danger"
              onClick={() => {
                setProfile({ ...defaultProfile(), onboarded: true });
                updateGolf(() => ({ rounds: [], courses: [], shots: [], practice: [] }));
                void clearSwings().catch(() => {});
                setConfirmReset(false);
              }}
            >
              Erase everything
            </button>
            <button type="button" class="btn ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div class="row">
            <button type="button" class="btn ghost" onClick={() => setProfile((p) => ({ ...defaultProfile(), onboarded: true, officialIndex: p.officialIndex }))}>
              Reset bag and settings
            </button>
            <button type="button" class="btn ghost" onClick={() => setConfirmReset(true)}>
              Erase all data…
            </button>
          </div>
        )}
      </section>

      <footer class="about">
        <Wordmark />
        <p class="tagline">What do I hit here?</p>
        <p class="muted">Free, private, and built to work with no signal.</p>
      </footer>
    </Sheet>
  );
}

function ClubDetail({
  club,
  unit,
  units,
  stat,
  note,
  onNote,
  onUseAverage,
  onAddShot,
}: {
  club: Club;
  unit: string;
  units: ReturnType<typeof useApp>['units'];
  stat: ReturnType<typeof useApp>['clubStats'] extends Map<string, infer V> ? V | null : never;
  note: string;
  onNote: (n: string) => void;
  onUseAverage: () => void;
  onAddShot: (yds: number, full: boolean) => void;
}) {
  const [shot, setShot] = useState<number | null>(null);
  return (
    <div class="club-detail" data-testid={`club-${club.id}`}>
      <dl class="club-facts">
        <div>
          <dt>Typical carry</dt>
          <dd>
            {Math.round(yardsTo(club.carry, units.distance))} {unit}
          </dd>
        </div>
        <div>
          <dt>Recent average</dt>
          <dd>{stat ? `${Math.round(yardsTo(stat.recent, units.distance))} ${unit}` : '—'}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{stat ? <Badge tone={stat.reliability === 'high' ? 'good' : stat.reliability === 'medium' ? 'ok' : 'muted'}>{stat.reliability === 'high' ? 'High' : stat.reliability === 'medium' ? 'Medium' : 'Low'}</Badge> : 'No shots yet'}</dd>
        </div>
      </dl>
      {stat && (
        <p class="fine">
          {stat.count} full shot{stat.count === 1 ? '' : 's'}, spread ±{Math.round(yardsTo(stat.spread, units.distance))} {unit}.{' '}
          {learnableClub(club) ? '' : 'GPS-measured woods include roll, so the caddie keeps your typed carry for this club.'}
        </p>
      )}
      {stat && Math.abs(stat.recent - club.carry) >= 3 && (
        <button type="button" class="btn small ghost" onClick={onUseAverage}>
          Set typical carry to {Math.round(yardsTo(stat.recent, units.distance))} {unit}
        </button>
      )}
      <div class="row">
        <NumberField id={`shot-${club.id}`} label={`Add a measured ${club.name} shot in ${unit}`} value={shot} min={1} max={400} class="text-input" placeholder={`Measured ${unit}`} onChange={setShot} />
        <button
          type="button"
          class="btn small"
          disabled={shot === null || shot < 5}
          onClick={() => {
            if (shot === null) return;
            onAddShot(toYards(shot, units.distance), true);
            setShot(null);
          }}
        >
          Add shot
        </button>
      </div>
      <p class="fine">From a launch monitor, range or rangefinder. Full swings only.</p>
      <input class="text-input" placeholder="Notes (e.g. tends to draw, good from rough)" value={note} maxLength={140} onInput={(e) => onNote((e.currentTarget as HTMLInputElement).value)} aria-label={`${club.name} notes`} />
    </div>
  );
}
