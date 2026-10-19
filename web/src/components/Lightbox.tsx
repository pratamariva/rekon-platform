import { useState } from "react";
import { useFocusTrap } from "../lib/useFocusTrap.js";

interface Props {
  url: string;
  name: string;
  kind: "image" | "pdf";
  onClose: () => void;
}

// Modal viewer with focus trap. Images can be zoomed; PDFs render in a sandboxed
// iframe. Always offers a download.
export function Lightbox({ url, name, kind, onClose }: Props) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const [zoomed, setZoomed] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview: ${name}`}
        className="relative z-10 flex max-h-full w-full max-w-3xl flex-col rounded-lg border border-border bg-surface"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="truncate text-sm font-medium">{name}</span>
          <div className="flex gap-2">
            <a
              href={url}
              download={name}
              className="rounded border border-border px-2 py-1 text-sm"
            >
              Download
            </a>
            <button
              className="rounded border border-border px-2 py-1 text-sm"
              onClick={onClose}
              aria-label="Close preview"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {kind === "image" ? (
            <img
              src={url}
              alt={name}
              onClick={() => setZoomed((z) => !z)}
              className={`mx-auto cursor-zoom-in ${zoomed ? "max-w-none" : "max-w-full"}`}
              style={zoomed ? { width: "150%" } : undefined}
            />
          ) : (
            <iframe
              title={name}
              src={url}
              sandbox=""
              className="h-[70vh] w-full rounded border border-border bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
