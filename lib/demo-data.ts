import type {
  CheckIn,
  Client,
  Escalation,
  EscalationContact,
  EscalationRule,
  FeedbackEntry,
  HealthSnapshot,
  Industry,
  Issue,
  IssueFollowUp,
  IssueSeverity,
  IssueStatus,
  IssueType,
  Location,
  Party,
  Placement,
  Professional,
  Reporter,
} from "@callsheet/db/types";

import { ESCALATION_ROUTES } from "@/lib/escalation-routes";
import {
  feedbackCadenceDays,
  operationalDay,
  scorePlacement,
  type ScoringPlacement,
} from "@/lib/scoring";

/*
 * The demo data set. Every person and company in it is invented.
 *
 * Everything is dated relative to the Eastern day of the reference date, so a
 * reset on any day gives the same situations. Each placement says which
 * SPEC.md sample-data case it carries.
 *
 * Health history is not written by hand. The scoring engine is replayed over
 * each of the last 90 days against the data as it stood that day, so the
 * history cannot contradict what the engine says today.
 */

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export const HEALTH_HISTORY_DAYS = 90;
// Feedback and check-ins go back further than the snapshots, so the first
// replayed day already has a normal cadence behind it.
const RECORD_HISTORY_DAYS = HEALTH_HISTORY_DAYS + 40;
// The same windows issueRepository.markFixed schedules.
const FOLLOW_UP_OFFSET_DAYS = [7, 21, 45] as const;
const CHECK_IN_INTERVAL_DAYS = 30;

export type DemoPlacement = Omit<Placement, "weeklyRateUsd"> & { weeklyRateUsd: number };

export type DemoDataset = {
  escalationContacts: EscalationContact[];
  clients: Client[];
  professionals: Professional[];
  placements: DemoPlacement[];
  feedbackEntries: FeedbackEntry[];
  issues: Issue[];
  issueFollowUps: IssueFollowUp[];
  checkIns: CheckIn[];
  escalations: Escalation[];
  healthSnapshots: HealthSnapshot[];
};

// ---------------------------------------------------------------------------
// The cast

type ClientSpec = {
  key: string;
  name: string;
  industry: Industry;
  timezone: string;
  contactName: string;
  emailDomain: string;
};

type IssueSpec = {
  key: string;
  type: IssueType;
  severity: IssueSeverity;
  reportedBy: Reporter;
  reportedDaysAgo: number;
  summary: string;
  fixedDaysAgo?: number;
  /** Results of the 7, 21 and 45-day checks, in order, each checked on its due day. */
  outcomes?: readonly ("HELD" | "REGRESSED")[];
};

type EscalationSpec = {
  rule: EscalationRule;
  issueKey: string | null;
  escalatedDaysAgo: number;
  reason: string;
};

type PlacementSpec = {
  professional: { name: string; role: string; location: Location };
  client: string;
  dayIndex: number;
  weeklyRateUsd: number;
  /** Days since the last client feedback. Null means no feedback from anyone, ever. */
  lastClientFeedbackDaysAgo: number | null;
  lastClientSentiment?: number;
  clientCheckInOverdueDays?: number;
  professionalCheckInOverdueDays?: number;
  issues?: readonly IssueSpec[];
  escalations?: readonly EscalationSpec[];
};

const ESCALATION_CONTACTS: readonly EscalationContact[] = [
  { id: "demo-contact-account-director", name: "Nandini Rao", role: "ACCOUNT_DIRECTOR" },
  { id: "demo-contact-delivery-manager", name: "Vikram Iyer", role: "DELIVERY_MANAGER" },
];

