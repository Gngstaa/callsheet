import { db } from "../client";

export const checkInRepository = {
  complete(checkInId: string, completedAt: Date) {
    return db().checkIn.update({
      where: { id: checkInId },
      data: { completedAt },
    });
  },
};
