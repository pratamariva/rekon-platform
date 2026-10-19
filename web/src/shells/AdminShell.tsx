import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { trpc } from "../trpc.js";
import { ADMIN_NAV } from "../routes.js";

interface Props {
  email: string;
  dark: boolean;
  onToggleDark: () => void;
}

export function AdminShell({ email, dark, onToggleDark }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => window.location.reload(),
  });
  const unassigned = trpc.items.unassigned.useQuery();
  const unassignedCount = unassigned.data?.length ?? 0;

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-surface px-4 py-3">
        <button
          className="rounded border border-border px-2 py-1 text-sm md:hidden"
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          ☰
        </button>
        <span className="text-lg font-semibold tracking-tight text-brand">Rekon</span>
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

      <div className="flex">
        <nav
          aria-label="Primary"
          className={`${menuOpen ? "block" : "hidden"} w-full border-b border-border bg-surface p-2 md:block md:w-56 md:border-b-0 md:border-r`}
        >
          <ul className="space-y-1">
            {ADMIN_NAV.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded px-3 py-2 text-sm ${
                      isActive
                        ? "bg-surface-2 font-medium text-text"
                        : "text-text-muted hover:bg-surface-2"
                    }`
                  }
                >
                  <span>{item.label}</span>
                  {item.label === "Cleanup" && unassignedCount > 0 && (
                    <span
                      className="rounded-full bg-disputed-bg px-2 text-xs text-disputed"
                      aria-label={`${unassignedCount} unassigned items`}
                    >
                      {unassignedCount}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
