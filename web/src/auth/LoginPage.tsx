import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../trpc.js";

export function LoginPage() {
  const [tenantId, setTenantId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.login.useMutation({
    onSuccess: () => window.location.reload(),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ tenantId, email, password });
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6"
      >
        <h1 className="mb-1 text-xl font-semibold text-brand">Rekon</h1>
        <p className="mb-4 text-sm text-text-muted">Sign in to your label workspace.</p>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-text-muted">Tenant ID</span>
          <input
            className="w-full rounded border border-border bg-bg px-3 py-2"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            required
          />
        </label>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-text-muted">Email</span>
          <input
            type="email"
            className="w-full rounded border border-border bg-bg px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-text-muted">Password</span>
          <input
            type="password"
            className="w-full rounded border border-border bg-bg px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {login.error && (
          <p role="alert" className="mb-3 text-sm text-disputed">
            {login.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded bg-brand py-2 text-brand-contrast disabled:opacity-50"
        >
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-center text-sm text-text-muted">
          Have an invite?{" "}
          <Link to="/claim" className="text-brand underline">
            Claim your account
          </Link>
        </p>
      </form>
    </div>
  );
}
