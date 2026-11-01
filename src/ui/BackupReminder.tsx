/** A quiet card on the Round home when finished rounds aren't in any backup. */
import { useState } from 'preact/hooks';
import { longDate } from './kit';
import { useApp } from './context';
import { useBackup } from './useBackup';

export function BackupReminder() {
  const { profile } = useApp();
  const { status, save, snooze } = useBackup();
  const [busy, setBusy] = useState(false);
  if (!status.due) return null;
  const rounds = `${status.unsaved} round${status.unsaved === 1 ? '' : 's'}`;
  return (
    <section class="card backup-reminder" data-testid="backup-reminder" aria-labelledby="backup-reminder-title">
      <h2 class="card-title" id="backup-reminder-title">
        Back up your rounds
      </h2>
      <p class="muted">
        {profile.lastBackupAt === null
          ? `Your ${rounds} live only in this browser on this phone. Save a backup to Files or iCloud Drive so a cleared browser or a new phone can’t lose them.`
          : `${rounds} since your last backup on ${longDate(profile.lastBackupAt)}. Save a fresh one to keep them safe.`}
      </p>
      <div class="row">
        <button
          type="button"
          class="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await save().finally(() => setBusy(false));
          }}
          data-testid="backup-now"
        >
          Save backup
        </button>
        <button type="button" class="btn ghost" onClick={snooze} data-testid="backup-later">
          Later
        </button>
      </div>
    </section>
  );
}
