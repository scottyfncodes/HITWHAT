import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { handicapReport } from '../core/handicap';
import { roundTotals, toParText, holeNumber } from '../core/round';
import { clubStats, effectiveClubs, learnedClubIds } from '../core/shots';
import type { PinPosition } from '../core/strategy';
import type { ShotInput } from '../core/types';
import { activeRound, loadGolf, saveGolf, type GolfData } from '../state/golf';
import { loadProfile, loadSituation, safeStorage, saveProfile, saveSituation, type Profile } from '../state/profile';
import { requestPersistence } from '../state/swings';
import { CaddieTab } from './CaddieTab';
import { RangeSession } from './Distances';
import { AppContext, ROUTES, TABS, tabOf, type AppState, type RangeResult, type Tab } from './context';
import { DrillSheet } from './Practice';
import type { DrillId } from '../core/practice';
import { HandicapTab } from './HandicapTab';
import { Icon } from './kit';
import { Rangefinder } from './Rangefinder';
import { RoundTab } from './RoundTab';
import { Settings } from './Settings';
import { StatsTab } from './StatsTab';
import { SwingTab } from './SwingTab';
import { Welcome } from './Welcome';
import { Wordmark } from './Wordmark';

const TAB_META: Record<Tab, { label: string; icon: Parameters<typeof Icon>[0]['name'] }> = {
  round: { label: 'Round', icon: 'round' },
  caddie: { label: 'Caddie', icon: 'caddie' },
  stats: { label: 'Stats', icon: 'stats' },
  swing: { label: 'Swing', icon: 'swing' },
  handicap: { label: 'Handicap', icon: 'handicap' },
  practice: { label: 'Practice', icon: 'stats' },
};

const tabFromHash = (): Tab => {
  const h = (typeof location !== 'undefined' ? location.hash.slice(1) : '') as Tab;
  return ROUTES.includes(h) ? h : 'round';
};

export function App() {
  const storage = useMemo(() => safeStorage(), []);
  const [profile, setProfileState] = useState<Profile>(() => loadProfile(storage));
  const [golf, setGolf] = useState<GolfData>(() => loadGolf(storage));
  const [shot, setShotState] = useState<ShotInput>(() => loadSituation(storage));
  const [pin, setPin] = useState<PinPosition | null>(null);
  const [range, setRange] = useState<RangeResult | null>(null);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [practice, setPractice] = useState<{ club: string | null } | null>(null);
  const [drill, setDrill] = useState<DrillId | null>(null);
  const [storageOk, setStorageOk] = useState(storage !== null);

  useEffect(() => {
    if (!saveProfile(profile, storage)) setStorageOk(false);
  }, [profile, storage]);
  useEffect(() => {
    if (!saveGolf(golf, storage)) setStorageOk(false);
  }, [golf, storage]);
  useEffect(() => {
    saveSituation(shot, storage);
  }, [shot, storage]);
  useEffect(() => {
    // Ask once for durable storage so iOS doesn't clear rounds of an unused web app.
    if (golf.rounds.length) void requestPersistence();
  }, [golf.rounds.length > 0]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (profile.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', profile.theme);
  }, [profile.theme]);

  const go = useCallback((t: Tab) => {
    if (location.hash !== `#${t}`) history.pushState(null, '', `#${t}`);
    setTab(t);
    window.scrollTo({ top: 0 });
  }, []);

  const setProfile = useCallback((p: Profile | ((p: Profile) => Profile)) => setProfileState((cur) => (typeof p === 'function' ? p(cur) : p)), []);
  const updateGolf = useCallback((fn: (g: GolfData) => GolfData) => setGolf(fn), []);
  const setShot = useCallback((fn: (s: ShotInput) => ShotInput) => setShotState(fn), []);

  const stats = useMemo(() => clubStats(golf.shots), [golf.shots]);
  const clubs = useMemo(() => effectiveClubs(profile.clubs, stats, profile.learnFromShots), [profile.clubs, stats, profile.learnFromShots]);
  const learned = useMemo(() => learnedClubIds(profile.clubs, stats, profile.learnFromShots), [profile.clubs, stats, profile.learnFromShots]);
  const handicap = useMemo(() => handicapReport(golf.rounds), [golf.rounds]);
  const active = activeRound(golf);

  const state: AppState = {
    profile,
    setProfile,
    golf,
    updateGolf,
    storage,
    storageOk,
    units: profile.units,
    clubs,
    clubStats: stats,
    learned,
    handicap,
    active,
    go,
    openSettings: () => setSettingsOpen(true),
    openRangefinder: () => setRangeOpen(true),
    openPractice: (clubId?: string) => setPractice({ club: clubId ?? null }),
    openDrill: (d: DrillId) => setDrill(d),
    shot,
    setShot,
    pin,
    setPin,
    range,
    setRange,
  };

  const live = active ? roundTotals(active) : null;

  if (!profile.onboarded) {
    return (
      <AppContext.Provider value={state}>
        <Welcome
          onDone={(next) => {
            setProfile((p) => ({ ...p, onboarded: true }));
            go(next);
          }}
        />
      </AppContext.Provider>
    );
  }

  return (
    <AppContext.Provider value={state}>
      <div class="app">
        <header class="topbar">
          <Wordmark />
          {active && live && tab !== 'round' && (
            <button type="button" class="round-pill" onClick={() => go('round')} data-testid="round-pill">
              Hole {holeNumber(active, active.current)} · <strong>{live.holesPlayed ? toParText(live.toPar) : 'E'}</strong>
            </button>
          )}
          <button type="button" class="icon-btn" aria-label="Settings and bag" onClick={() => setSettingsOpen(true)} data-testid="open-settings">
            <Icon name="settings" />
          </button>
        </header>

        <main class="screen" id="main">
          {tab === 'round' && <RoundTab />}
          {tab === 'caddie' && <CaddieTab />}
          {(tab === 'stats' || tab === 'practice') && <StatsTab view={tab === 'practice' ? 'practice' : 'game'} />}
          {tab === 'swing' && <SwingTab />}
          {tab === 'handicap' && <HandicapTab />}
        </main>

        <nav class="tabbar" aria-label="Main">
          {TABS.map((t) => (
            <a
              key={t}
              href={`#${t}`}
              class={`tab${t === tabOf(tab) ? ' on' : ''}`}
              aria-current={t === tabOf(tab) ? 'page' : undefined}
              data-testid={`tab-${t}`}
              onClick={(e) => {
                e.preventDefault();
                go(t);
              }}
            >
              <Icon name={TAB_META[t].icon} size={26} />
              <span>{TAB_META[t].label}</span>
            </a>
          ))}
        </nav>

        {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
        {drill && <DrillSheet drill={drill} onClose={() => setDrill(null)} />}
        {practice && <RangeSession startClub={practice.club} onClose={() => setPractice(null)} />}
        {rangeOpen && (
          <Rangefinder
            onClose={() => setRangeOpen(false)}
            onUse={(r) => {
              setRange(r);
              setShot((s) => ({ ...s, distance: r.yards, elevationFt: r.elevationFt !== null ? Math.max(-300, Math.min(300, Math.round(r.elevationFt))) : s.elevationFt }));
              setRangeOpen(false);
              go('caddie');
            }}
          />
        )}
      </div>
    </AppContext.Provider>
  );
}
