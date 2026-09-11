import { db } from "../client";
import type { Party } from "../generated/prisma/client";

export type LogFeedbackInput = {
  placementId: string;
  party: Party;
  sentiment: number;
  collectedAt: Date;
  note?: string;
};

export const feedbackRepository = {
  log(input: LogFeedbackInput) {
    if (!Number.isInteger(input.sentiment) || input.sentiment < 1 || input.sentiment > 5) {
      throw new RangeError("Sentiment must be a whole number from 1 to 5.");
    }
    return db().feedbackEntry.create({ data: input });
  },
};
