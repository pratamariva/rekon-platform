import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../trpc.js";

// Live mirror of the backend password policy (≥12 + upper/lower/digit).
function policyChecks(pw: string) {
  return [
    { label: "At least 12 characters", ok: pw.length >= 12 },
    { label: "A lowercase letter", ok: /[a-z]/.test(pw) },
    { label: "An uppercase letter", ok: /[A-Z]/.test(pw) },
    { label: "A digit", ok: /[0-9]/.test(pw) },
  ];
}

export function ClaimInvite() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const claim = trpc.auth.claimInvite.useMutation({
    onSuccess: () => window.location.reload(),
  });

  const checks = policyChecks(password);
  const canSubmit = token && consent && checks.every((c) => c.ok);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!consent) return;
    claim.mutate({ token, password, consent: true });
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6"
      >
        <h1 className="mb-1 text-xl font-semibold text-brand">Claim your account</h1>
        <p className="mb-4 text-sm text-text-muted">
          Paste the invite token from your email to set a password.
        </p>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-text-muted">Invite token</span>
          <input
            className="w-full rounded border border-border bg-bg px-3 py-2"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
        </label>
        <label className="mb-2 block text-sm">
          <span className="mb-1 block text-text-muted">New password</span>
          <input
            type="password"
            className="w-full rounded border border-border bg-bg px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <ul className="mb-4 space-y-1 text-xs">
          {checks.map((c) => (
            <li key={c.label} className={c.ok ? "text-confirmed" : "text-text-subtle"}>
              <span aria-hidden="true">{c.ok ? "✓" : "○"}</span> {c.label}
            </li>
          ))}
        </ul>

        <label className="mb-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          <span className="text-text-muted">
            I agree to the Privacy Policy and consent to the processing of my personal data as
            described there.
          </span>
        </label>

        {claim.error && (
          <p role="alert" className="mb-3 text-sm text-disputed">
            {claim.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit || claim.isPending}
          className="w-full rounded bg-brand py-2 text-brand-contrast disabled:opacity-50"
        >
          {claim.isPending ? "Setting up…" : "Set password & sign in"}
        </button>

        <p className="mt-4 text-center text-sm text-text-muted">
          <Link to="/" className="text-brand underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
