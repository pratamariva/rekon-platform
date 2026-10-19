import { useState } from "react";
import { trpc } from "../trpc.js";
import { Money } from "../components/Money.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { Drawer } from "../components/Drawer.js";

export function Statements() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "draft" | "issued" | "disputed">("");
  const [importing, setImporting] = useState(false);
  const utils = trpc.useUtils();
  const list = trpc.statements.list.useQuery({
    q: q || undefined,
    status: status || undefined,
  });
  const issue = trpc.statements.issue.useMutation({
    onSuccess: () => utils.statements.list.invalidate(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Statements</h1>
        <button
          className="ml-auto rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast"
          onClick={() => setImporting(true)}
        >
          Import statement
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          placeholder="Search title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded border border-border bg-surface px-3 py-1.5 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded border border-border bg-surface px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="disputed">Disputed</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-text-muted">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Net (by currency)</th>
              <th className="px-3 py-2 text-right">Realized</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2">{s.title}</td>
                <td className="px-3 py-2">{s.period}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={s.status === "disputed" ? "disputed" : s.status === "issued" ? "confirmed" : "unpaid"} />
                </td>
                <td className="px-3 py-2 text-right">
                  {s.netByCurrency.map((n) => (
                    <div key={n.currency}>
                      <Money minor={n.totalMinor} currency={n.currency} />
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2 text-right">
                  <Money minor={s.realizedFunctionalMinor} currency="IDR" />
                </td>
                <td className="px-3 py-2 text-right">
                  {s.status !== "issued" && (
                    <button
                      className="rounded border border-border px-2 py-1 text-xs"
                      onClick={() => issue.mutate({ id: s.id })}
                    >
                      Issue
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-subtle">
                  No statements yet. Import one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {importing && <ImportFlow onClose={() => setImporting(false)} />}
    </div>
  );
}

function ImportFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [importerId, setImporterId] = useState("");
  const [csv, setCsv] = useState("");
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("");

  const distributors = trpc.ingestion.listDistributors.useQuery();
  const utils = trpc.useUtils();
  const preview = trpc.ingestion.preview.useQuery(
    { importerId, csv, period: period || undefined },
    { enabled: step === 3 && !!csv && !!importerId },
  );
  const commit = trpc.ingestion.commit.useMutation({
    onSuccess: () => {
      void utils.statements.list.invalidate();
      void utils.items.unassigned.invalidate();
    },
  });

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result));
    reader.readAsText(file);
  };

  return (
    <Drawer title="Import statement" onClose={onClose}>
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">1. Pick a distributor source</h3>
          {distributors.data?.sources.map((src) => (
            <fieldset key={src.sourceId} className="rounded border border-border p-3">
              <legend className="px-1 text-sm font-medium capitalize">{src.sourceId}</legend>
              <div className="space-y-1">
                {src.importers.map((imp) => (
                  <label key={imp.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="importer"
                      checked={importerId === imp.id}
                      onChange={() => setImporterId(imp.id)}
                    />
                    {imp.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="text-sm text-text-muted">
            {distributors.data?.requestImporter.message}{" "}
            <a className="text-brand underline" href={`mailto:${distributors.data?.requestImporter.contactUs}`}>
              Request an importer
            </a>
          </p>
          <button
            disabled={!importerId}
            className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast disabled:opacity-50"
            onClick={() => setStep(2)}
          >
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">2. Upload the raw file</h3>
          <p className="rounded bg-provisional-bg p-2 text-sm text-provisional">
            {distributors.data?.rawFileNotice}
          </p>
          <input
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
            }}
          />
          {csv && <p className="text-sm text-confirmed">File loaded ({csv.length} chars).</p>}
          <div className="flex gap-2">
            <button className="rounded border border-border px-3 py-1.5 text-sm" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              disabled={!csv}
              className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast disabled:opacity-50"
              onClick={() => setStep(3)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">3. Confirm &amp; commit</h3>
          {preview.isLoading && <p className="text-text-muted">Parsing…</p>}
          {preview.error && <p role="alert" className="text-disputed">{preview.error.message}</p>}
          {preview.data && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="block">
                  <span className="mb-1 block text-text-muted">Title</span>
                  <input
                    className="w-full rounded border border-border bg-bg px-2 py-1"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-text-muted">Period</span>
                  <input
                    className="w-full rounded border border-border bg-bg px-2 py-1"
                    value={period || preview.data.period}
                    onChange={(e) => setPeriod(e.target.value)}
                  />
                </label>
              </div>

              <div className="rounded border border-border p-3 text-sm">
                <p className="mb-1 font-medium">Totals by currency (tie-out)</p>
                {preview.data.totalsByCurrency.map((t) => (
                  <div key={t.currency} className="flex justify-between">
                    <span>{t.currency}</span>
                    <Money minor={t.totalMinor} currency={t.currency} />
                  </div>
                ))}
              </div>

              <p className="text-sm text-text-muted">
                {preview.data.lines.length} lines · {preview.data.rejected.length} rejected
              </p>
              {preview.data.rejected.length > 0 && (
                <ul className="max-h-32 overflow-y-auto rounded border border-disputed-bg p-2 text-xs text-disputed">
                  {preview.data.rejected.map((r) => (
                    <li key={r.rowNumber}>Row {r.rowNumber}: {r.reason}</li>
                  ))}
                </ul>
              )}

              {commit.data ? (
                <div className="rounded bg-confirmed-bg p-3 text-sm text-confirmed">
                  Imported. {commit.data.autoMapped} auto-mapped, {commit.data.needsCleanup} need
                  cleanup, {commit.data.rejected} rejected.
                  <div className="mt-2">
                    <button className="rounded bg-brand px-3 py-1 text-brand-contrast" onClick={onClose}>
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button className="rounded border border-border px-3 py-1.5 text-sm" onClick={() => setStep(2)}>
                    Back
                  </button>
                  <button
                    disabled={!title || commit.isPending}
                    className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast disabled:opacity-50"
                    onClick={() =>
                      commit.mutate({
                        importerId,
                        csv,
                        title,
                        period: period || preview.data?.period,
                      })
                    }
                  >
                    {commit.isPending ? "Committing…" : "Commit (re-parses server-side)"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
