import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { GreenDistances } from '../core/geo';
import type { HandicapReport } from '../core/handicap';
import type { Round } from '../core/round';
import type { ClubDistanceStat } from '../core/shots';
import type { PinPosition } from '../core/strategy';
import type { Club, ShotInput } from '../core/types';
import type { Units } from '../core/units';
import type { GolfData } from '../state/golf';
import type { KeyValueStore, Profile } from '../state/profile';

export type Tab = 'round' | 'caddie' | 'stats' | 'swing' | 'handicap';
export const TABS: Tab[] = ['round', 'caddie', 'stats', 'swing', 'handicap'];

/** What the rangefinder hands back to the caddie. */
export interface RangeResult {
  yards: number;
  green: GreenDistances | null;
  elevationFt: number | null;
  source: 'gps' | 'flag' | 'saved';
  label: string;
}

export interface AppState {
  profile: Profile;
  setProfile: (p: Profile | ((p: Profile) => Profile)) => void;
  golf: GolfData;
  updateGolf: (fn: (g: GolfData) => GolfData) => void;
  storage: KeyValueStore | null;
  storageOk: boolean;
  units: Units;
  /** The bag with the carries the caddie actually uses (learned where there's enough data). */
  clubs: Club[];
  clubStats: Map<string, ClubDistanceStat>;
  learned: Set<string>;
  handicap: HandicapReport;
  active: Round | null;
  go: (tab: Tab) => void;
  openSettings: () => void;
  openRangefinder: () => void;
  /** Opens the range session, optionally on a club. */
  openPractice: (clubId?: string) => void;
  shot: ShotInput;
  setShot: (fn: (s: ShotInput) => ShotInput) => void;
  pin: PinPosition | null;
  setPin: (p: PinPosition | null) => void;
  range: RangeResult | null;
  setRange: (r: RangeResult | null) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(AppContext);
  if (!v) throw new Error('AppContext missing');
  return v;
}

/** The golfer's handicap for strategy: official if entered, else the HitWhat estimate. */
export const playingIndex = (s: Pick<AppState, 'profile' | 'handicap'>) => s.profile.officialIndex ?? s.handicap.estimate;
