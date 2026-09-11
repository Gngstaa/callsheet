import { db } from "../client";

export const escalationContactRepository = {
  list() {
    return db().escalationContact.findMany({ orderBy: { role: "asc" } });
  },
};
