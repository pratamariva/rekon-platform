import { PrismaClient, type CurrencyCode } from "@prisma/client";
import { fromMajor } from "../src/lib/money.js";
import { applyContract, LABEL_PAYEE, type ContractDef } from "../src/lib/contracts.js";
import { generateInviteToken } from "../src/auth/invite.js";

const prisma = new PrismaClient();

// Rupiah major → integer minor (scale 2).
const idr = (major: number): bigint => BigInt(major) * 100n;
// Foreign major (2 dp) → integer minor.
const fx = (major: string, cur: CurrencyCode): bigint => fromMajor(major, cur).minor;

async function main() {
  // Fresh seed: clear in FK-safe order so `db:seed` can be re-run.
  await prisma.$transaction([
    prisma.auditEntry.deleteMany(),
    prisma.payoutPosting.deleteMany(),
    prisma.payout.deleteMany(),
    prisma.reconAllocation.deleteMany(),
    prisma.remittance.deleteMany(),
    prisma.statementParticipant.deleteMany(),
    prisma.statementLine.deleteMany(),
    prisma.statement.deleteMany(),
    prisma.txnPosting.deleteMany(),
    prisma.contractAssignment.deleteMany(),
    prisma.manualTransaction.deleteMany(),
    prisma.contractSplit.deleteMany(),
    prisma.contract.deleteMany(),
    prisma.payeeBalance.deleteMany(),
    prisma.item.deleteMany(),
    prisma.track.deleteMany(),
    prisma.release.deleteMany(),
    prisma.artist.deleteMany(),
    prisma.ledger.deleteMany(),
    prisma.referenceRate.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.splitShare.deleteMany(),
    prisma.split.deleteMany(),
    prisma.payee.deleteMany(),
    prisma.tenant.deleteMany(),
  ]);

  const tenant = await prisma.tenant.create({
    data: { name: "Nusantara Records", functionalCurrency: "IDR", plan: "label" },
  });

  const asOf = new Date("2026-06-30T00:00:00Z");
  await prisma.referenceRate.createMany({
    data: [
      { tenantId: tenant.id, base: "USD", quote: "IDR", rate: "16250", source: "manual", asOf },
      { tenantId: tenant.id, base: "EUR", quote: "IDR", rate: "17600", source: "manual", asOf },
      { tenantId: tenant.id, base: "SGD", quote: "IDR", rate: "12050", source: "manual", asOf },
    ],
  });

  const andi = await prisma.payee.create({
    data: { tenantId: tenant.id, name: "Andi Pratama", displayCurrency: "IDR", payoutRail: "bank_transfer", portalStatus: "active" },
  });
  const maya = await prisma.payee.create({
    data: { tenantId: tenant.id, name: "Maya Larasati", displayCurrency: "IDR", payoutRail: "bank_transfer", portalStatus: "active" },
  });
  const kraton = await prisma.payee.create({
    data: { tenantId: tenant.id, name: "The Kraton", displayCurrency: "EUR", payoutRail: "bank_transfer", portalStatus: "invited" },
  });
  const sunda = await prisma.payee.create({
    data: { tenantId: tenant.id, name: "Selat Sunda", displayCurrency: "SGD", payoutRail: "paynow", portalStatus: "invited" },
  });

  const advanceLedger = await prisma.ledger.create({
    data: { tenantId: tenant.id, name: "Advance" },
  });

  const artist = await prisma.artist.create({
    data: { tenantId: tenant.id, name: "Various — Nusantara" },
  });
  const release = await prisma.release.create({
    data: { tenantId: tenant.id, title: "Nusantara Singles 2026", artistId: artist.id, catalogNo: "NUS-2026" },
  });

  // 8 tracks, ISRC IDA012600001..8.
  const trackDefs = [
    { title: "Hujan", isrc: "IDA012600001" },
    { title: "Senja", isrc: "IDA012600002" },
    { title: "Pulang", isrc: "IDA012600003" },
    { title: "Lampu", isrc: "IDA012600004" },
    { title: "Ombak", isrc: "IDA012600005" },
    { title: "Neon", isrc: "IDA012600006" },
    { title: "Kabel", isrc: "IDA012600007" },
    { title: "Jakarta", isrc: "IDA012600008" },
  ];
  const tracks: Record<string, { id: string; releaseId: string }> = {};
  for (const t of trackDefs) {
    const created = await prisma.track.create({
      data: { releaseId: release.id, title: t.title, isrc: t.isrc },
    });
    tracks[t.title] = { id: created.id, releaseId: release.id };
  }

  // Contracts.
  const mkContract = async (
    name: string,
    splits: { payeeId: string; role: "artist" | "producer" | "writer" | "featured" | "mixer" | "label"; shareBp: number }[],
  ) => {
    return prisma.contract.create({
      data: {
        tenantId: tenant.id,
        name,
        splits: { create: splits.map((s) => ({ payeeId: s.payeeId, role: s.role, shareBp: s.shareBp })) },
      },
      include: { splits: true },
    });
  };

  const cAndi = await mkContract("Andi — release default 100%", [
    { payeeId: andi.id, role: "artist", shareBp: 10000 },
  ]);
  const cLampu = await mkContract("Lampu — Andi 80 / Maya 20", [
    { payeeId: andi.id, role: "artist", shareBp: 8000 },
    { payeeId: maya.id, role: "producer", shareBp: 2000 },
  ]);
  const cKraton = await mkContract("Kraton 100%", [
    { payeeId: kraton.id, role: "artist", shareBp: 10000 },
  ]);
  const cMaya = await mkContract("Maya 100%", [
    { payeeId: maya.id, role: "artist", shareBp: 10000 },
  ]);
  const cSunda = await mkContract("Selat Sunda 100%", [
    { payeeId: sunda.id, role: "artist", shareBp: 10000 },
  ]);

  // Assignments: release default + per-track overrides.
  await prisma.contractAssignment.create({
    data: { tenantId: tenant.id, level: "release", contractId: cAndi.id, releaseId: release.id },
  });
  const assignTrack = (title: string, contractId: string) =>
    prisma.contractAssignment.create({
      data: { tenantId: tenant.id, level: "track", contractId, trackId: tracks[title]!.id },
    });
  await assignTrack("Lampu", cLampu.id);
  await assignTrack("Pulang", cKraton.id);
  await assignTrack("Kabel", cMaya.id);
  await assignTrack("Ombak", cSunda.id);
  await assignTrack("Jakarta", cSunda.id);

  // Items auto-mapped by ISRC to their tracks.
  for (const t of trackDefs) {
    await prisma.item.create({
      data: {
        tenantId: tenant.id,
        source: "fuga",
        metaKey: `isrc:${t.isrc}`,
        isrc: t.isrc,
        trackName: t.title,
        releaseName: release.title,
        trackId: tracks[t.title]!.id,
        releaseId: release.id,
      },
    });
  }

  // Statement.
  const statement = await prisma.statement.create({
    data: {
      id: "ST-2026-Q2-014",
      tenantId: tenant.id,
      title: "Q2 2026 — distributor royalties",
      period: "2026-Q2",
      status: "issued",
      issuedAt: new Date("2026-07-15T00:00:00Z"),
    },
  });

  interface LineSeed {
    title: string;
    currency: CurrencyCode;
    native: string; // major
    realizedIDR: number; // major IDR
    status: "confirmed" | "provisional" | "disputed";
    contract: { id: string; def: ContractDef };
  }
  const defOf = (c: { splits: { payeeId: string; shareBp: number }[] }): ContractDef => ({
    splits: c.splits.map((s) => ({ payeeId: s.payeeId, shareBp: s.shareBp })),
  });
  const lineSeeds: LineSeed[] = [
    { title: "Hujan", currency: "USD", native: "1842.50", realizedIDR: 29650000, status: "confirmed", contract: { id: cAndi.id, def: defOf(cAndi) } },
    { title: "Senja", currency: "USD", native: "963.20", realizedIDR: 15480000, status: "confirmed", contract: { id: cAndi.id, def: defOf(cAndi) } },
    { title: "Pulang", currency: "EUR", native: "418.00", realizedIDR: 7240000, status: "provisional", contract: { id: cKraton.id, def: defOf(cKraton) } },
    { title: "Lampu", currency: "EUR", native: "512.75", realizedIDR: 8905000, status: "confirmed", contract: { id: cLampu.id, def: defOf(cLampu) } },
    { title: "Ombak", currency: "SGD", native: "742.00", realizedIDR: 8820000, status: "disputed", contract: { id: cSunda.id, def: defOf(cSunda) } },
    { title: "Neon", currency: "USD", native: "1205.40", realizedIDR: 19380000, status: "confirmed", contract: { id: cAndi.id, def: defOf(cAndi) } },
    { title: "Kabel", currency: "EUR", native: "287.60", realizedIDR: 4975000, status: "provisional", contract: { id: cMaya.id, def: defOf(cMaya) } },
    { title: "Jakarta", currency: "SGD", native: "1095.00", realizedIDR: 13020000, status: "confirmed", contract: { id: cSunda.id, def: defOf(cSunda) } },
  ];

  // Create lines (resolvedContractId frozen), accumulate participant shares (all
  // realized lines) and ledger postings (confirmed lines only).
  const participantTotals = new Map<string, bigint>();
  const primaryBalances = new Map<string, bigint>(); // payeeId → IDR minor on Primary

  for (const ls of lineSeeds) {
    const tr = tracks[ls.title]!;
    const item = await prisma.item.findFirstOrThrow({
      where: { tenantId: tenant.id, trackId: tr.id },
    });
    const realizedMinor = idr(ls.realizedIDR);
    await prisma.statementLine.create({
      data: {
        statementId: statement.id,
        itemId: item.id,
        trackId: tr.id,
        source: "fuga",
        revenueType: "streaming",
        nativeCurrency: ls.currency,
        nativeAmountMinor: fx(ls.native, ls.currency),
        realizedMinor,
        reconStatus: ls.status,
        resolvedContractId: ls.contract.id,
      },
    });

    // Participant shares (functional IDR) for every realized line.
    const postings = applyContract(realizedMinor, "IDR", ls.contract.def);
    for (const p of postings) {
      if (p.payeeId === LABEL_PAYEE) continue;
      participantTotals.set(p.payeeId, (participantTotals.get(p.payeeId) ?? 0n) + p.amountMinor);
      if (ls.status === "confirmed") {
        primaryBalances.set(p.payeeId, (primaryBalances.get(p.payeeId) ?? 0n) + p.amountMinor);
      }
    }
  }

  for (const [payeeId, shareFunctionalMinor] of participantTotals) {
    await prisma.statementParticipant.create({
      data: { statementId: statement.id, payeeId, shareFunctionalMinor },
    });
  }

  // Post confirmed lines to Primary (null ledger) IDR balances.
  for (const [payeeId, amountMinor] of primaryBalances) {
    await prisma.payeeBalance.create({
      data: { payeeId, ledgerId: null, currency: "IDR", amountMinor },
    });
  }

  // Recoupable advance: expense −Rp 15,000,000 to Andi on the Advance ledger.
  const advanceTxn = await prisma.manualTransaction.create({
    data: {
      tenantId: tenant.id,
      type: "expense",
      currency: "IDR",
      amountMinor: idr(15000000),
      occurredAt: new Date("2026-05-01T00:00:00Z"),
      memo: "Recoupable advance to Andi Pratama",
      payeeId: andi.id,
      ledgerId: advanceLedger.id,
    },
  });
  await prisma.txnPosting.create({
    data: {
      transactionId: advanceTxn.id,
      payeeId: andi.id,
      ledgerId: advanceLedger.id,
      currency: "IDR",
      amountMinor: -idr(15000000),
    },
  });
  await prisma.payeeBalance.create({
    data: { payeeId: andi.id, ledgerId: advanceLedger.id, currency: "IDR", amountMinor: -idr(15000000) },
  });

  // One paid payout to Andi: Rp 38,555,000 from Primary, with proof + posting.
  const payoutAmount = idr(38555000);
  const payout = await prisma.payout.create({
    data: {
      tenantId: tenant.id,
      payeeId: andi.id,
      statementId: statement.id,
      grossFunctionalMinor: payoutAmount,
      payoutCurrency: "IDR",
      payoutAmountMinor: payoutAmount,
      realizedRate: "1",
      rail: "bank_transfer",
      status: "paid",
      proofUrl: "https://example.invalid/proofs/andi-2026-q2.pdf",
      paidAt: new Date("2026-07-20T00:00:00Z"),
    },
  });
  await prisma.payoutPosting.create({
    data: { payoutId: payout.id, ledgerId: null, currency: "IDR", amountMinor: -payoutAmount },
  });
  // Lower Andi's Primary balance by the payout.
  const andiPrimary = await prisma.payeeBalance.findFirstOrThrow({
    where: { payeeId: andi.id, ledgerId: null, currency: "IDR" },
  });
  await prisma.payeeBalance.update({
    where: { id: andiPrimary.id },
    data: { amountMinor: andiPrimary.amountMinor - payoutAmount },
  });

  // Passwordless admin + payee users, each with an invite token (printed below).
  const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const adminInvite = generateInviteToken();
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "admin@nusantara.test",
      role: "admin",
      inviteTokenHash: adminInvite.hash,
      inviteExpiresAt: sevenDays,
    },
  });
  const payeeInvite = generateInviteToken();
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "andi@payee.test",
      role: "payee",
      payeeId: andi.id,
      inviteTokenHash: payeeInvite.hash,
      inviteExpiresAt: sevenDays,
    },
  });

  // eslint-disable-next-line no-console
  console.log("\n========================================================");
  console.log("Rekon seed complete. Claim these invites in the web app:");
  console.log("--------------------------------------------------------");
  console.log(`Tenant ID (needed for login):  ${tenant.id}`);
  console.log(`Admin  admin@nusantara.test  token: ${adminInvite.raw}`);
  console.log(`Payee  andi@payee.test       token: ${payeeInvite.raw}`);
  console.log("========================================================\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
