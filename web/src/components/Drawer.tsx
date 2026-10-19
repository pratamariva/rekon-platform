import type { ReactNode } from "react";
import { useFocusTrap } from "../lib/useFocusTrap.js";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Right-side drawer: role=dialog, aria-modal, focus-trapped, closes on Esc or backdrop.
export function Drawer({ title, onClose, children }: Props) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-border bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            className="rounded border border-border px-2 py-1 text-sm"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
