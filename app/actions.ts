"use server";

import {
  checkInRepository,
  escalationContactRepository,
  escalationRepository,
  feedbackRepository,
  healthSnapshotRepository,
  issueRepository,
  placementRepository,
  type HydratedPlacement,
} from "@callsheet/db";
import type { EscalationRule } from "@callsheet/db/types";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { describeError } from "@/lib/describe-error";
import { ESCALATION_ROUTES } from "@/lib/escalation-routes";
import { resetDemoData } from "@/lib/reset-demo-data";
import { operationalDay, roleLabel, scorePlacement, type ScoringContact } from "@/lib/scoring";
import { timed, timingNote } from "@/lib/server-timing";
import { emptyPlacementRows, placementRows, type PlacementRows } from "@/lib/today-view";

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * A row action returns the touched placement's rows, for the list to swap in,
 * a sentence saying what was recorded, and when the rows were read, so the
 * newest read wins if two answers for one placement cross.
 */
export type RowActionResult =
  | { ok: true; rows: PlacementRows; confirmation: string; readAt: number }
  | { ok: false; message: string };

/** A failure the person can act on. Its message is shown as written. */
class ActionError extends Error {}

const SAVE_FAILED = "Couldn't save that. Check the connection and try again.";
const SAVED_NOT_SHOWN = "Saved, but the list couldn't refresh. Reload to see it.";
const DAY_MS = 86_400_000;

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function failed(label: string, error: unknown, message: string): { ok: false; message: string } {
  if (error instanceof ActionError) return { ok: false, message: error.message };
  console.error(`${label} failed: ${describeError(error)}`);
  return { ok: false, message };
}

/**
 * Scores the one placement a row action touched and returns its rows. The
 * rest of the list is unchanged, so the Today query is not re-run for every
 * placement. That placement's health snapshot is recorded after the response.
 */
function rowsFor(
  placementId: string,
  placement: HydratedPlacement | null,
  contacts: readonly ScoringContact[],
  referenceDate: Date,
): PlacementRows {
  if (!placement || placement.status !== "ACTIVE") return emptyPlacementRows(placementId);
  const score = scorePlacement(placement, { referenceDate, contacts });
  after(async () => {
    try {
      await timed("action: deferred snapshot write", () =>
        healthSnapshotRepository.record({
          placementId,
          day: new Date(operationalDay(referenceDate) * DAY_MS),
          status: score.health,
          score: score.score,
        }),
      );
    } catch (error) {
      console.error(`Recording a health snapshot failed: ${describeError(error)}`);
    }
  });
  return placementRows(placement, score);
}

/**
 * Writes, then re-reads just the touched placement. `write` returns that
 * placement's id; `confirmation` says what was recorded.
 */
async function rowAction(
  label: string,
  write: () => Promise<string>,
  confirmation: (placement: HydratedPlacement | null) => string,
): Promise<RowActionResult> {
  timingNote(`action: ${label} started`);
  // The contacts do not depend on the write, so fetch them alongside it.
  const contacts = escalationContactRepository.list();
  contacts.catch(() => undefined);

  let placementId: string;
  try {
    placementId = await timed(`action: ${label}: write`, write);
  } catch (error) {
    return failed(label, error, SAVE_FAILED);
  }

  try {
    const readAt = Date.now();
    const [placement, loadedContacts] = await timed(`action: ${label}: re-read placement`, () =>
      Promise.all([placementRepository.findHydratedById(placementId), contacts]),
    );
    return {
      ok: true,
      rows: rowsFor(placementId, placement, loadedContacts, new Date()),
      confirmation: confirmation(placement),
      readAt,
    };
  } catch (error) {
    return failed(`${label} (refresh)`, error, SAVED_NOT_SHOWN);
  }
}

