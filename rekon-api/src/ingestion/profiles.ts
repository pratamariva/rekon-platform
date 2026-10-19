import type { DistributorProfile } from "./types.js";

// Per-distributor importers. Each id is "source:importer". There is deliberately NO
// generic fallback importer — an unknown id throws, prompting the user to request one.
// HARDEN: every column candidate below is a best guess. Verify against real sample
// files from each distributor before trusting these mappings in production.

const PROFILES: Record<string, DistributorProfile> = {
  "fuga:revenue": {
    sourceId: "fuga",
    importerLabel: "FUGA — Revenue report",
    delimiter: ",",
    decimal: ".",
    columns: {
      amount: ["Net Revenue", "Revenue", "Amount"],
      currency: ["Currency", "Reporting Currency"],
      isrc: ["ISRC"],
      upc: ["UPC", "Barcode"],
      title: ["Track Title", "Title"],
      artist: ["Artist", "Primary Artist"],
      releaseName: ["Release Title", "Album"],
      catalogNo: ["Catalog Number", "Catalog #"],
      period: ["Period", "Reporting Period"],
      revenueType: ["Revenue Type", "Store", "DSP"],
    },
  },
  "believe:royalty": {
    sourceId: "believe",
    importerLabel: "Believe — Royalty statement (EU format)",
    delimiter: ";",
    decimal: ",",
    columns: {
      amount: ["Net Amount", "Royalty", "Montant Net"],
      currency: ["Currency", "Devise"],
      isrc: ["ISRC"],
      upc: ["UPC", "EAN"],
      title: ["Title", "Titre", "Track"],
      artist: ["Artist", "Artiste"],
      releaseName: ["Release", "Album"],
      catalogNo: ["Catalog", "Reference"],
      period: ["Period", "Periode"],
      revenueType: ["Platform", "Plateforme", "Source"],
    },
  },
  "tunecore:earnings": {
    sourceId: "tunecore",
    importerLabel: "TuneCore — Earnings export",
    delimiter: ",",
    decimal: ".",
    columns: {
      amount: ["Earnings", "Total Earned", "Amount"],
      currency: ["Currency"],
      isrc: ["ISRC"],
      upc: ["UPC"],
      title: ["Song Title", "Track"],
      artist: ["Artist"],
      releaseName: ["Album", "Release"],
      catalogNo: ["Catalog"],
      period: ["Sales Period", "Period"],
      revenueType: ["Store", "Retailer"],
    },
  },
  "distrokid:bank": {
    sourceId: "distrokid",
    importerLabel: "DistroKid — Bank/earnings (TSV)",
    delimiter: "\t",
    decimal: ".",
    // HARDEN: DistroKid embeds currency in the earnings header (e.g. "Earnings (USD)").
    // We default to USD and look for an explicit column; parse the header currency
    // properly before prod.
    fixedCurrency: "USD",
    columns: {
      amount: ["Earnings (USD)", "Earnings", "Amount"],
      currency: ["Currency"],
      isrc: ["ISRC"],
      upc: ["UPC"],
      title: ["Song", "Title"],
      artist: ["Artist"],
      releaseName: ["Album"],
      catalogNo: ["Catalog"],
      period: ["Reporting Date", "Sale Month"],
      revenueType: ["Store"],
    },
  },
  "symphonic:revenue": {
    sourceId: "symphonic",
    importerLabel: "Symphonic — Revenue report",
    delimiter: ",",
    decimal: ".",
    columns: {
      amount: ["Net Earnings", "Revenue", "Amount"],
      currency: ["Currency"],
      isrc: ["ISRC"],
      upc: ["UPC"],
      title: ["Track Name", "Title"],
      artist: ["Artist Name", "Artist"],
      releaseName: ["Release Name", "Album"],
      catalogNo: ["Catalog Number"],
      period: ["Period"],
      revenueType: ["DSP", "Store"],
    },
  },
  "virgin:revenue": {
    sourceId: "virgin",
    importerLabel: "Virgin Music Group — Revenue report",
    delimiter: ",",
    decimal: ".",
    columns: {
      amount: ["Net Revenue", "Amount"],
      currency: ["Currency"],
      isrc: ["ISRC"],
      upc: ["UPC"],
      title: ["Track Title", "Title"],
      artist: ["Artist"],
      releaseName: ["Release Title"],
      catalogNo: ["Catalog No"],
      period: ["Accounting Period", "Period"],
      revenueType: ["Channel", "Store"],
    },
  },
  "orchard:revenue": {
    sourceId: "orchard",
    importerLabel: "The Orchard — Revenue report",
    delimiter: ",",
    decimal: ".",
    columns: {
      amount: ["Label Share Net Receipts", "Net Receipts", "Amount"],
      currency: ["Currency"],
      isrc: ["ISRC"],
      upc: ["UPC"],
      title: ["Track Title", "Title"],
      artist: ["Track Artist", "Artist"],
      releaseName: ["Release Title", "Album"],
      catalogNo: ["Catalog"],
      period: ["Sales Period", "Period"],
      revenueType: ["Partner", "Store"],
    },
  },
};

export function getProfile(id: string): DistributorProfile {
  const profile = PROFILES[id];
  if (!profile) {
    throw new Error(
      `No importer for "${id}". Request an importer and we'll add a mapping for this distributor.`,
    );
  }
  return profile;
}

export interface SourceGroup {
  sourceId: string;
  importers: { id: string; label: string }[];
}

// Group importers by distributor source for the UI's "pick a source" step.
export function distributorSources(): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const [id, profile] of Object.entries(PROFILES)) {
    let group = groups.get(profile.sourceId);
    if (!group) {
      group = { sourceId: profile.sourceId, importers: [] };
      groups.set(profile.sourceId, group);
    }
    group.importers.push({ id, label: profile.importerLabel });
  }
  return [...groups.values()];
}
