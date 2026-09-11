import { db } from "../client";
import type { Prisma } from "../generated/prisma/client";

/**
 * What the scoring engine reads about a placement, and no more. The engine
 * ignores professional feedback, completed check-ins and every snapshot that
 * is not red, so those rows are not loaded: before this, one Today query
 * fetched 2,400 snapshots to use 12. A screen that shows full history needs
 * its own query.
 */
export const hydratedPlacementInclude = {
  client: true,
  professional: true,
  feedbackEntries: { where: { party: "CLIENT" }, orderBy: { collectedAt: "desc" } },
  issues: { include: { followUps: { orderBy: { offsetDays: "asc" } } } },
  checkIns: { where: { completedAt: null } },
  escalations: true,
  healthSnapshots: { where: { status: "RED" }, orderBy: { day: "desc" } },
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
