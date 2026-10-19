import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { trpc } from "./trpc.js";
import { LoginPage } from "./auth/LoginPage.js";
import { ClaimInvite } from "./auth/ClaimInvite.js";
import { AdminShell } from "./shells/AdminShell.js";
import { PortalShell } from "./shells/PortalShell.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Statements } from "./pages/Statements.js";
import { Cleanup } from "./pages/Cleanup.js";
import { Catalog } from "./pages/Catalog.js";
import { TrackDetail } from "./pages/TrackDetail.js";
import { Contracts } from "./pages/Contracts.js";
import { Payouts } from "./pages/Payouts.js";
import { Payees } from "./pages/Payees.js";
import { Transactions } from "./pages/Transactions.js";
import { Settings } from "./pages/Settings.js";
import { MyEarnings } from "./portal/MyEarnings.js";
import { MyStatements } from "./portal/MyStatements.js";
import { MyPayouts } from "./portal/MyPayouts.js";
import { MyDocuments } from "./portal/MyDocuments.js";

function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem("rekon-theme") === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("rekon-theme", dark ? "dark" : "light");
    } catch {
      /* storage may be unavailable; theme still applies for this session */
    }
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

export function App() {
  const [dark, toggleDark] = useDarkMode();
  const me = trpc.auth.me.useQuery();

  if (me.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        Loading…
      </div>
    );
  }

  const user = me.data;
  if (!user) {
    // Not signed in: login + claim-invite, no router shell needed.
    return (
      <HashRouter>
        <Routes>
          <Route path="/claim" element={<ClaimInvite />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </HashRouter>
    );
  }

  if (user.role === "admin") {
    return (
      <HashRouter>
        <Routes>
          <Route
            element={<AdminShell email={user.email} dark={dark} onToggleDark={toggleDark} />}
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/statements" element={<Statements />} />
            <Route path="/cleanup" element={<Cleanup />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/catalog/track/:trackId" element={<TrackDetail />} />
            <Route path="/contracts" element={<Contracts />} />
            <Route path="/payouts" element={<Payouts />} />
            <Route path="/payees" element={<Payees />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    );
  }

  // Payee portal: NO admin routes are mounted. The server also rejects admin calls.
  return (
    <HashRouter>
      <Routes>
        <Route
          element={<PortalShell email={user.email} dark={dark} onToggleDark={toggleDark} />}
        >
          <Route path="/me/earnings" element={<MyEarnings />} />
          <Route path="/me/statements" element={<MyStatements />} />
          <Route path="/me/payouts" element={<MyPayouts />} />
          <Route path="/me/documents" element={<MyDocuments />} />
          <Route path="*" element={<Navigate to="/me/earnings" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
