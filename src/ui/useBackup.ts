/** Backup status and a one-tap save, shared by the Round home reminder and Settings. */
import { useEffect, useState } from 'preact/hooks';
import { saveBackupFile, type SaveOutcome } from '../services/backupFile';
import { backupStatus, buildBackup, snoozeUntil } from '../state/backup';
import { listSwings, type SavedSwing } from '../state/swings';
import { useApp } from './context';

export function useBackup() {
  const { profile, golf, setProfile } = useApp();
  // Swing analyses are read ahead of the tap: iOS only opens the share sheet
  // straight from a gesture, so there's no time to wait on IndexedDB then.
  const [swings, setSwings] = useState<SavedSwing[] | null>(null);
  useEffect(() => {
    listSwings()
      .then(setSwings)
      .catch(() => setSwings([]));
  }, []);

  const status = backupStatus(golf, profile.lastBackupAt, profile.backupSnoozeUntil);

  const save = async (): Promise<SaveOutcome> => {
    const now = Date.now();
    const list = swings ?? (await listSwings().catch(() => []));
    const outcome = await saveBackupFile(buildBackup(profile, golf, list, now));
    if (outcome !== 'cancelled') setProfile((p) => ({ ...p, lastBackupAt: now, backupSnoozeUntil: null }));
    return outcome;
  };

  const snooze = () => setProfile((p) => ({ ...p, backupSnoozeUntil: snoozeUntil() }));

  return { status, save, snooze };
}
