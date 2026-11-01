/**
 * Hands a backup to the golfer as a file. On iPhone the share sheet is the
 * reliable route (Save to Files, iCloud Drive, AirDrop); elsewhere, a download.
 */
import { backupFileName, type Backup } from '../state/backup';

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

export async function saveBackupFile(backup: Backup): Promise<SaveOutcome> {
  const text = JSON.stringify(backup);
  const name = backupFileName(backup.exportedAt);
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'HitWhat backup' });
        return 'shared';
      } catch (e) {
        if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
        // Share refused for another reason (no gesture, unsupported type): fall back to a download.
      }
    }
  } catch {
    // File constructor or canShare unavailable: download instead.
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}
