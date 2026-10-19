import { useState } from "react";
import { trpc } from "../trpc.js";
import type { CurrencyCode } from "../types.js";

const SECTIONS = ["General", "Currency & rates", "Team & roles", "Sources", "Billing & plan"] as const;
type Section = (typeof SECTIONS)[number];
const CURRENCIES: CurrencyCode[] = ["IDR", "USD", "EUR", "SGD", "THB", "MYR"];

export function Settings() {
  const [section, setSection] = useState<Section>("General");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="flex flex-wrap gap-1 border-b border-border text-sm">
        {SECTIONS.map((s) => (
          <button
            key={s}
            className={`px-3 py-2 ${section === s ? "border-b-2 border-brand font-medium" : "text-text-muted"}`}
            onClick={() => setSection(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {section === "General" && <GeneralSection />}
      {section === "Currency & rates" && <CurrencySection />}
      {section === "Team & roles" && <TeamSection />}
      {section === "Sources" && <SourcesSection />}
      {section === "Billing & plan" && <BillingSection />}
    </div>
  );
}

function GeneralSection() {
  const get = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();
  const update = trpc.settings.updateGeneral.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });
  const [name, setName] = useState("");
  const [source, setSource] = useState("");

  if (!get.data) return <p className="text-text-muted">Loading…</p>;
  return (
    <div className="max-w-md space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block text-text-muted">Workspace name</span>
        <input
          className="w-full rounded border border-border bg-bg px-3 py-2"
          defaultValue={get.data.name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-text-muted">Reference rate source</span>
        <input
          className="w-full rounded border border-border bg-bg px-3 py-2"
          defaultValue={get.data.referenceRateSource}
          onChange={(e) => setSource(e.target.value)}
        />
      </label>
      <button
        className="rounded bg-brand px-3 py-1.5 text-brand-contrast"
        onClick={() =>
          update.mutate({
            name: name || get.data!.name,
            referenceRateSource: source || get.data!.referenceRateSource,
          })
        }
      >
        Save
      </button>
    </div>
  );
}

function CurrencySection() {
  const get = trpc.settings.get.useQuery();
  const rates = trpc.settings.listRates.useQuery();
  const utils = trpc.useUtils();
  const updateCurrency = trpc.settings.updateCurrency.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });

  return (
    <div className="space-y-4 text-sm">
      <div className="max-w-md">
        <label className="block">
          <span className="mb-1 block text-text-muted">Functional currency</span>
          <select
            className="w-full rounded border border-border bg-surface px-3 py-2"
            value={get.data?.functionalCurrency ?? "IDR"}
            onChange={(e) =>
              updateCurrency.mutate({ functionalCurrency: e.target.value as CurrencyCode })
            }
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {updateCurrency.data?.warning && (
          <p role="alert" className="mt-1 text-provisional">
            {updateCurrency.data.warning}
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-1 font-semibold">Reference rates</h3>
        <p className="mb-2 text-xs text-text-muted">
          Payouts are booked at the rate stored here (rate-as-booked). Changing a rate does not
          retroactively re-value past payouts.
        </p>
        <table className="w-full max-w-md text-sm">
          <thead className="text-left text-text-muted">
            <tr>
              <th className="py-1">Base</th>
              <th className="py-1">Quote</th>
              <th className="py-1 text-right">Rate</th>
              <th className="py-1">As of</th>
            </tr>
          </thead>
          <tbody>
            {rates.data?.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-1">{r.base}</td>
                <td className="py-1">{r.quote}</td>
                <td className="py-1 text-right tabular">{r.rate}</td>
                <td className="py-1">{new Date(r.asOf).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamSection() {
  const team = trpc.settings.listTeam.useQuery();
  return (
    <div className="space-y-3 text-sm">
      <p className="text-text-muted">
        Inviting new team members is coming soon. Roles are enforced server-side.
      </p>
      <table className="w-full max-w-lg">
        <thead className="text-left text-text-muted">
          <tr>
            <th className="py-1">Email</th>
            <th className="py-1">Role</th>
            <th className="py-1">Claimed</th>
          </tr>
        </thead>
        <tbody>
          {team.data?.map((u) => (
            <tr key={u.id} className="border-t border-border">
              <td className="py-1">{u.email}</td>
              <td className="py-1">{u.role}</td>
              <td className="py-1">{u.claimedAt ? "Yes" : "Invited"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourcesSection() {
  const seen = trpc.settings.listSources.useQuery();
  const available = trpc.ingestion.listDistributors.useQuery();
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="mb-1 font-semibold">Sources seen in your data</h3>
        {seen.data?.length ? (
          <ul className="list-inside list-disc text-text-muted">
            {seen.data.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="text-text-subtle">No imports yet.</p>
        )}
      </div>
      <div>
        <h3 className="mb-1 font-semibold">Available importers</h3>
        <ul className="list-inside list-disc text-text-muted">
          {available.data?.sources.flatMap((s) => s.importers).map((imp) => (
            <li key={imp.id}>{imp.label}</li>
          ))}
        </ul>
        <p className="mt-2 text-text-muted">
          Missing one?{" "}
          <a
            className="text-brand underline"
            href={`mailto:${available.data?.requestImporter.contactUs}`}
          >
            Request an importer
          </a>
        </p>
      </div>
    </div>
  );
}

function BillingSection() {
  const get = trpc.settings.get.useQuery();
  return (
    <div className="max-w-md space-y-2 text-sm">
      <p>
        Current plan: <strong className="capitalize">{get.data?.plan}</strong>
      </p>
      <p className="text-text-muted">
        Transparent per-period pricing. Your plan renews each billing cycle; you can see exactly
        what you're billed for before renewal.
      </p>
      <button className="rounded border border-border px-3 py-1.5 text-text-muted" disabled>
        Manage plan (coming soon)
      </button>
    </div>
  );
}
