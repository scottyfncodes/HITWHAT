/** Shared UI pieces: icons, sheets, badges, stat tiles and a small trend line. */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

type IconName =
  | 'round'
  | 'caddie'
  | 'stats'
  | 'swing'
  | 'handicap'
  | 'settings'
  | 'close'
  | 'camera'
  | 'gps'
  | 'flag'
  | 'chevron'
  | 'back'
  | 'star'
  | 'plus'
  | 'check'
  | 'info'
  | 'video'
  | 'trash'
  | 'compass';

const PATHS: Record<IconName, JSX.Element> = {
  round: (
    <>
      <path d="M7 21V4" />
      <path d="M7 4.5c3-1.6 5.4 1.6 9 0v7c-3.6 1.6-6-1.6-9 0" />
      <path d="M4 21h9" />
    </>
  ),
  caddie: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  stats: (
    <>
      <path d="M5 20V12M10 20V6M15 20v-9M20 20V9" />
    </>
  ),
  swing: (
    <>
      <circle cx="13" cy="4.5" r="2" />
      <path d="M13 7.5 11 13l3 3 1 5M11 13l-3 7M12 9l5-3M17 6l3-3" />
    </>
  ),
  handicap: (
    <>
      <path d="M3 18 9 12l4 3 8-9" />
      <path d="M16 6h5v5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  gps: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  flag: (
    <>
      <path d="M8 21V3l9 4-9 4" />
      <ellipse cx="9" cy="21" rx="5" ry="1" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  back: <path d="m15 6-6 6 6 6" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </>
  ),
  trash: <path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
};

export function Icon({ name, size = 24, filled }: { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Bottom sheet built on <dialog>, so focus and Escape work natively. */
export function Sheet({
  title,
  onClose,
  children,
  testid,
  action,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  testid?: string;
  action?: ComponentChildren;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    return () => d?.close?.();
  }, []);
  return (
    <dialog ref={ref} class="sheet" aria-label={title} data-testid={testid} onCancel={(e) => (e.preventDefault(), onClose())}>
      <header class="sheet-head">
        <h2>{title}</h2>
        {action ?? (
          <button type="button" class="btn small" onClick={onClose} data-testid="sheet-done">
            Done
          </button>
        )}
      </header>
      <div class="sheet-body">{children}</div>
    </dialog>
  );
}

export type Tone = 'good' | 'ok' | 'watch' | 'bad' | 'muted';

export function Badge({ tone, children }: { tone: Tone; children: ComponentChildren }) {
  return <span class={`badge badge-${tone}`}>{children}</span>;
}

export function Stat({ label, value, sub, testid }: { label: string; value: ComponentChildren; sub?: ComponentChildren; testid?: string }) {
  return (
    <div class="stat" data-testid={testid}>
      <span class="stat-label">{label}</span>
      <span class="stat-value">{value}</span>
      {sub && <span class="stat-sub">{sub}</span>}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ComponentChildren; aside?: ComponentChildren }) {
  return (
    <div class="section-title">
      <h2>{children}</h2>
      {aside}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <span class="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/**
 * A single-series trend line. One hue, 2px line, the latest point labelled.
 * Tap a point to read it; the list beside every trend is the table view.
 */
export function Trend({
  points,
  label,
  format = (n) => String(n),
  testid,
}: {
  points: { x: number; y: number; title: string }[];
  label: string;
  format?: (n: number) => string;
  testid?: string;
}) {
  const [sel, setSel] = useState<number | null>(null);
  if (points.length < 2) return null;
  const W = 320;
  const H = 96;
  const pad = { l: 8, r: 44, t: 14, b: 14 };
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < 2) {
    lo -= 1;
    hi += 1;
  }
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  const shown = sel ?? last;
  return (
    <figure class="trend" data-testid={testid}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${points.map((p) => `${p.title} ${format(p.y)}`).join(', ')}`} preserveAspectRatio="none">
        <line x1={pad.l} x2={W - pad.r} y1={y(hi)} y2={y(hi)} class="trend-grid" />
        <line x1={pad.l} x2={W - pad.r} y1={y(lo)} y2={y(lo)} class="trend-grid" />
        <text x={pad.l} y={y(hi) - 4} class="trend-axis">
          {format(Math.max(...ys))}
        </text>
        <text x={pad.l} y={y(lo) + 12} class="trend-axis">
          {format(Math.min(...ys))}
        </text>
        <path d={d} class="trend-line" vector-effect="non-scaling-stroke" />
        {points.map((p, i) => (
          <g key={i} onClick={() => setSel(i === sel ? null : i)} class="trend-hit">
            <rect x={x(i) - 12} y={0} width={24} height={H} fill="transparent" />
            {(i === shown || i === last) && <circle cx={x(i)} cy={y(p.y)} r={i === shown ? 5 : 4} class="trend-dot" />}
          </g>
        ))}
        <text x={W - pad.r + 6} y={y(points[shown].y) + 4} class="trend-label">
          {format(points[shown].y)}
        </text>
      </svg>
      <figcaption>
        {sel === null ? label : points[sel].title}
      </figcaption>
    </figure>
  );
}

/** Format an epoch-ms date compactly, e.g. "Oct 4". */
export const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const longDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
