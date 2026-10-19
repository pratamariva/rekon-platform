/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Semantic colors only — every value is a design token defined in index.css,
      // so light/dark theming lives in ONE place (no scattered hex).
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        text: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
          subtle: "var(--text-subtle)",
        },
        brand: {
          DEFAULT: "var(--brand)",
          contrast: "var(--brand-contrast)",
        },
        confirmed: { DEFAULT: "var(--confirmed)", bg: "var(--confirmed-bg)" },
        provisional: { DEFAULT: "var(--provisional)", bg: "var(--provisional-bg)" },
        disputed: { DEFAULT: "var(--disputed)", bg: "var(--disputed-bg)" },
        realized: "var(--realized)",
        accrued: "var(--accrued)",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
