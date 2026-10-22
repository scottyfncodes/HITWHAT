/**
 * Live conditions: GPS position → Open-Meteo current weather + elevation.
 * Open-Meteo is free and keyless, so it's called straight from the browser;
 * no secret is involved. Everything here is optional — the manual inputs
 * always work.
 */
export interface LiveConditions {
  windMph: number;
  gustMph: number | null;
  /** Meteorological direction the wind blows FROM, degrees clockwise from north. */
  windFromDeg: number;
  temperatureF: number;
  altitudeFt: number | null;
  fetchedAt: number;
}

export type ConditionsFailure = 'unsupported' | 'denied' | 'position-unavailable' | 'offline' | 'timeout' | 'weather-unavailable';

export type ConditionsResult = { ok: true; conditions: LiveConditions } | { ok: false; reason: ConditionsFailure };

export const CONDITIONS_FAILURE_TEXT: Record<ConditionsFailure, string> = {
  unsupported: "This browser can't share location. Enter wind and temperature by hand.",
  denied: 'Location is off for HitWhat. Enter wind by hand, or allow location in Settings › Safari.',
  'position-unavailable': "Couldn't find your position. Enter wind by hand.",
  offline: "You're offline. Enter wind by hand. The caddie still works.",
  timeout: 'Weather took too long. Enter wind by hand.',
  'weather-unavailable': 'Weather service is unavailable. Enter wind by hand.',
};

export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

export function weatherUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'mph',
    temperature_unit: 'fahrenheit',
  });
  return `${WEATHER_URL}?${q}`;
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Parse and sanity-check an Open-Meteo response. Returns null for anything unexpected. */
export function parseWeather(json: unknown, now = Date.now()): LiveConditions | null {
  if (typeof json !== 'object' || json === null) return null;
  const j = json as Record<string, unknown>;
  const cur = j.current as Record<string, unknown> | undefined;
  if (!cur) return null;
  const { temperature_2m: t, wind_speed_10m: w, wind_direction_10m: dir, wind_gusts_10m: g } = cur;
  if (!finite(t) || !finite(w) || !finite(dir)) return null;
  if (w < 0 || w > 150 || t < -60 || t > 140) return null;
  const elevM = j.elevation;
  return {
    windMph: w,
    gustMph: finite(g) ? g : null,
    windFromDeg: ((dir % 360) + 360) % 360,
    temperatureF: t,
    altitudeFt: finite(elevM) ? elevM / 0.3048 : null,
    fetchedAt: now,
  };
}

/**
 * Convert an absolute wind direction to the golfer's frame, given which
 * compass direction they're aiming. Output matches `Wind.fromDeg`
 * (0 = into the face, 90 = from the right).
 */
export function relativeWindDeg(windFromDeg: number, aimingDeg: number): number {
  return (((windFromDeg - aimingDeg) % 360) + 360) % 360;
}

function getPosition(timeoutMs: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 5 * 60 * 1000,
      timeout: timeoutMs,
    });
  });
}

export async function fetchLiveConditions(opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<ConditionsResult> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return { ok: false, reason: 'unsupported' };
  if (isOffline()) return { ok: false, reason: 'offline' };

  let pos: GeolocationPosition;
  try {
    pos = await getPosition(timeoutMs);
  } catch (e) {
    const code = (e as GeolocationPositionError)?.code;
    if (code === 1) return { ok: false, reason: 'denied' };
    if (code === 3) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'position-unavailable' };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await (opts.fetchImpl ?? fetch)(weatherUrl(pos.coords.latitude, pos.coords.longitude), { signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: 'weather-unavailable' };
    const parsed = parseWeather(await res.json());
    return parsed ? { ok: true, conditions: parsed } : { ok: false, reason: 'weather-unavailable' };
  } catch {
    if (ctrl.signal.aborted) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: isOffline() ? 'offline' : 'weather-unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
