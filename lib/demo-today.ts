import type { TodayRowData } from "@/lib/today";

// Invented data. Fixed date so the day counts below stay true; scoring will
// take the reference date as an input the same way.
export const REFERENCE_DATE = new Date("2026-09-10T00:00:00Z");

export const escalateNow: TodayRowData[] = [
  {
    id: "ketan-parmar",
    professional: "Ketan Parmar",
    context: "Brightwater Dental Group, 5 months in",
    reason: "Missed Tuesday's shift without notice, 12 days after the last one.",
    action: "Mark escalated",
    severity: "alert",
    escalation: {
      rule: "Second attendance issue in 30 days",
      owner: "Nandini",
    },
  },
  {
    id: "maricel-dizon",
    professional: "Maricel Dizon",
    context: "Redfern Insurance Partners, day 23 of trial",
    reason:
      "The client says claim notes keep coming back incomplete and wants to talk this week.",
    action: "Mark escalated",
    severity: "alert",
    escalation: {
      rule: "Client complaint during the trial",
      owner: "Nandini",
    },
  },
];

export const callToday: TodayRowData[] = [
  {
    id: "aniket-kulkarni",
    professional: "Aniket Kulkarni",
    context: "Lakeshore Architecture Studio, day 52 of trial",
    reason: "No client feedback in 22 days, and it's due every two weeks.",
    action: "Log feedback",
    severity: "watch",
  },
  {
    id: "jasmine-villanueva",
    professional: "Jasmine Villanueva",
    context: "Northfield Pediatrics, day 9 of trial",
    reason: "No client feedback since the placement started.",
    action: "Log feedback",
    severity: "watch",
  },
  {
    id: "harshil-vora",
    professional: "Harshil Vora",
    context: "Pinecrest Supply Co., 8 months in",
    reason: "Invoice backlog was fixed a week ago. Check it's still holding.",
    action: "Log follow-up",
    severity: "routine",
  },
  {
    id: "paolo-mercado",
    professional: "Paolo Mercado",
    context: "Summit Ridge Software, 14 months in",
    reason: "Monthly check-in with Dana Whitfield is 4 days overdue.",
    action: "Log check-in",
    severity: "routine",
  },
];

export const laterThisWeek: TodayRowData[] = [
  {
    id: "sneha-joshi",
    professional: "Sneha Joshi",
    context: "Granite Peak Builders, day 34 of trial",
    reason: "Client feedback is due Friday, two weeks after the last round.",
    action: "Log feedback",
    severity: "routine",
  },
  {
    id: "kristine-bautista",
    professional: "Kristine Bautista",
    context: "Oakhurst Legal Group, 11 months in",
    reason: "Monthly check-in with Kristine is due Friday.",
    action: "Log check-in",
    severity: "routine",
  },
  {
    id: "dhruv-kotecha",
    professional: "Dhruv Kotecha",
    context: "Bayview Home Goods, day 71 of trial",
    reason: "The order-entry fix reaches its 21-day check on Saturday.",
    action: "Log follow-up",
    severity: "routine",
  },
];
