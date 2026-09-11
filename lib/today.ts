/** Left rule weight: 3px alert, 2px watch, none for routine. */
export type Severity = "alert" | "watch" | "routine";

export type TodayRowData = {
  id: string;
  professional: string;
  /** Client, then where the placement sits in its life. */
  context: string;
  /** A sentence someone would say out loud. */
  reason: string;
  action: string;
  severity: Severity;
  escalation?: {
    rule: string;
    owner: string;
  };
};
