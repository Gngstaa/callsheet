import { db } from "../client";
import type { EscalationRule } from "../generated/prisma/client";

export type RecordEscalationInput = {
  placementId: string;
  /** Null for placement-wide rules. */
  issueId: string | null;
  rule: EscalationRule;
  contactId: string;
  reason: string;
  escalatedAt: Date;
};

export const escalationRepository = {
  /** Records that the CSM handed an escalation on. Clears it from Today. */
  record(input: RecordEscalationInput) {
    return db().escalation.create({ data: input });
  },
};
