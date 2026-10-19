import { z } from "zod";
import { router, tenantProcedure } from "../trpc.js";
import { distributorSources } from "../ingestion/profiles.js";
import { parseStatementCsv } from "../ingestion/parse.js";
import { itemMetaKey } from "../ingestion/items.js";
import { writeAudit } from "../audit/log.js";

export const ingestionRouter = router({
  listDistributors: tenantProcedure.query(() => {
    return {
      sources: distributorSources(),
      requestImporter: {
        message:
          "Don't see your distributor? Request an importer and we'll add a verified mapping.",
        contactUs: "support@rekon.example",
      },
      rawFileNotice:
        "Upload the raw statement exactly as the distributor exported it. Don't edit, re-save, or reformat the file — we re-parse it server-side and your edits can corrupt totals.",
    };
  }),

  // Client-side preview only. The authoritative parse happens again on commit — the
  // client is never trusted to send parsed numbers.
  preview: tenantProcedure
    .input(
      z.object({
        importerId: z.string(),
        csv: z.string(),
        period: z.string().optional(),
      }),
    )
    .query(({ input }) => {
      return parseStatementCsv(input.importerId, input.csv, { period: input.period });
    }),

  commit: tenantProcedure
    .input(
      z.object({
        importerId: z.string(),
        csv: z.string(),
        title: z.string().min(1),
        period: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // RE-PARSE server-side — never trust client-sent parsed data.
      const parsed = parseStatementCsv(input.importerId, input.csv, {
        period: input.period,
      });

      const result = await ctx.prisma.$transaction(async (tx) => {
        const statement = await tx.statement.create({
          data: {
            id: `ST-${Date.now()}`,
            tenantId: ctx.user.tenantId,
            title: input.title,
            period: parsed.period,
            status: "draft",
          },
        });

        let autoMapped = 0;
        let needsCleanup = 0;

        for (const line of parsed.lines) {
          const metaKey = itemMetaKey(line);
          // Create/dedupe the Item for this source + metadata.
          let item = await tx.item.findUnique({
            where: {
              tenantId_source_metaKey: {
                tenantId: ctx.user.tenantId,
                source: parsed.source,
                metaKey,
              },
            },
          });
          if (!item) {
            item = await tx.item.create({
              data: {
                tenantId: ctx.user.tenantId,
                source: parsed.source,
                metaKey,
                isrc: line.isrc ?? null,
                upc: line.upc ?? null,
                trackName: line.title ?? null,
                releaseName: line.releaseName ?? null,
                artist: line.artist ?? null,
                catalogNo: line.catalogNo ?? null,
              },
            });
          }

          // Auto-map by ISRC if not already linked.
          if (!item.trackId && line.isrc) {
            const track = await tx.track.findFirst({
              where: { isrc: line.isrc, release: { tenantId: ctx.user.tenantId } },
            });
            if (track) {
              item = await tx.item.update({
                where: { id: item.id },
                data: { trackId: track.id, releaseId: track.releaseId },
              });
            }
          }

          if (item.trackId) {
            autoMapped += 1;
          } else {
            needsCleanup += 1;
            await tx.exception.create({
              data: {
                tenantId: ctx.user.tenantId,
                kind: "unmatched_item",
                detail: `Could not auto-map "${line.title ?? line.isrc ?? "unknown"}" (${parsed.source}) to a track. Assign it in Cleanup.`,
              },
            });
          }

          await tx.statementLine.create({
            data: {
              statementId: statement.id,
              itemId: item.id,
              trackId: item.trackId,
              source: parsed.source,
              revenueType: line.revenueType,
              nativeCurrency: line.nativeCurrency,
              nativeAmountMinor: line.nativeAmountMinor,
              reconStatus: "unpaid",
            },
          });
        }

        await writeAudit(tx, {
          tenantId: ctx.user.tenantId,
          actorId: ctx.user.id,
          action: "statement.imported",
          recordId: statement.id,
          params: { title: input.title, lines: String(parsed.lines.length) },
        });

        return {
          statementId: statement.id,
          totalLines: parsed.lines.length,
          autoMapped,
          needsCleanup,
          rejected: parsed.rejected.length,
        };
      });

      return result;
    }),
});
