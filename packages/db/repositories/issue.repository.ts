import { db } from "../client";
import type { FollowUpOutcome } from "../generated/prisma/client";

const DAY_MS = 86_400_000;

/** Follow-up windows, in days after the fix. SPEC.md, "IssueFollowUp". */
export const FOLLOW_UP_OFFSET_DAYS = [7, 21, 45] as const;

export const issueRepository = {
  /**
   * Records that a fix was applied and schedules the 7, 21 and 45-day checks
   * from fixedAt. Fixing again after a regression replaces the old windows.
   */
  markFixed(issueId: string, fixedAt: Date) {
    return db().$transaction(async (tx) => {
      const issue = await tx.issue.update({
        where: { id: issueId },
        data: { status: "FIXED", fixedAt },
      });
      await tx.issueFollowUp.deleteMany({ where: { issueId } });
      await tx.issueFollowUp.createMany({
        data: FOLLOW_UP_OFFSET_DAYS.map((offsetDays) => ({
          issueId,
          offsetDays,
          dueAt: new Date(fixedAt.getTime() + offsetDays * DAY_MS),
        })),
      });
      return issue;
    });
  },

  /**
   * Records a follow-up result. REGRESSED flips the issue back to REGRESSED,
   * which scoring escalates. The issue closes once every window has held.
   */
  recordFollowUpOutcome(
    followUpId: string,
    outcome: FollowUpOutcome,
    checkedAt: Date,
  ) {
    return db().$transaction(async (tx) => {
      const followUp = await tx.issueFollowUp.update({
        where: { id: followUpId },
        data: { outcome, checkedAt },
      });

      if (outcome === "REGRESSED") {
        await tx.issue.update({
          where: { id: followUp.issueId },
          data: { status: "REGRESSED" },
        });
        return followUp;
      }

      const notYetHeld = await tx.issueFollowUp.count({
        where: {
          issueId: followUp.issueId,
          OR: [{ outcome: null }, { outcome: "REGRESSED" }],
        },
      });
      if (notYetHeld === 0) {
        await tx.issue.updateMany({
          where: { id: followUp.issueId, status: "FIXED" },
          data: { status: "CLOSED" },
        });
      }
      return followUp;
    });
  },
};
