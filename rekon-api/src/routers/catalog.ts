import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure, assertTenant } from "../trpc.js";
import { loadAssignmentMaps, treeContextFor } from "../lib/contractTree.js";
import { resolveContractId, BASIS_POINTS_FULL } from "../lib/contracts.js";

export const catalogRouter = router({
  search: tenantProcedure
    .input(z.object({ q: z.string().default("") }))
    .query(async ({ ctx, input }) => {
      const q = input.q.trim();
      const [tracks, releases] = await Promise.all([
        ctx.prisma.track.findMany({
          where: {
            release: { tenantId: ctx.user.tenantId },
            OR: q ? [{ title: { contains: q, mode: "insensitive" } }, { isrc: { contains: q } }] : undefined,
          },
          include: { release: true },
          take: 50,
        }),
        ctx.prisma.release.findMany({
          where: {
            tenantId: ctx.user.tenantId,
            title: q ? { contains: q, mode: "insensitive" } : undefined,
          },
          take: 50,
        }),
      ]);
      return { tracks, releases };
    }),

  tree: tenantProcedure.query(async ({ ctx }) => {
    const maps = await loadAssignmentMaps(ctx.prisma, ctx.user.tenantId);
    const artists = await ctx.prisma.artist.findMany({
      where: { tenantId: ctx.user.tenantId },
      include: { releases: { include: { tracks: true } } },
      orderBy: { name: "asc" },
    });
    const unassignedItemCount = await ctx.prisma.item.count({
      where: { tenantId: ctx.user.tenantId, trackId: null, releaseId: null },
    });
    const unknownArtistReleases = await ctx.prisma.release.findMany({
      where: { tenantId: ctx.user.tenantId, artistId: null },
      include: { tracks: true },
    });

    const decorateRelease = (r: {
      id: string;
      title: string;
      catalogNo: string | null;
      tracks: { id: string; title: string; isrc: string | null }[];
    }) => ({
      id: r.id,
      title: r.title,
      catalogNo: r.catalogNo,
      hasReleaseContract: maps.releaseContract.has(r.id),
      tracks: r.tracks.map((t) => ({
        id: t.id,
        title: t.title,
        isrc: t.isrc,
        hasTrackContract: maps.trackContract.has(t.id),
      })),
      // A release "missing a contract" has neither a release contract nor any track
      // with its own contract.
      missingContract:
        !maps.releaseContract.has(r.id) &&
        !r.tracks.some((t) => maps.trackContract.has(t.id)),
    });

    return {
      artists: artists.map((a) => ({
        id: a.id,
        name: a.name,
        releases: a.releases.map(decorateRelease),
      })),
      unassignedItemCount,
      unknownArtistReleases: unknownArtistReleases.map(decorateRelease),
    };
  }),

  trackDetail: tenantProcedure
    .input(z.object({ trackId: z.string() }))
    .query(async ({ ctx, input }) => {
      const track = await ctx.prisma.track.findUnique({
        where: { id: input.trackId },
        include: { release: true },
      });
      if (!track) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(track.release.tenantId, ctx.user.tenantId);

      const maps = await loadAssignmentMaps(ctx.prisma, ctx.user.tenantId);
      const treeCtx = treeContextFor(
        { trackId: track.id, releaseId: track.releaseId },
        maps,
      );
      const contractId = resolveContractId(treeCtx);
      const source =
        treeCtx.trackContractId
          ? "track"
          : treeCtx.releaseContractId
            ? "release"
            : "none";

      const def = contractId ? maps.contractDefs.get(contractId) : undefined;
      const payeeShareBp = def?.splits.reduce((a, s) => a + s.shareBp, 0) ?? 0;
      const labelRemainderBp = BASIS_POINTS_FULL - payeeShareBp;

      let splits: { payeeId: string; payeeName: string; shareBp: number }[] = [];
      if (def) {
        const payees = await ctx.prisma.payee.findMany({
          where: { id: { in: def.splits.map((s) => s.payeeId) } },
          select: { id: true, name: true },
        });
        const nameOf = new Map(payees.map((p) => [p.id, p.name]));
        splits = def.splits.map((s) => ({
          payeeId: s.payeeId,
          payeeName: nameOf.get(s.payeeId) ?? "(unknown payee)",
          shareBp: s.shareBp,
        }));
      }

      return {
        track: { id: track.id, title: track.title, isrc: track.isrc },
        release: { id: track.release.id, title: track.release.title },
        contractId,
        source,
        splits,
        labelRemainderBp,
      };
    }),

  createArtist: tenantProcedure
    .input(z.object({ name: z.string().min(1), aliasOfId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.artist.create({
        data: {
          tenantId: ctx.user.tenantId,
          name: input.name,
          aliasOfId: input.aliasOfId ?? null,
        },
      });
    }),

  createRelease: tenantProcedure
    .input(
      z.object({
        title: z.string().min(1),
        artistId: z.string().optional(),
        catalogNo: z.string().optional(),
        artworkUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.release.create({
        data: {
          tenantId: ctx.user.tenantId,
          title: input.title,
          artistId: input.artistId ?? null,
          catalogNo: input.catalogNo ?? null,
          artworkUrl: input.artworkUrl ?? null,
        },
      });
    }),

  createTrack: tenantProcedure
    .input(
      z.object({
        releaseId: z.string(),
        title: z.string().min(1),
        isrc: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const release = await ctx.prisma.release.findUnique({
        where: { id: input.releaseId },
      });
      if (!release) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(release.tenantId, ctx.user.tenantId);
      return ctx.prisma.track.create({
        data: {
          releaseId: input.releaseId,
          title: input.title,
          isrc: input.isrc ?? null,
        },
      });
    }),

  // Enriching catalog from Spotify needs a Spotify API integration that isn't built.
  // HARDEN: implement the Spotify Web API client (ISRC lookup, artwork, artist/release
  // metadata) and background enrichment jobs.
  createFromSpotify: tenantProcedure
    .input(z.object({ spotifyUrl: z.string() }))
    .mutation(() => {
      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message: "Spotify import is not implemented (HARDEN: add Spotify Web API client).",
      });
    }),
});
