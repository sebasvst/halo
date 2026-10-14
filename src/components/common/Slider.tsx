interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}

export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  label,
  disabled,
  formatValue,
}: SliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className={`slider ${disabled ? "slider--disabled" : ""}`.trim()}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={formatValue ? formatValue(value) : undefined}
        style={{ "--fill": `${Math.round(pct)}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {formatValue ? (
        <span className="slider__value" aria-hidden="true">
          {formatValue(value)}
        </span>
      ) : null}
    </div>
  );
}
