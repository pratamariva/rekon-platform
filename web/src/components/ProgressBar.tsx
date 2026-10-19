interface Props {
  value: number; // 0..max
  max: number;
  label: string;
}

export function ProgressBar({ value, max, label }: Props) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
    </div>
  );
}
