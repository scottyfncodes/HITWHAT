/**
 * Backup and restore. HitWhat has no account and no server copy of your data,
 * so a file you keep is the way to move to a new phone or survive a cleared browser.
 * Videos are not included (they stay in this browser); swing analyses are.
 */
import type { SavedSwing } from './swings';
import { sanitizeGolf, type GolfData } from './golf';
import { sanitizeProfile, type Profile } from './profile';

export const BACKUP_FORMAT = 'hitwhat-backup';
/** Backups saved before the app was called HitWhat. Still restorable. */
const LEGACY_FORMATS: readonly string[] = ['caddaie-backup'];

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: number;
  profile: Profile;
  golf: GolfData;
  swings: Omit<SavedSwing, 'videoBytes'>[];
}

export function buildBackup(profile: Profile, golf: GolfData, swings: SavedSwing[], now = Date.now()): Backup {
  return { format: BACKUP_FORMAT, version: 1, exportedAt: now, profile, golf, swings: swings.map(({ videoBytes: _v, ...s }) => s) };
}

export type RestoreResult =
  | { ok: true; profile: Profile; golf: GolfData; swings: SavedSwing[]; exportedAt: number | null }
  | { ok: false; reason: string };

export function parseBackup(text: string): RestoreResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file isn’t a HitWhat backup.' };
  }
  const b = raw as Partial<Backup>;
  if (!b || (b.format !== BACKUP_FORMAT && !LEGACY_FORMATS.includes(String(b.format)))) return { ok: false, reason: 'That file isn’t a HitWhat backup.' };
  const golf = sanitizeGolf((b.golf ?? {}) as Record<string, unknown>);
  const swings = (Array.isArray(b.swings) ? b.swings : [])
    .filter((s) => s && typeof s.id === 'string' && s.analysis?.ok === true && Array.isArray(s.analysis.metrics))
    .map((s) => ({ ...s, videoBytes: 0 }) as SavedSwing);
  const exportedAt = typeof b.exportedAt === 'number' && Number.isFinite(b.exportedAt) && b.exportedAt > 0 ? b.exportedAt : null;
  return { ok: true, profile: sanitizeProfile(b.profile), golf, swings, exportedAt };
}

const DAY = 86_400_000;
/** A backup older than this is worth refreshing once there's a new round in it. */
export const BACKUP_STALE_DAYS = 14;
/** This many rounds not in any backup is worth a reminder however recent the last one was. */
export const BACKUP_ROUNDS_AT_RISK = 3;
/** "Later" hides the reminder for this long. */
export const BACKUP_SNOOZE_DAYS = 7;

export interface BackupStatus {
  /** Finished rounds played since the last backup (all of them if there's never been one). */
  unsaved: number;
  /** Whole days since the last backup, or null if there's never been one. */
  daysSince: number | null;
  /** Show the reminder now. */
  due: boolean;
}

/**
 * Whether to remind the golfer to save a backup. Only when there is a finished
 * round that no backup holds, and then only if there has never been a backup,
 * the last one is {@link BACKUP_STALE_DAYS}+ days old, or {@link BACKUP_ROUNDS_AT_RISK}+
 * rounds are at risk. "Later" snoozes it.
 */
export function backupStatus(
  golf: Pick<GolfData, 'rounds'>,
  lastBackupAt: number | null,
  snoozeUntil: number | null,
  now = Date.now(),
): BackupStatus {
  const since = lastBackupAt ?? -Infinity;
  const unsaved = golf.rounds.filter((r) => r.status === 'complete' && r.date > since).length;
  const daysSince = lastBackupAt === null ? null : Math.max(0, Math.floor((now - lastBackupAt) / DAY));
  const snoozed = snoozeUntil !== null && snoozeUntil > now;
  const due =
    unsaved > 0 && !snoozed && (daysSince === null || daysSince >= BACKUP_STALE_DAYS || unsaved >= BACKUP_ROUNDS_AT_RISK);
  return { unsaved, daysSince, due };
}

export const snoozeUntil = (now = Date.now()) => now + BACKUP_SNOOZE_DAYS * DAY;

export const backupFileName = (now = Date.now()) => `hitwhat-backup-${new Date(now).toISOString().slice(0, 10)}.json`;
