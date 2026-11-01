import { describe, expect, it } from 'vitest';
import {
  BACKUP_ROUNDS_AT_RISK,
  BACKUP_STALE_DAYS,
  backupFileName,
  backupStatus,
  buildBackup,
  parseBackup,
  snoozeUntil,
} from '../../src/state/backup';
import { defaultProfile, sanitizeProfile } from '../../src/state/profile';
import { played } from './rounds';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 1, 12);
const at = (daysAgo: number) => NOW - daysAgo * DAY;
const roundOn = (daysAgo: number, extra = {}) => played(0, { date: at(daysAgo), ...extra });

describe('backup reminder', () => {
  it('stays quiet with nothing to lose', () => {
    expect(backupStatus({ rounds: [] }, null, null, NOW)).toEqual({ unsaved: 0, daysSince: null, due: false });
    // A round still in progress isn't finished data yet.
    expect(backupStatus({ rounds: [roundOn(0, { status: 'active' })] }, null, null, NOW).due).toBe(false);
  });

  it('asks after the first finished round when there has never been a backup', () => {
    const s = backupStatus({ rounds: [roundOn(1)] }, null, null, NOW);
    expect(s).toEqual({ unsaved: 1, daysSince: null, due: true });
  });

  it('counts only rounds played after the last backup', () => {
    const rounds = [roundOn(30), roundOn(20), roundOn(2)];
    const s = backupStatus({ rounds }, at(10), null, NOW);
    expect(s.unsaved).toBe(1);
    expect(s.daysSince).toBe(10);
    expect(s.due).toBe(false); // recent backup, one round at risk
  });

  it('asks once the backup is stale and holds a new round', () => {
    expect(backupStatus({ rounds: [roundOn(1)] }, at(BACKUP_STALE_DAYS), null, NOW).due).toBe(true);
    expect(backupStatus({ rounds: [roundOn(1)] }, at(BACKUP_STALE_DAYS - 1), null, NOW).due).toBe(false);
    // Stale, but every round is already in it.
    expect(backupStatus({ rounds: [roundOn(40)] }, at(30), null, NOW).due).toBe(false);
  });

  it(`asks when ${BACKUP_ROUNDS_AT_RISK} rounds are at risk, however recent the backup`, () => {
    const rounds = Array.from({ length: BACKUP_ROUNDS_AT_RISK }, (_, i) => roundOn(i));
    expect(backupStatus({ rounds }, at(BACKUP_ROUNDS_AT_RISK + 0.5), null, NOW).due).toBe(true);
  });

  it('"Later" snoozes it for a week', () => {
    const rounds = [roundOn(1)];
    const until = snoozeUntil(NOW);
    expect(backupStatus({ rounds }, null, until, NOW).due).toBe(false);
    expect(backupStatus({ rounds }, null, until, until + 1).due).toBe(true);
  });

  it('names the file by the export date', () => {
    expect(backupFileName(NOW)).toBe('hitwhat-backup-2026-11-01.json');
  });

  it('restoring a backup reports when it was made, so its rounds count as backed up', () => {
    const rounds = [roundOn(5)];
    const r = parseBackup(JSON.stringify(buildBackup(defaultProfile(), { rounds, courses: [], shots: [], practice: [] }, [], at(1))));
    expect(r.ok && r.exportedAt).toBe(at(1));
    if (r.ok) expect(backupStatus(r.golf, r.exportedAt, null, NOW).unsaved).toBe(0);
    const legacy = parseBackup(JSON.stringify({ format: 'caddaie-backup', profile: {}, golf: {} }));
    expect(legacy.ok && legacy.exportedAt).toBe(null);
  });
});

describe('profile: backup and screen fields', () => {
  it('default to never backed up and screen kept on', () => {
    const p = defaultProfile();
    expect([p.lastBackupAt, p.backupSnoozeUntil, p.keepAwake]).toEqual([null, null, true]);
  });

  it('survive a round trip and reject junk', () => {
    expect(sanitizeProfile({ lastBackupAt: NOW, backupSnoozeUntil: NOW + DAY, keepAwake: false })).toMatchObject({
      lastBackupAt: NOW,
      backupSnoozeUntil: NOW + DAY,
      keepAwake: false,
    });
    expect(sanitizeProfile({ lastBackupAt: 'yesterday', backupSnoozeUntil: -5, keepAwake: 'no' })).toMatchObject({
      lastBackupAt: null,
      backupSnoozeUntil: null,
      keepAwake: true,
    });
  });
});
