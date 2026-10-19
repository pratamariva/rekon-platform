type Status = "confirmed" | "provisional" | "disputed" | "unpaid";

// Status is conveyed by color + icon + text — never color alone (WCAG 1.4.1).
const MAP: Record<Status, { label: string; icon: string; cls: string }> = {
  confirmed: { label: "Confirmed", icon: "✓", cls: "bg-confirmed-bg text-confirmed" },
  provisional: { label: "Provisional", icon: "◷", cls: "bg-provisional-bg text-provisional" },
  disputed: { label: "Disputed", icon: "!", cls: "bg-disputed-bg text-disputed" },
  unpaid: { label: "Unpaid", icon: "○", cls: "bg-surface-2 text-text-muted" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      <span aria-hidden="true">{s.icon}</span>
      <span>{s.label}</span>
    </span>
  );
}
