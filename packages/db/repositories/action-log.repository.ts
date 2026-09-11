import { db } from "../client";
import type { ActionType } from "../generated/prisma/client";

export type LogActionInput = {
  placementId: string;
  actionType: ActionType;
  performedAt: Date;
  note?: string;
};

export const actionLogRepository = {
  /** Hides this action type on this placement for the rest of the Eastern day. */
  log(input: LogActionInput) {
    return db().actionLog.create({ data: input });
  },
};
