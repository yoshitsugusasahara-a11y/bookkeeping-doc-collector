"use client";

/**
 * 設定のON/OFFを表すトグル。
 * チェックボックスと違い、現在どちらの状態かがひと目で分かるようにする。
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <div className="toggle-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={checked ? "toggle-switch on" : "toggle-switch"}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" aria-hidden="true" />
      </button>
      <div className="toggle-copy">
        <strong>{label}</strong>
        {description && <small className="muted">{description}</small>}
      </div>
    </div>
  );
}
