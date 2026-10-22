/** Small, touch-first form controls shared across HitWhat. */
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  columns?: number;
}

/** Single-choice chip group with radio semantics. */
export function Segmented<T extends string>({ label, value, options, onChange, columns }: SegmentedProps<T>) {
  return (
    <div class="chips" role="radiogroup" aria-label={label} style={columns ? { '--cols': columns } : undefined}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          class={`chip${o.value === value ? ' on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface StepperProps {
  label: string;
  /** Value in display units, or null for "not set". */
  value: number | null;
  onChange: (v: number | null) => void;
  step: number;
  min: number;
  max: number;
  unit: string;
  /** Text shown for null / zero states. */
  describe?: (v: number | null) => string;
  nullable?: boolean;
  /** Value to start from when stepping a null value. */
  seed?: number;
}

export function Stepper({ label, value, onChange, step, min, max, unit, describe, nullable, seed = 0 }: StepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const bump = (dir: 1 | -1) => onChange(clamp(Math.round((value ?? seed) + dir * step)));
  const text = describe ? describe(value) : value === null ? '–' : `${value} ${unit}`;
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button type="button" class="step" aria-label={`Decrease ${label}`} onClick={() => bump(-1)} disabled={value !== null && value <= min}>
        −
      </button>
      <output class="step-value" aria-live="polite">
        {text}
      </output>
      <button type="button" class="step" aria-label={`Increase ${label}`} onClick={() => bump(1)} disabled={value !== null && value >= max}>
        +
      </button>
      {nullable && value !== null && (
        <button type="button" class="link" onClick={() => onChange(null)}>
          Reset
        </button>
      )}
    </div>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  class?: string;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  /** Called on Enter / the keypad's Done key instead of just dismissing the keyboard. */
  onEnter?: () => void;
}

/**
 * Numeric text input that brings up the iOS number pad, lets the golfer
 * clear it completely and never fights their typing.
 */
export function NumberField({ id, label, value, onChange, min, max, class: cls, placeholder, describedBy, invalid, onEnter }: NumberFieldProps) {
  const [text, setText] = useState(value === null ? '' : String(Math.round(value)));
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text);
    if (value === null ? parsed !== null : parsed === null || Math.round(value) !== parsed) {
      setText(value === null ? '' : String(Math.round(value)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      id={id}
      class={cls}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      enterKeyHint={onEnter ? 'send' : 'done'}
      aria-label={label}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      value={text}
      maxLength={4}
      onInput={(e) => {
        const raw = (e.currentTarget as HTMLInputElement).value.replace(/[^0-9]/g, '');
        setText(raw);
        if (raw === '') return onChange(null);
        const n = Number(raw);
        onChange(Number.isFinite(n) ? Math.min(Math.max(n, 0), max * 2) : null);
      }}
      onBlur={() => {
        if (value !== null && (value < min || value > max)) setText(String(Math.round(value)));
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (onEnter) onEnter();
        else (e.currentTarget as HTMLInputElement).blur();
      }}
    />
  );
}

export function Field({ label, hint, children, id }: { label: string; hint?: ComponentChildren; children: ComponentChildren; id?: string }) {
  return (
    <section class="field" aria-labelledby={id ? `${id}-label` : undefined}>
      <div class="field-head">
        <h3 class="field-label" id={id ? `${id}-label` : undefined}>
          {label}
        </h3>
        {hint && <span class="field-hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
