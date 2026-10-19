export interface NavItem {
  path: string;
  label: string;
}

export const ADMIN_NAV: NavItem[] = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/statements", label: "Statements" },
  { path: "/cleanup", label: "Cleanup" },
  { path: "/catalog", label: "Catalog" },
  { path: "/contracts", label: "Contracts" },
  { path: "/payouts", label: "Payouts" },
  { path: "/payees", label: "Payees" },
  { path: "/transactions", label: "Transactions" },
  { path: "/settings", label: "Settings" },
];

export const PORTAL_NAV: NavItem[] = [
  { path: "/me/earnings", label: "Earnings" },
  { path: "/me/statements", label: "Statements" },
  { path: "/me/payouts", label: "Payouts" },
  { path: "/me/documents", label: "Documents" },
];
