import { db } from "../client";
import type { Prisma } from "../generated/prisma/client";

export type DemoDataInput = {
  escalationContacts: readonly Prisma.EscalationContactCreateManyInput[];
  clients: readonly Prisma.ClientCreateManyInput[];
  professionals: readonly Prisma.ProfessionalCreateManyInput[];
  placements: readonly Prisma.PlacementCreateManyInput[];
  feedbackEntries: readonly Prisma.FeedbackEntryCreateManyInput[];
  issues: readonly Prisma.IssueCreateManyInput[];
  issueFollowUps: readonly Prisma.IssueFollowUpCreateManyInput[];
  checkIns: readonly Prisma.CheckInCreateManyInput[];
  actionLogs: readonly Prisma.ActionLogCreateManyInput[];
  escalations: readonly Prisma.EscalationCreateManyInput[];
  healthSnapshots: readonly Prisma.HealthSnapshotCreateManyInput[];
};

export const demoDataRepository = {
  /**
   * Replaces the whole database with the given data, in one transaction.
   * Every row in every Callsheet table is deleted first, so running it twice
   * leaves the same data — and running it against real placements deletes
   * them.
   */
  replaceAll(data: DemoDataInput) {
    return db().$transaction(
      async (tx) => {
        // Children before parents.
        await tx.healthSnapshot.deleteMany();
        await tx.escalation.deleteMany();
        await tx.actionLog.deleteMany();
        await tx.checkIn.deleteMany();
        await tx.issueFollowUp.deleteMany();
        await tx.issue.deleteMany();
        await tx.feedbackEntry.deleteMany();
        await tx.placement.deleteMany();
        await tx.professional.deleteMany();
        await tx.client.deleteMany();
        await tx.escalationContact.deleteMany();

        // Parents before children.
        await tx.escalationContact.createMany({ data: [...data.escalationContacts] });
        await tx.client.createMany({ data: [...data.clients] });
        await tx.professional.createMany({ data: [...data.professionals] });
        await tx.placement.createMany({ data: [...data.placements] });
        await tx.feedbackEntry.createMany({ data: [...data.feedbackEntries] });
        await tx.issue.createMany({ data: [...data.issues] });
        await tx.issueFollowUp.createMany({ data: [...data.issueFollowUps] });
        await tx.checkIn.createMany({ data: [...data.checkIns] });
        await tx.actionLog.createMany({ data: [...data.actionLogs] });
        await tx.escalation.createMany({ data: [...data.escalations] });
        await tx.healthSnapshot.createMany({ data: [...data.healthSnapshots] });
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  },
};
