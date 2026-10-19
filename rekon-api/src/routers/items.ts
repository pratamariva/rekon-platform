import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure, assertTenant } from "../trpc.js";

export const itemsRouter = router({
  unassigned: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prisma.item.findMany({
      where: { tenantId: ctx.user.tenantId, trackId: null, releaseId: null },
      orderBy: { createdAt: "desc" },
    });
  }),

  // Assign an item to a track. Pulls the track's release and mirrors both ids onto the
  // item AND onto every statement line that references the item, so contract resolution
  // and reporting see the link immediately.
  assignToTrack: tenantProcedure
    .input(z.object({ itemId: z.string(), trackId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.item.findUnique({ where: { id: input.itemId } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(item.tenantId, ctx.user.tenantId);

      const track = await ctx.prisma.track.findUnique({
        where: { id: input.trackId },
        include: { release: true },
      });
      if (!track) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(track.release.tenantId, ctx.user.tenantId);

      await ctx.prisma.$transaction(async (tx) => {
        await tx.item.update({
          where: { id: item.id },
          data: { trackId: track.id, releaseId: track.releaseId },
        });
        await tx.statementLine.updateMany({
          where: { itemId: item.id },
          data: { trackId: track.id },
        });
      });
      return { ok: true };
    }),

  assignToRelease: tenantProcedure
    .input(z.object({ itemId: z.string(), releaseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.item.findUnique({ where: { id: input.itemId } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(item.tenantId, ctx.user.tenantId);

      const release = await ctx.prisma.release.findUnique({
        where: { id: input.releaseId },
      });
      if (!release) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(release.tenantId, ctx.user.tenantId);

      await ctx.prisma.item.update({
        where: { id: item.id },
        data: { releaseId: release.id },
      });
      return { ok: true };
    }),
});
