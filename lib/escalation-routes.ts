import type { EscalationRole, EscalationRule } from "@callsheet/db/types";

/**
 * Escalations route by problem type, not to one person. SPEC.md,
 * "Escalation routing". The person holding each role is an EscalationContact.
 */
export const ESCALATION_ROUTES: Readonly<Record<EscalationRule, EscalationRole>> = {
  TWO_OPEN_ISSUES: "ACCOUNT_DIRECTOR",
  TRIAL_CLIENT_COMPLAINT: "ACCOUNT_DIRECTOR",
  RED_SEVEN_DAYS: "ACCOUNT_DIRECTOR",
  REPLACEMENT_REQUEST: "ACCOUNT_DIRECTOR",
  REPEAT_ATTENDANCE: "DELIVERY_MANAGER",
  REGRESSED_FOLLOW_UP: "DELIVERY_MANAGER",
};
