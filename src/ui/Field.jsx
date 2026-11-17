import React from "react";

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function NumberField({ label, value, onChange, min = 0, max = 1000, hint }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(
            v === "" ? 0 : Math.min(max, Math.max(min, Math.trunc(Number(v)))),
          );
        }}
      />
    </Field>
  );
}
