export type CurrencyCode = "IDR" | "USD" | "EUR" | "SGD" | "THB" | "MYR";

export interface ProofFile {
  name: string;
  type: string;
  size: number;
  dataUrl: string; // base64 data URL for preview/upload in this scaffold
}
