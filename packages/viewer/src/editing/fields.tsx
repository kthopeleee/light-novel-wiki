import type { ReactNode } from "react";

type Common = { label: string; hint?: string };

export function TextInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
  autoFocus,
  inputMode,
}: Common & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputMode?: "text" | "decimal";
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  hint,
  value,
  onChange,
  rows = 4,
  autoFocus,
}: Common & { value: string; onChange: (value: string) => void; rows?: number; autoFocus?: boolean }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <textarea value={value} rows={rows} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function Select<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
}: Common & { value: T; onChange: (value: T) => void; options: { value: T; label: string }[] }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function FieldGroup({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="field-group">
      <legend className="field__label">{legend}</legend>
      {hint && <p className="field__hint">{hint}</p>}
      {children}
    </fieldset>
  );
}