const CLIENTS: readonly ClientSpec[] = [
  { key: "lakeshore", name: "Lakeshore Architecture Studio", industry: "ARCHITECTURE_ENGINEERING", timezone: "America/Chicago", contactName: "Dana Whitfield", emailDomain: "lakeshorestudio.example" },
  { key: "brightwater", name: "Brightwater Dental Group", industry: "HEALTHCARE", timezone: "America/New_York", contactName: "Laura Chen", emailDomain: "brightwaterdental.example" },
  { key: "redfern", name: "Redfern Insurance Partners", industry: "INSURANCE", timezone: "America/Denver", contactName: "Mike Alvarez", emailDomain: "redfernins.example" },
  { key: "northfield", name: "Northfield Pediatrics", industry: "HEALTHCARE", timezone: "America/New_York", contactName: "Karen Holt", emailDomain: "northfieldpeds.example" },
  { key: "pinecrest", name: "Pinecrest Supply Co.", industry: "ECOMMERCE_RETAIL", timezone: "America/Los_Angeles", contactName: "Greg Novak", emailDomain: "pinecrestsupply.example" },
  { key: "summit-ridge", name: "Summit Ridge Software", industry: "SAAS_STARTUPS", timezone: "America/Los_Angeles", contactName: "Erin Walsh", emailDomain: "summitridge.example" },
  { key: "granite-peak", name: "Granite Peak Builders", industry: "CONSTRUCTION", timezone: "America/Denver", contactName: "Scott Lindgren", emailDomain: "granitepeak.example" },
  { key: "oakhurst", name: "Oakhurst Legal Group", industry: "LEGAL_PROFESSIONAL_SERVICES", timezone: "America/Chicago", contactName: "Rachel Moore", emailDomain: "oakhurstlegal.example" },
  { key: "bayview", name: "Bayview Home Goods", industry: "ECOMMERCE_RETAIL", timezone: "America/New_York", contactName: "Jason Park", emailDomain: "bayviewhome.example" },
  { key: "meridian", name: "Meridian Construction", industry: "CONSTRUCTION", timezone: "America/Chicago", contactName: "Tom Becker", emailDomain: "meridianbuild.example" },
  { key: "copperline", name: "Copperline Freight Brokers", industry: "BACK_OFFICE_OPERATIONS", timezone: "America/Chicago", contactName: "Denise Carter", emailDomain: "copperline.example" },
  { key: "tallgrass", name: "Tallgrass Title & Escrow", industry: "LEGAL_PROFESSIONAL_SERVICES", timezone: "America/Chicago", contactName: "Brian Foster", emailDomain: "tallgrasstitle.example" },
  { key: "ironwood", name: "Ironwood Engineering", industry: "ARCHITECTURE_ENGINEERING", timezone: "America/Denver", contactName: "Heather Quinn", emailDomain: "ironwoodeng.example" },
  { key: "silver-creek", name: "Silver Creek Orthopedics", industry: "HEALTHCARE", timezone: "America/Phoenix", contactName: "Andrew Lowe", emailDomain: "silvercreekortho.example" },
  { key: "blue-mesa", name: "Blue Mesa Analytics", industry: "SAAS_STARTUPS", timezone: "America/Denver", contactName: "Kelly Nguyen", emailDomain: "bluemesa.example" },
  { key: "crescent-bay", name: "Crescent Bay Outfitters", industry: "ECOMMERCE_RETAIL", timezone: "America/Los_Angeles", contactName: "Marcus Reed", emailDomain: "crescentbay.example" },
  { key: "keystone", name: "Keystone Claims Services", industry: "INSURANCE", timezone: "America/New_York", contactName: "Julie Barnes", emailDomain: "keystoneclaims.example" },
  { key: "evergreen", name: "Evergreen Property Management", industry: "BACK_OFFICE_OPERATIONS", timezone: "America/Los_Angeles", contactName: "Nathan Cole", emailDomain: "evergreenpm.example" },
  { key: "hollis-grant", name: "Hollis & Grant LLP", industry: "LEGAL_PROFESSIONAL_SERVICES", timezone: "America/New_York", contactName: "Megan Price", emailDomain: "hollisgrant.example" },
  { key: "sawtooth", name: "Sawtooth Mechanical", industry: "CONSTRUCTION", timezone: "America/Boise", contactName: "Kyle Jensen", emailDomain: "sawtoothmech.example" },
  { key: "riverbend", name: "Riverbend Accounting Partners", industry: "BACK_OFFICE_OPERATIONS", timezone: "America/Chicago", contactName: "Lisa Romero", emailDomain: "riverbendcpa.example" },
  { key: "fieldstone", name: "Fieldstone Structural", industry: "ARCHITECTURE_ENGINEERING", timezone: "America/New_York", contactName: "Paul Decker", emailDomain: "fieldstonestructural.example" },
  { key: "nimbus", name: "Nimbus Metrics", industry: "SAAS_STARTUPS", timezone: "America/Los_Angeles", contactName: "Chris Yamada", emailDomain: "nimbusmetrics.example" },
  { key: "harborview", name: "Harborview Insurance Group", industry: "INSURANCE", timezone: "America/New_York", contactName: "Amanda Fox", emailDomain: "harborviewins.example" },
];

