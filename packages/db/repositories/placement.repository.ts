import { db } from "../client";
import type { Prisma } from "../generated/prisma/client";

/** Everything the scoring engine reads about a placement. */
export const hydratedPlacementInclude = {
  client: true,
  professional: true,
  feedbackEntries: { orderBy: { collectedAt: "desc" } },
  issues: { include: { followUps: { orderBy: { offsetDays: "asc" } } } },
  checkIns: true,
  actionLogs: true,
  escalations: true,
  healthSnapshots: { orderBy: { day: "desc" } },
} satisfies Prisma.PlacementInclude;

export type HydratedPlacement = Prisma.PlacementGetPayload<{
  include: typeof hydratedPlacementInclude;
}>;

export const placementRepository = {
  findActiveHydrated(): Promise<HydratedPlacement[]> {
    return db().placement.findMany({
      where: { status: "ACTIVE" },
      include: hydratedPlacementInclude,
    });
  },

  findHydratedById(id: string): Promise<HydratedPlacement | null> {
    return db().placement.findUnique({
      where: { id },
      include: hydratedPlacementInclude,
    });
  },
};
