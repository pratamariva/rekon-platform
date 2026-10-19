import { NavLink, Outlet } from "react-router-dom";
import { trpc } from "../trpc.js";
import { PORTAL_NAV } from "../routes.js";

interface Props {
  email: string;
  dark: boolean;
  onToggleDark: () => void;
}

export function PortalShell({ email, dark, onToggleDark }: Props) {
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => window.location.reload(),
  });

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <span className="text-lg font-semibold tracking-tight text-brand">Rekon</span>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-xs text-text-muted">
          Signed in as a payee · read-only
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button
            className="rounded border border-border px-2 py-1 text-sm"
            onClick={onToggleDark}
            aria-pressed={dark}
          >
            {dark ? "☾ Dark" : "☀ Light"}
          </button>
          <span className="hidden text-sm text-text-muted sm:inline">{email}</span>
          <button
            className="rounded bg-brand px-3 py-1 text-sm text-brand-contrast"
            onClick={() => logout.mutate()}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav aria-label="Primary" className="border-b border-border bg-surface px-4">
        <ul className="flex gap-1 overflow-x-auto">
          {PORTAL_NAV.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `inline-block border-b-2 px-3 py-3 text-sm ${
                    isActive
                      ? "border-brand font-medium text-text"
                      : "border-transparent text-text-muted hover:text-text"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="mx-auto max-w-3xl p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
