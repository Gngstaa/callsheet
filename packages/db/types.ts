// Type-only entry point, so pure modules like lib/scoring.ts can use the
// model types without importing anything that touches the database.

export type {
  CheckIn,
  Client,
  Escalation,
  EscalationContact,
  EscalationRole,
  EscalationRule,
  FeedbackEntry,
  FollowUpOutcome,
  HealthSnapshot,
  HealthStatus,
  Industry,
  Issue,
  IssueFollowUp,
  IssueSeverity,
  IssueStatus,
  IssueType,
  Location,
  Party,
  Placement,
  PlacementStatus,
  Professional,
  Reporter,
} from "./generated/prisma/client";
export type { DemoDataInput } from "./repositories/demo-data.repository";
export type { RecordHealthSnapshotInput } from "./repositories/health-snapshot.repository";
export type { HydratedPlacement } from "./repositories/placement.repository";
