/**
 * Keeps the screen on while `on` is true, using the Screen Wake Lock API.
 * The browser drops the lock whenever the app is hidden, so it is taken again
 * each time HitWhat comes back. Does nothing where the API is missing.
 */
import { useEffect } from 'preact/hooks';

export const wakeLockSupported = () => typeof navigator !== 'undefined' && typeof navigator.wakeLock?.request === 'function';

export function useWakeLock(on: boolean): void {
  useEffect(() => {
    if (!on || !wakeLockSupported()) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const s = await navigator.wakeLock.request('screen');
        if (stopped) void s.release().catch(() => {});
        else sentinel = s;
      } catch {
        // Refused (low battery mode, not visible): the screen just sleeps as normal.
      }
    };
    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [on]);
}