// Red and amber first, then green. 2 red, 11 amber, 19 green.
const PLACEMENTS: readonly PlacementSpec[] = [
  // SPEC: silent 68 days, red. Red since the silence reached twice the
  // cadence, 9 days running, so rule 4 fires here.
  {
    professional: { name: "Siddharth Bhosale", role: "Estimator", location: "PUNE" },
    client: "granite-peak",
    dayIndex: 410,
    weeklyRateUsd: 780,
    lastClientFeedbackDaysAgo: 68,
  },
  // SPEC: issue fixed 22 days ago whose 21-day check came back REGRESSED.
  // Rule 6, not yet escalated.
  {
    professional: { name: "Jerome Aquino", role: "Accounts payable specialist", location: "MANILA" },
    client: "copperline",
    dayIndex: 250,
    weeklyRateUsd: 520,
    lastClientFeedbackDaysAgo: 5,
    lastClientSentiment: 3,
    issues: [
      {
        key: "cost-centres",
        type: "UNDERPERFORMANCE",
        severity: "MEDIUM",
        reportedBy: "CLIENT",
        reportedDaysAgo: 30,
        summary: "Vendor invoices posted to the wrong cost centres",
        fixedDaysAgo: 22,
        outcomes: ["HELD", "REGRESSED"],
      },
    ],
  },
  // SPEC: post-trial, silent 45 days against a 30-day cadence. Amber, not red.
  {
    professional: { name: "Ashwini Shinde", role: "Medical biller", location: "PUNE" },
    client: "silver-creek",
    dayIndex: 320,
    weeklyRateUsd: 560,
    lastClientFeedbackDaysAgo: 45,
  },
  // SPEC: days 1-14, the one with no feedback logged at all.
  {
    professional: { name: "Jasmine Villanueva", role: "Front desk coordinator", location: "MANILA" },
    client: "northfield",
    dayIndex: 9,
    weeklyRateUsd: 480,
    lastClientFeedbackDaysAgo: null,
  },
  // SPEC: the repeat attendance pair, 17 days apart. Rule 3 tripped and was
  // escalated the next day, so it is handled, not pending.
  {
    professional: { name: "Ketan Parmar", role: "Dental billing specialist", location: "RAJKOT" },
    client: "brightwater",
    dayIndex: 180,
    weeklyRateUsd: 540,
    lastClientFeedbackDaysAgo: 4,
    lastClientSentiment: 3,
    issues: [
      {
        key: "late-login",
        type: "ATTENDANCE",
        severity: "MEDIUM",
        reportedBy: "F5",
        reportedDaysAgo: 26,
        summary: "Logged in two hours late on a Monday",
        fixedDaysAgo: 24,
        outcomes: ["HELD"],
      },
      {
        key: "missed-shift",
        type: "ATTENDANCE",
        severity: "HIGH",
        reportedBy: "CLIENT",
        reportedDaysAgo: 9,
        summary: "Missed a full shift without notice",
      },
    ],
    escalations: [
      {
        rule: "REPEAT_ATTENDANCE",
        issueKey: "missed-shift",
        escalatedDaysAgo: 8,
        reason:
          "A second attendance issue came 17 days after the one before.",
      },
    ],
  },
  // In trial, silent 21 days against a 14-day cadence.
  {
    professional: { name: "Rhea Manalo", role: "Customer support specialist", location: "MANILA" },
    client: "crescent-bay",
    dayIndex: 40,
    weeklyRateUsd: 430,
    lastClientFeedbackDaysAgo: 21,
  },
  // Last client rating was a 2, and the client check-in is 8 days overdue.
  {
    professional: { name: "Nirav Dholakia", role: "Insurance claims processor", location: "RAJKOT" },
    client: "keystone",
    dayIndex: 220,
    weeklyRateUsd: 500,
    lastClientFeedbackDaysAgo: 6,
    lastClientSentiment: 2,
    clientCheckInOverdueDays: 8,
  },
  // In trial with an open issue.
  {
    professional: { name: "Omkar Jadhav", role: "QA tester", location: "PUNE" },
    client: "blue-mesa",
    dayIndex: 60,
    weeklyRateUsd: 700,
    lastClientFeedbackDaysAgo: 5,
    issues: [
      {
        key: "slow-regression-runs",
        type: "UNDERPERFORMANCE",
        severity: "LOW",
        reportedBy: "F5",
        reportedDaysAgo: 4,
        summary: "Regression test runs finishing a day late",
      },
    ],
  },
  // Three weeks into the trial, last client rating a 2.
  {
    professional: { name: "Maricel Dizon", role: "Claims intake specialist", location: "MANILA" },
    client: "redfern",
    dayIndex: 20,
    weeklyRateUsd: 470,
    lastClientFeedbackDaysAgo: 2,
    lastClientSentiment: 2,
  },
  // SPEC: one of the four attendance issues. Fixed 12 days ago; the 7-day
  // check is 5 days overdue.
  {
    professional: { name: "Harshil Vora", role: "Inventory coordinator", location: "RAJKOT" },
    client: "pinecrest",
    dayIndex: 300,
    weeklyRateUsd: 450,
    lastClientFeedbackDaysAgo: 8,
    issues: [
      {
        key: "early-departures",
        type: "ATTENDANCE",
        severity: "MEDIUM",
        reportedBy: "CLIENT",
        reportedDaysAgo: 19,
        summary: "Left early three days in one week",
        fixedDaysAgo: 12,
      },
    ],
  },
  // Client feedback due today, professional check-in 9 days overdue.
  {
    professional: { name: "Kedar Paranjpe", role: "CAD drafter", location: "PUNE" },
    client: "ironwood",
    dayIndex: 350,
    weeklyRateUsd: 650,
    lastClientFeedbackDaysAgo: 30,
    professionalCheckInOverdueDays: 9,
  },
  // End of the first month, silent 10 days against a 7-day cadence.
  {
    professional: { name: "Carlo Reyes", role: "Bookkeeper", location: "MANILA" },
    client: "riverbend",
    dayIndex: 30,
    weeklyRateUsd: 460,
    lastClientFeedbackDaysAgo: 10,
  },
  // A client complaint after the trial, so no escalation, while feedback lapses.
  {
    professional: { name: "Bhavin Kalaria", role: "Paralegal", location: "RAJKOT" },
    client: "tallgrass",
    dayIndex: 260,
    weeklyRateUsd: 590,
    lastClientFeedbackDaysAgo: 31,
    lastClientSentiment: 3,
    issues: [
      {
        key: "wrong-escrow-officer",
        type: "CLIENT_COMPLAINT",
        severity: "MEDIUM",
        reportedBy: "CLIENT",
        reportedDaysAgo: 6,
        summary: "Closing documents sent to the wrong escrow officer",
      },
    ],
  },

  // Green from here down.

  // SPEC: days 1-14.
  {
    professional: { name: "Tejaswini Gokhale", role: "Executive assistant", location: "PUNE" },
    client: "summit-ridge",
    dayIndex: 4,
    weeklyRateUsd: 600,
    lastClientFeedbackDaysAgo: 1,
  },
  // SPEC: days 1-14.
  {
    professional: { name: "Kristine Bautista", role: "Legal assistant", location: "MANILA" },
    client: "oakhurst",
    dayIndex: 12,
    weeklyRateUsd: 490,
    lastClientFeedbackDaysAgo: 2,
    lastClientSentiment: 5,
  },
  // SPEC: issue fixed 50 days ago, all three checks held, now closed.
  {
    professional: { name: "Mrunal Apte", role: "Structural detailer", location: "PUNE" },
    client: "fieldstone",
    dayIndex: 500,
    weeklyRateUsd: 720,
    lastClientFeedbackDaysAgo: 12,
    issues: [
      {
        key: "missed-markups",
        type: "CLIENT_COMPLAINT",
        severity: "MEDIUM",
        reportedBy: "CLIENT",
        reportedDaysAgo: 58,
        summary: "Shop drawings missed the client's markup round",
        fixedDaysAgo: 50,
        outcomes: ["HELD", "HELD", "HELD"],
      },
    ],
  },
  // SPEC: one of the four attendance issues, closed months ago.
  {
    professional: { name: "Parth Sanghani", role: "Dispatcher", location: "RAJKOT" },
    client: "copperline",
    dayIndex: 400,
    weeklyRateUsd: 510,
    lastClientFeedbackDaysAgo: 9,
    lastClientSentiment: 5,
    issues: [
      {
        key: "internet-outage",
        type: "ATTENDANCE",
        severity: "LOW",
        reportedBy: "PROFESSIONAL",
        reportedDaysAgo: 130,
        summary: "Internet outage cost half a shift",
        fixedDaysAgo: 125,
        outcomes: ["HELD", "HELD", "HELD"],
      },
    ],
  },
  // Client check-in 2 days overdue.
  {
    professional: { name: "Angelica Ramos", role: "E-commerce catalog specialist", location: "MANILA" },
    client: "bayview",
    dayIndex: 150,
    weeklyRateUsd: 440,
    lastClientFeedbackDaysAgo: 10,
    clientCheckInOverdueDays: 2,
  },
  // Client feedback due today.
  {
    professional: { name: "Yash Pawar", role: "Revit technician", location: "PUNE" },
    client: "lakeshore",
    dayIndex: 190,
    weeklyRateUsd: 680,
    lastClientFeedbackDaysAgo: 30,
  },
  {
    professional: { name: "Jinal Thakkar", role: "Payroll specialist", location: "RAJKOT" },
    client: "evergreen",
    dayIndex: 50,
    weeklyRateUsd: 530,
    lastClientFeedbackDaysAgo: 6,
  },
  {
    professional: { name: "Nikko Garcia", role: "Social media coordinator", location: "MANILA" },
    client: "crescent-bay",
    dayIndex: 75,
    weeklyRateUsd: 450,
    lastClientFeedbackDaysAgo: 3,
    lastClientSentiment: 5,
  },
  {
    professional: { name: "Rohan Patil", role: "Full-stack developer", location: "PUNE" },
    client: "nimbus",
    dayIndex: 88,
    weeklyRateUsd: 950,
    lastClientFeedbackDaysAgo: 10,
  },
  // One open issue, raised by the professional.
  {
    professional: { name: "Krupa Vyas", role: "Medical records specialist", location: "RAJKOT" },
    client: "silver-creek",
    dayIndex: 600,
    weeklyRateUsd: 500,
    lastClientFeedbackDaysAgo: 7,
    issues: [
      {
        key: "ehr-templates",
        type: "UNDERPERFORMANCE",
        severity: "LOW",
        reportedBy: "PROFESSIONAL",
        reportedDaysAgo: 2,
        summary: "Asked for more training on the new EHR templates",
      },
    ],
  },
  // Feedback a few days past its monthly cadence.
  {
    professional: { name: "Liza Castillo", role: "Property accountant", location: "MANILA" },
    client: "evergreen",
    dayIndex: 700,
    weeklyRateUsd: 560,
    lastClientFeedbackDaysAgo: 33,
  },
  {
    professional: { name: "Aniket Kulkarni", role: "BIM coordinator", location: "PUNE" },
    client: "lakeshore",
    dayIndex: 130,
    weeklyRateUsd: 700,
    lastClientFeedbackDaysAgo: 14,
    lastClientSentiment: 5,
  },
  {
    professional: { name: "Hetal Rajyaguru", role: "Underwriting assistant", location: "RAJKOT" },
    client: "harborview",
    dayIndex: 240,
    weeklyRateUsd: 520,
    lastClientFeedbackDaysAgo: 20,
  },
  {
    professional: { name: "Paolo Mercado", role: "DevOps engineer", location: "MANILA" },
    client: "summit-ridge",
    dayIndex: 420,
    weeklyRateUsd: 900,
    lastClientFeedbackDaysAgo: 5,
    lastClientSentiment: 5,
  },
  {
    professional: { name: "Sneha Joshi", role: "Quantity surveyor", location: "PUNE" },
    client: "meridian",
    dayIndex: 280,
    weeklyRateUsd: 640,
    lastClientFeedbackDaysAgo: 18,
  },
  {
    professional: { name: "Dhruv Kotecha", role: "Order management specialist", location: "RAJKOT" },
    client: "bayview",
    dayIndex: 110,
    weeklyRateUsd: 470,
    lastClientFeedbackDaysAgo: 25,
  },
  {
    professional: { name: "Mark Anthony Cruz", role: "Mechanical estimator", location: "MANILA" },
    client: "sawtooth",
    dayIndex: 160,
    weeklyRateUsd: 610,
    lastClientFeedbackDaysAgo: 11,
  },
  {
    professional: { name: "Riddhi Gajera", role: "Litigation support specialist", location: "RAJKOT" },
    client: "hollis-grant",
    dayIndex: 365,
    weeklyRateUsd: 580,
    lastClientFeedbackDaysAgo: 2,
    lastClientSentiment: 5,
  },
  {
    professional: { name: "Kunal Deshpande", role: "HVAC designer", location: "PUNE" },
    client: "sawtooth",
    dayIndex: 95,
    weeklyRateUsd: 660,
    lastClientFeedbackDaysAgo: 12,
  },
];

