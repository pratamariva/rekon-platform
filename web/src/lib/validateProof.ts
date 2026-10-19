import type { ProofFile } from "../types.js";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];

export interface ProofValidation {
  ok: boolean;
  error?: string;
}

export function validateProofFile(file: File): ProofValidation {
  if (!ALLOWED.includes(file.type)) {
    return { ok: false, error: "File must be a JPG, PNG, or PDF." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File must be 10MB or smaller." };
  }
  return { ok: true };
}

export async function fileToProof(file: File): Promise<ProofFile> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  return { name: file.name, type: file.type, size: file.size, dataUrl };
}