export async function logFeedback(placementId: string, sentiment: number): Promise<RowActionResult> {
  if (!isId(placementId) || !Number.isInteger(sentiment) || sentiment < 1 || sentiment > 5) {
    return { ok: false, message: "Pick a rating from 1 to 5." };
  }
  return rowAction(
    "Logging feedback",
    async () => {
      const entry = await feedbackRepository.log({ placementId, party: "CLIENT", sentiment, collectedAt: new Date() });
      return entry.placementId;
    },
    (placement) =>
      placement ? `Rated ${sentiment}. Logged for ${placement.professional.name}.` : `Rated ${sentiment}.`,
  );
}

export async function logFollowUp(followUpId: string, outcome: "HELD" | "REGRESSED"): Promise<RowActionResult> {
  if (!isId(followUpId) || (outcome !== "HELD" && outcome !== "REGRESSED")) {
    return { ok: false, message: "Say whether the fix is holding." };
  }
  return rowAction(
    "Logging a follow-up",
    async () => {
      const followUp = await issueRepository.recordFollowUpOutcome(followUpId, outcome, new Date());
      return followUp.issue.placementId;
    },
    () => (outcome === "HELD" ? "Follow-up recorded — still holding." : "Follow-up recorded — came back."),
  );
}

export async function logCheckIn(checkInId: string): Promise<RowActionResult> {
  if (!isId(checkInId)) return { ok: false, message: SAVE_FAILED };
  return rowAction(
    "Logging a check-in",
    async () => {
      const checkIn = await checkInRepository.complete(checkInId, new Date());
      return checkIn.placementId;
    },
    () => "Check-in logged.",
  );
}

/**
 * Records that an escalation was handed on. The placement is scored here, so
 * the reason and contact recorded are the engine's, not whatever the browser
 * sent, and an escalation handled elsewhere is not recorded twice. The new
 * escalation is the only change, so the placement is re-scored from the rows
 * already loaded rather than read again.
 */
export async function markEscalated(
  placementId: string,
  rule: EscalationRule,
  issueId: string | null,
): Promise<RowActionResult> {
  if (!isId(placementId) || !Object.hasOwn(ESCALATION_ROUTES, rule) || (issueId !== null && !isId(issueId))) {
    return { ok: false, message: SAVE_FAILED };
  }
  const label = "Marking an escalation";
  timingNote(`action: ${label} started`);

  try {
    const readAt = Date.now();
    const [placement, contacts] = await timed(`action: ${label}: read placement`, () =>
      Promise.all([placementRepository.findHydratedById(placementId), escalationContactRepository.list()]),
    );
    if (!placement) throw new ActionError("That placement no longer exists. Reload to see the current list.");

    const now = new Date();
    const pending = scorePlacement(placement, { referenceDate: now, contacts }).actions.find(
      (action) => action.escalation?.rule === rule && action.issueId === issueId,
    );
    if (!pending?.escalation) {
      return {
        ok: true,
        rows: rowsFor(placementId, placement, contacts, now),
        confirmation: "Already escalated.",
        readAt,
      };
    }

    const { contact, role } = pending.escalation;
    if (!contact) {
      throw new ActionError(`Nobody holds the ${roleLabel(role)} role yet, so this has nobody to go to.`);
    }
    const escalation = await timed(`action: ${label}: write`, () =>
      escalationRepository.record({
        placementId,
        issueId,
        rule,
        contactId: contact.id,
        reason: pending.reason,
        escalatedAt: now,
      }),
    );
    return {
      ok: true,
      rows: rowsFor(placementId, { ...placement, escalations: [...placement.escalations, escalation] }, contacts, now),
      confirmation: `Escalated to ${contact.name}.`,
      readAt,
    };
  } catch (error) {
    return failed(label, error, SAVE_FAILED);
  }
}

/** Replaces everything, so the whole page is rendered again. */
export async function resetDemo(): Promise<ActionResult> {
  timingNote("action: Resetting demo data started");
  try {
    await resetDemoData(new Date());
  } catch (error) {
    return failed("Resetting demo data", error, "Couldn't reset the demo data. Check the connection and try again.");
  }
  revalidatePath("/");
  return { ok: true };
}
