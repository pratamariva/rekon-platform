import { useRef, useState } from "react";
import { validateProofFile, fileToProof } from "../lib/validateProof.js";
import type { ProofFile } from "../types.js";
import { Lightbox } from "./Lightbox.js";

interface Props {
  onReady: (proof: ProofFile) => void;
}

// Drag-and-drop proof upload with an sr-only file input, role=alert validation, and
// a thumbnail that opens a lightbox. Produces a ProofFile (base64 data URL) for this
// scaffold. HARDEN: upload to object storage + signed URLs instead of base64.
export function ProofUpload({ onReady }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<ProofFile | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handle = async (file: File) => {
    const v = validateProofFile(file);
    if (!v.ok) {
      setError(v.error ?? "Invalid file");
      return;
    }
    setError(null);
    const p = await fileToProof(file);
    setProof(p);
    onReady(p);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void handle(file);
        }}
        className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center ${
          dragOver ? "border-brand bg-surface-2" : "border-border"
        }`}
      >
        <p className="text-sm text-text-muted">Drag a JPG, PNG or PDF here (max 10MB)</p>
        <button
          type="button"
          className="rounded bg-brand px-3 py-1 text-sm text-brand-contrast"
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="sr-only"
          aria-label="Upload payment proof"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handle(file);
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-disputed">
          {error}
        </p>
      )}

      {proof && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="rounded border border-border p-1"
            aria-label={`Preview ${proof.name}`}
          >
            {proof.type.startsWith("image/") ? (
              <img src={proof.dataUrl} alt="" className="h-12 w-12 object-cover" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center text-xs">PDF</span>
            )}
          </button>
          <span className="truncate text-sm">{proof.name}</span>
        </div>
      )}

      {lightbox && proof && (
        <Lightbox
          url={proof.dataUrl}
          name={proof.name}
          kind={proof.type === "application/pdf" ? "pdf" : "image"}
          onClose={() => setLightbox(false)}
        />
      )}
    </div>
  );
}