// ---------------------------------------------------------------------------
// Days and instants

/** A `date` column value for an Eastern day number. */
function dateOn(day: number): Date {
  return new Date(day * DAY_MS);
}

/**
 * An instant on an Eastern day. Between 15:00 and 18:30 UTC it is the same
 * calendar day in New York under both EST and EDT.
 */
function instantOn(day: number, seed = 0): Date {
  return new Date(day * DAY_MS + (15 * 60 + ((seed * 17) % 180)) * MINUTE_MS);
}

function calendarDay(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

function happenedBy(instant: Date | null, day: number): instant is Date {
  return instant !== null && operationalDay(instant) <= day;
}

// ---------------------------------------------------------------------------
// Building the rows

function contactFor(rule: EscalationRule): EscalationContact {
  const contact = ESCALATION_CONTACTS.find((c) => c.role === ESCALATION_ROUTES[rule]);
  if (!contact) throw new Error(`No demo contact for ${rule}`);
  return contact;
}

function emailFor(client: ClientSpec): string {
  return `${client.contactName.toLowerCase().replace(/[^a-z]+/g, ".")}@${client.emailDomain}`;
}

/**
 * Client feedback ending on the last feedback day, stepping back a little
 * faster than the tightest cadence that could apply, so the history has no
 * silence in it before the silence the placement is meant to show.
 */
function clientFeedbackFor(
  placementId: string,
  startDay: number,
  today: number,
  spec: PlacementSpec,
  seed: number,
): FeedbackEntry[] {
  if (spec.lastClientFeedbackDaysAgo === null) return [];
  const entries: FeedbackEntry[] = [];
  let day = today - spec.lastClientFeedbackDaysAgo;
  for (let n = 0; day > startDay && day >= today - RECORD_HISTORY_DAYS; n++) {
    entries.push({
      id: `${placementId}-client-feedback-${today - day}`,
      placementId,
      party: "CLIENT",
      collectedAt: instantOn(day, seed + n),
      sentiment: n === 0 ? (spec.lastClientSentiment ?? 4) : 4 + ((seed + n) % 2),
      note: null,
    });
    day -= feedbackCadenceDays(day - startDay - 30) - 1 - ((seed + n) % 2);
  }
  return entries;
}

/** Monthly feedback from the professional. Unscheduled, so it never raises an action. */
function professionalFeedbackFor(
  placementId: string,
  startDay: number,
  today: number,
  spec: PlacementSpec,
  seed: number,
): FeedbackEntry[] {
  // No feedback from anyone, for the placement that shows that case.
  if (spec.lastClientFeedbackDaysAgo === null) return [];
  const entries: FeedbackEntry[] = [];
  for (
    let day = today - 3 - (seed % 20);
    day > startDay && day >= today - RECORD_HISTORY_DAYS;
    day -= CHECK_IN_INTERVAL_DAYS
  ) {
    entries.push({
      id: `${placementId}-professional-feedback-${today - day}`,
      placementId,
      party: "PROFESSIONAL",
      collectedAt: instantOn(day, seed + 3),
      sentiment: 4 + (seed % 2),
      note: null,
    });
  }
  return entries;
}

/**
 * Monthly check-ins for one party. Past ones were completed on their due day,
 * except the one the spec marks overdue; the next one is in the future.
 */
function checkInsFor(
  placementId: string,
  party: Party,
  startDay: number,
  today: number,
  overdueDays: number | undefined,
  seed: number,
): CheckIn[] {
  const firstDue = startDay + CHECK_IN_INTERVAL_DAYS;
  const overdueOn = overdueDays === undefined ? null : today - overdueDays;
  if (overdueOn !== null && overdueOn < firstDue) {
    throw new Error(`${placementId} is too new for a check-in ${overdueDays} days overdue`);
  }
  const latestDue =
    overdueOn === null
      ? Math.max(firstDue, today + 1 + (seed % 26))
      : overdueOn + CHECK_IN_INTERVAL_DAYS;

  const checkIns: CheckIn[] = [];
  for (
    let due = latestDue;
    due >= firstDue && due >= today - RECORD_HISTORY_DAYS;
    due -= CHECK_IN_INTERVAL_DAYS
  ) {
    const open = due > today || due === overdueOn;
    checkIns.push({
      id: `${placementId}-check-in-${party.toLowerCase()}-${due - today}`,
      placementId,
      party,
      dueOn: dateOn(due),
      completedAt: open ? null : instantOn(due, seed),
    });
  }
  return checkIns;
}

/** An issue's status on a given day, from its fix and follow-up timestamps. */
function issueStatusOn(
  issue: Pick<Issue, "fixedAt">,
  followUps: readonly IssueFollowUp[],
  day: number,
): IssueStatus {
  if (!happenedBy(issue.fixedAt, day)) return "OPEN";
  const checked = followUps.filter((followUp) => happenedBy(followUp.checkedAt, day));
  if (checked.some((followUp) => followUp.outcome === "REGRESSED")) return "REGRESSED";
  if (checked.length === FOLLOW_UP_OFFSET_DAYS.length) return "CLOSED";
  return "FIXED";
}

function issueFor(
  placementId: string,
  today: number,
  spec: IssueSpec,
  seed: number,
): { issue: Issue; followUps: IssueFollowUp[] } {
  const id = `${placementId}-issue-${spec.key}`;
  const fixedAt = spec.fixedDaysAgo === undefined ? null : instantOn(today - spec.fixedDaysAgo, seed);

  const followUps: IssueFollowUp[] =
    fixedAt === null
      ? []
      : FOLLOW_UP_OFFSET_DAYS.map((offsetDays, i) => {
          const dueAt = new Date(fixedAt.getTime() + offsetDays * DAY_MS);
          const outcome = spec.outcomes?.[i] ?? null;
          if (outcome && operationalDay(dueAt) > today) {
            throw new Error(`${id} has a ${offsetDays}-day result before the check is due`);
          }
          return {
            id: `${id}-follow-up-${offsetDays}`,
            issueId: id,
            offsetDays,
            dueAt,
            checkedAt: outcome ? new Date(dueAt.getTime() + 30 * MINUTE_MS) : null,
            outcome,
          };
        });

  const issue: Issue = {
    id,
    placementId,
    type: spec.type,
    severity: spec.severity,
    reportedAt: instantOn(today - spec.reportedDaysAgo, seed + 1),
    reportedBy: spec.reportedBy,
    summary: spec.summary,
    status: "OPEN",
    fixedAt,
  };
  return { issue: { ...issue, status: issueStatusOn(issue, followUps, today) }, followUps };
}

function baseDataFor(today: number): Omit<DemoDataset, "healthSnapshots"> {
  const data: Omit<DemoDataset, "healthSnapshots"> = {
    escalationContacts: [...ESCALATION_CONTACTS],
    clients: [],
    professionals: [],
    placements: [],
    feedbackEntries: [],
    issues: [],
    issueFollowUps: [],
    checkIns: [],
    escalations: [],
  };
  const firstStartByClient = new Map<string, number>();

  PLACEMENTS.forEach((spec, index) => {
    const number = String(index + 1).padStart(2, "0");
    const placementId = `demo-placement-${number}`;
    const professionalId = `demo-professional-${number}`;
    const startDay = today - spec.dayIndex;
    if (!CLIENTS.some((client) => client.key === spec.client)) {
      throw new Error(`${placementId} names an unknown client, ${spec.client}`);
    }
    firstStartByClient.set(spec.client, Math.min(firstStartByClient.get(spec.client) ?? startDay, startDay));

    data.professionals.push({
      id: professionalId,
      name: spec.professional.name,
      role: spec.professional.role,
      location: spec.professional.location,
      joinedF5At: dateOn(startDay - 15),
    });
    data.placements.push({
      id: placementId,
      clientId: `demo-client-${spec.client}`,
      professionalId,
      startDate: dateOn(startDay),
      endDate: null,
      status: "ACTIVE",
      weeklyRateUsd: spec.weeklyRateUsd,
    });
    data.feedbackEntries.push(
      ...clientFeedbackFor(placementId, startDay, today, spec, index),
      ...professionalFeedbackFor(placementId, startDay, today, spec, index),
    );
    data.checkIns.push(
      ...checkInsFor(placementId, "CLIENT", startDay, today, spec.clientCheckInOverdueDays, index * 7),
      ...checkInsFor(placementId, "PROFESSIONAL", startDay, today, spec.professionalCheckInOverdueDays, index * 11 + 5),
    );
    for (const issueSpec of spec.issues ?? []) {
      const { issue, followUps } = issueFor(placementId, today, issueSpec, index);
      data.issues.push(issue);
      data.issueFollowUps.push(...followUps);
    }
    for (const escalation of spec.escalations ?? []) {
      data.escalations.push({
        id: `${placementId}-escalation-${escalation.rule.toLowerCase()}`,
        placementId,
        issueId: escalation.issueKey ? `${placementId}-issue-${escalation.issueKey}` : null,
        rule: escalation.rule,
        contactId: contactFor(escalation.rule).id,
        reason: escalation.reason,
        escalatedAt: instantOn(today - escalation.escalatedDaysAgo, index),
      });
    }
  });

  data.clients = CLIENTS.map((client) => ({
    id: `demo-client-${client.key}`,
    name: client.name,
    industry: client.industry,
    timezone: client.timezone,
    contactName: client.contactName,
    contactEmail: emailFor(client),
    startedWithF5At: dateOn((firstStartByClient.get(client.key) ?? today) - 20),
  }));

  return data;
}

// ---------------------------------------------------------------------------
// The data as it stood on a day

type PlacementRecord = {
  placement: DemoPlacement;
  client: Client;
  professional: Professional;
  feedbackEntries: FeedbackEntry[];
  issues: Issue[];
  followUps: IssueFollowUp[];
  checkIns: CheckIn[];
  escalations: Escalation[];
};

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

function recordsFrom(data: Omit<DemoDataset, "healthSnapshots">): PlacementRecord[] {
  const clients = new Map(data.clients.map((client) => [client.id, client]));
  const professionals = new Map(data.professionals.map((professional) => [professional.id, professional]));
  const feedback = groupBy(data.feedbackEntries, (entry) => entry.placementId);
  const issues = groupBy(data.issues, (issue) => issue.placementId);
  const followUps = groupBy(data.issueFollowUps, (followUp) => followUp.issueId);
  const checkIns = groupBy(data.checkIns, (checkIn) => checkIn.placementId);
  const escalations = groupBy(data.escalations, (escalation) => escalation.placementId);

  return data.placements.map((placement) => {
    const client = clients.get(placement.clientId);
    const professional = professionals.get(placement.professionalId);
    if (!client || !professional) throw new Error(`${placement.id} references a missing row`);
    const placementIssues = issues.get(placement.id) ?? [];
    return {
      placement,
      client,
      professional,
      feedbackEntries: feedback.get(placement.id) ?? [],
      issues: placementIssues,
      followUps: placementIssues.flatMap((issue) => followUps.get(issue.id) ?? []),
      checkIns: checkIns.get(placement.id) ?? [],
      escalations: escalations.get(placement.id) ?? [],
    };
  });
}

/** One placement as it stood at the end of an Eastern day, ready to score. */
function placementOn(
  record: PlacementRecord,
  day: number,
  healthSnapshots: readonly HealthSnapshot[],
): ScoringPlacement {
  return {
    id: record.placement.id,
    status: record.placement.status,
    startDate: record.placement.startDate,
    client: record.client,
    professional: record.professional,
    feedbackEntries: record.feedbackEntries.filter((entry) => happenedBy(entry.collectedAt, day)),
    issues: record.issues
      .filter((issue) => happenedBy(issue.reportedAt, day))
      .map((issue) => {
        const followUps = record.followUps.filter((followUp) => followUp.issueId === issue.id);
        return {
          ...issue,
          status: issueStatusOn(issue, followUps, day),
          followUps: happenedBy(issue.fixedAt, day)
            ? followUps.map((followUp) =>
                happenedBy(followUp.checkedAt, day)
                  ? followUp
                  : { ...followUp, checkedAt: null, outcome: null },
              )
            : [],
        };
      }),
    checkIns: record.checkIns.map((checkIn) =>
      checkIn.completedAt && !happenedBy(checkIn.completedAt, day)
        ? { ...checkIn, completedAt: null }
        : checkIn,
    ),
    escalations: record.escalations.filter((escalation) => happenedBy(escalation.escalatedAt, day)),
    healthSnapshots,
  };
}

/** Replays the engine over the days before today, feeding each day's result into the next. */
function replayHealth(records: readonly PlacementRecord[], today: number): HealthSnapshot[] {
  const history = new Map<string, HealthSnapshot[]>();
  const snapshots: HealthSnapshot[] = [];

  for (let day = today - HEALTH_HISTORY_DAYS; day < today; day++) {
    for (const record of records) {
      const { placement } = record;
      if (day < calendarDay(placement.startDate)) continue;

      const earlier = history.get(placement.id) ?? [];
      const result = scorePlacement(placementOn(record, day, earlier), {
        referenceDate: instantOn(day),
        contacts: ESCALATION_CONTACTS,
      });
      const snapshot: HealthSnapshot = {
        id: `${placement.id}-health-${today - day}`,
        placementId: placement.id,
        day: dateOn(day),
        status: result.health,
        score: result.score,
      };
      history.set(placement.id, [...earlier, snapshot]);
      snapshots.push(snapshot);
    }
  }
  return snapshots;
}

// ---------------------------------------------------------------------------

/** The demo data set, dated from the Eastern day of the reference date. */
export function buildDemoData(referenceDate: Date): DemoDataset {
  const today = operationalDay(referenceDate);
  const base = baseDataFor(today);
  return { ...base, healthSnapshots: replayHealth(recordsFrom(base), today) };
}

/** The demo placements as they stood at the end of an Eastern day, ready to score. */
export function demoPlacementsOn(data: DemoDataset, day: number): ScoringPlacement[] {
  const snapshots = groupBy(data.healthSnapshots, (snapshot) => snapshot.placementId);
  return recordsFrom(data).map((record) =>
    placementOn(
      record,
      day,
      (snapshots.get(record.placement.id) ?? []).filter((snapshot) => calendarDay(snapshot.day) < day),
    ),
  );
}
