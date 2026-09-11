# Callsheet — Build Spec

Working name: **Callsheet**. Rename freely; the name is not load-bearing.

## The one job

A client success manager at F5 opens this at 9am and knows, within five
seconds and without scrolling, who to call today and why.

Everything in this spec exists to serve that sentence. If a feature does not
make the first screen better, it does not ship.

## Who uses it

One person. They manage every active placement F5 has — dozens at once,
across US clients and professionals in Pune, Rajkot and Manila. They are
not an admin, not a recruiter. They are the single point of contact keeping
clients happy and professionals performing.

They are on a phone as often as a laptop, often between calls.

## The problem in their words

- Placements have a trial period. Early weeks need more attention than
  month six.
- Client feedback is the health signal. Silence is the danger — unhappy
  clients go quiet before they leave, so feedback gets collected on a
  schedule, not when someone remembers.
- Problems arrive from both sides: client complaints, underperformance,
  attendance.
- A problem is not done when it is fixed. It is done when it stays fixed.
- Some problems this person handles. Some must go to someone senior. The
  tool has to know which.
- Routine monthly check-ins with every client and every professional sit
  underneath all of it.

---

## Domain model

Prisma + Postgres (Neon). Repository pattern — all queries live in
`packages/db/repositories/*.repository.ts`. No inline Prisma in route
handlers or components.

### Time

"Today" is the US Eastern business day. All timestamps are stored in UTC
(`timestamptz`); the operational day is derived by converting the reference
instant to America/New_York. Calendar dates (`startDate`, `endDate`, `dueOn`,
snapshot days) are stored as `date` and mean a day in America/New_York. Every
day count in scoring — `dayIndex`, days since feedback, days overdue — is a
difference between Eastern calendar days.

Why Eastern and not IST: the CSM works overnight IST to cover US business
hours. An IST-keyed list would roll over at midnight IST, in the middle of the
shift, and reorder the list under them.

### Client
`id, name, industry, timezone, contactName, contactEmail, startedWithF5At`

Industries come from F5's own site: Construction, Architecture &
Engineering, Healthcare, Insurance, SaaS & Startups, Back-Office
Operations, E-Commerce & Retail, Legal & Professional Services.

### Professional
`id, name, role, location (PUNE | RAJKOT | MANILA), joinedF5At`

### Placement
`id, clientId, professionalId, startDate, endDate?, status (ACTIVE | ENDED | REPLACED), weeklyRateUsd`

Derived, not stored:
- `dayIndex` = days since `startDate`
- `inTrial` = `dayIndex <= 90`
- `feedbackCadenceDays` = 7 if `dayIndex <= 30`, 14 if `<= 90`, else 30

The 90-day trial comes from F5's own public claim that 98% of placed
professionals remain past the first 90 days. Using their number rather than
inventing one is deliberate — say so in the walkthrough.

### FeedbackEntry
`id, placementId, party (CLIENT | PROFESSIONAL), collectedAt, sentiment (1-5), note?`

### Issue
`id, placementId, type (CLIENT_COMPLAINT | UNDERPERFORMANCE | ATTENDANCE | REPLACEMENT_REQUEST), severity (LOW | MEDIUM | HIGH), reportedAt, reportedBy (CLIENT | PROFESSIONAL | F5), summary, status (OPEN | FIXED | CLOSED | REGRESSED), fixedAt?`

`FIXED` means a fix was applied. `CLOSED` means all follow-up windows
confirmed it held. This distinction is the whole point of the issue model —
do not collapse the two.

`REPLACEMENT_REQUEST` records a client asking for a different professional,
so escalation rule 5 has a field to read. Talking the client round is a fix
like any other, and the follow-up windows confirm it held.

Escalation state is not stored on the issue. Rule 4 has no issue to hang it
on, and rule 6 can escalate an issue that was already escalated for another
reason. See `Escalation` below.

### IssueFollowUp
`id, issueId, offsetDays (7 | 21 | 45), dueAt, checkedAt?, outcome (HELD | REGRESSED)?`

Created automatically when an issue moves to `FIXED`, dated from `fixedAt`.
A `REGRESSED` outcome flips the parent issue back to `REGRESSED` status and
triggers escalation.

### CheckIn
`id, placementId, party (CLIENT | PROFESSIONAL), dueOn, completedAt?`

Monthly, tracked separately per party.

### EscalationContact
`id, name, role (ACCOUNT_DIRECTOR | DELIVERY_MANAGER)`

One person per role. Escalations route by problem type to a role, and the
role names the person, so every escalation row can say who it goes to.

### Escalation
`id, placementId, issueId?, rule, contactId, reason, escalatedAt`

Written when the CSM hands an escalation on. A tripped rule is pending until
an escalation exists for the same rule, and the same issue for rules about
one issue, dated on or after the day the rule tripped. A rule that trips
again later — a new open issue, a new red streak, a second regression — is
pending again.

### HealthSnapshot
`id, placementId, day, status (RED | AMBER | GREEN), score`

One row per placement per Eastern day. Rule 4 needs health history, and
current issue status cannot reconstruct what health was a week ago. The Today
query records the day's row after the response is sent: rule 4 reads only
yesterday and earlier, so today's row cannot change today's score, and the
list does not wait on a write.

There is no log of calls made. Every action on the Today list changes the
record behind it — feedback, a follow-up outcome, a completed check-in, an
escalation — and that change is what clears the row.

---

## The scoring engine

This is the part being graded. It lives in one pure, testable module —
`lib/scoring.ts`, no database access, takes a hydrated placement and a
reference date, returns actions with scores and human-readable reasons.

Today's list is a list of **actions**, not placements. One placement can
produce two actions; that is correct and expected.

### Action types

| Type | Fires when |
|---|---|
| `ESCALATION` | An escalation rule trips and has not yet been escalated (see `Escalation`) |
| `SILENCE` | Days since last client feedback exceeds cadence |
| `ISSUE_FOLLOWUP` | A follow-up window is due or overdue |
| `FEEDBACK_DUE` | Scheduled feedback collection is due |
| `NEW_PLACEMENT` | Placement is in days 1-14 and has no feedback yet |
| `CHECKIN_DUE` | Monthly check-in is due today or overdue |

### Points

Additive. Clamp the total at 100.

```
Trial weighting (applies to every action on that placement)
  day 1-14    +30
  day 15-45   +20
  day 46-90   +10
  day 91+      +0

Silence (ratio = daysSinceClientFeedback / feedbackCadenceDays)
  ratio >= 2.0  +50
  ratio >= 1.5  +40
  ratio >= 1.0  +20

Open issues
  +25 each, capped at +50

Issue follow-up
  due today or overdue        +20
  overdue by more than 3 days +35

Escalation pending
  +60

Last client sentiment <= 2
  +25

Monthly check-in
  due today                  +0
  overdue                   +10
  overdue by 7+ days        +20
```

The weights are a judgement call, not a science. What matters is that
silence outranks a single bad rating, and that escalation always floats to
the top. Be ready to defend both in the walkthrough: a client who tells you
they are unhappy is still talking to you; a client who has gone quiet for
three cadence periods may already be drafting the email.

Silence was +30 at 1.5 and +15 at 1.0. At those numbers a post-trial
placement silent 45 days scored 30 and read green. At +40 and +20, one and a
half cadence periods of silence reads amber on its own.

### Health status

Per placement, not per action.

- **RED** — score >= 70, or escalation pending, or silence ratio >= 2.0
- **AMBER** — score 35-69
- **GREEN** — below 35

### Escalation rules

Any one of these flags the placement for someone senior. Each carries a
plain-English reason that renders in the UI — no bare booleans — and is
stored as `Escalation.reason` when the CSM hands it on.

1. Two or more open issues on one placement
2. Any `CLIENT_COMPLAINT` raised while the placement is in trial
3. A second `ATTENDANCE` issue within 30 days of the first
4. Health RED for seven consecutive days
5. Client requests replacement
6. Any follow-up returning `REGRESSED`

Everything else the CSM handles alone. The tool should say which, explicitly,
on the row.

### Escalation routing

Escalations route by problem type, not to one person. Each rule goes to a
role, and the role's `EscalationContact` is the person named on the row.

| Rule | Goes to |
|---|---|
| 1. Two or more open issues | Account Director |
| 2. Client complaint in trial | Account Director |
| 3. Repeat attendance issue within 30 days | Delivery Manager |
| 4. Health red 7+ days | Account Director |
| 5. Replacement request | Account Director |
| 6. Regressed follow-up | Delivery Manager |

The map lives in `lib/escalation-routes.ts`.

### Reason sentences

Every reason is built only from fields in the model and uses no pronouns:
the model has no field that could supply one. No reason names the
professional, who is the heading of the row. A call to the client names the
client contact ("Monthly check-in with Dana Whitfield is due today"); a call
to the professional drops the name ("Monthly check-in is due Friday").
Escalation reasons say only what happened ("2 issues are open on this
placement") and leave the owner to the row's fourth line ("Two or more open
issues — needs Nandini Rao.").

### Scoring decisions

The rules above leave gaps. These are the readings `lib/scoring.ts`
implements, each with its reason.

1. **An action's score and a placement's score are different sums.** Trial
   weighting, open issues and a low last rating have no action of their own,
   so they apply to every action on the placement; each action then adds
   only its own points (silence, follow-up, escalation or check-in). The
   placement score counts every component once and decides health. Both
   clamp at 100. *Why:* otherwise open issues and a bad rating could never
   move the list.

2. **Bands within a category are exclusive; categories add.** In silence,
   follow-ups and check-ins only the highest band counts — four days overdue
   is +35, not +55. Each due follow-up and each check-in that is due or
   overdue is its own action, but the placement score counts only the worst
   of each. *Why:* two rows can each need a call, but one bad week should not
   count twice toward health.

3. **`dayIndex` is the day in the trial bands.** The start date is day 0 and
   takes the day 1-14 weight. `NEW_PLACEMENT` starts on day 1, as written.
   *Why:* `inTrial` and the cadence are already defined on `dayIndex`; a
   second numbering would disagree with them at every boundary.

4. **Client feedback raises at most one action, and it carries the silence
   points.** On days 1-14 with no client feedback it is `NEW_PLACEMENT`;
   otherwise `SILENCE` once the days since feedback exceed the cadence;
   otherwise `FEEDBACK_DUE` on the day the cadence runs out. With no client
   feedback ever, silence counts from the start date. The cadence is judged
   at today's `dayIndex`. Professional feedback is logged but not scheduled.
   *Why:* all three mean "call the client for feedback", and three rows for
   one call is noise.

5. **What counts.** Open means `OPEN` or `REGRESSED`. Follow-up windows fire
   only on `FIXED` issues. Rules 2, 3 and 5 trip until the issue is
   `CLOSED`, so a trial complaint fixed the same day still reaches the
   account director. Rule 3 compares consecutive attendance issues on the
   same placement, 30 days inclusive. A check-in becomes an action on its
   due day and adds no points until it is late; its row carries no severity
   rule. *Why:* fixed is not done — the issue model exists to say so — and a
   check-in due today is a call to make today, even though it is not late.

6. **A regressed follow-up reopens its issue in scoring.** A `FIXED` issue
   with a `REGRESSED` follow-up is scored as `REGRESSED`: open, no further
   follow-up rows, rule 6 pending. The repository flips the status column in
   the same transaction, but the engine does not depend on that. *Why:* the
   acceptance test is that a regression reopens and escalates; it should not
   hinge on a second write having landed.

7. **Escalation floats by group, not by score.** An escalation on a quiet
   post-trial placement scores 60, and a silent in-trial placement can
   outscore it. The Escalate now group keeps escalations on top; within
   equal scores, escalation sorts first. *Why:* inflating escalation points
   to guarantee the top spot would drown the other components in the
   placement score.

8. **Who the call is to.** Escalations go to the contact holding the rule's
   role, or the role if nobody holds it; the row's fourth line names them and
   the reason says only what happened. Feedback and silence go to the client
   contact. Check-ins go to whichever party is due. Follow-ups go to the
   professional if the professional reported the issue, otherwise the client
   contact. The client contact is named in full; a call to the professional
   drops the name, because the professional is the row's heading. No
   pronouns. *Why:* a row that does not say who to ring is a to-do, not a
   call, and a row that says the same name twice is noise.

9. **What is coming up.** Alongside today's actions the engine lists what
   falls due from tomorrow to 45 days out, if nothing is done first: client
   feedback (the first day the silence reaches the cadence, judged at that
   day's `dayIndex`), unchecked follow-up windows on fixed issues, and
   uncompleted check-ins. "Later this week" shows the next six days, so a
   weekday name always means one date; beyond that an item gives the date.
   "Next up" on the clear state is the soonest item, so it never says
   "today". *Why:* "You're clear today" must never be a blank screen, and
   the collapsed group has to come from the same rules as the list above it.

---

## Screens

Five at most; four are used. Logging happens on the row itself, not on a
screen of its own.

### `/` — Today
The default and the whole product. Three groups, in order, each with a quiet
label and its count:

1. **Escalate now** — the same quiet label as the other groups. Severity is
   carried by each row's 3px alert rule and a fourth line naming the rule
   that tripped and who it goes to
2. **Call today** — the working list
3. **Later this week** — collapsed by default, so the top of the screen stays
   honest

Each row follows the Today row in `DESIGN.md`: professional name, a context
line (client, then where the placement sits in its life), the reason as a
sentence (see "Reason sentences"), and one action. No reason chips; days
since contact live inside the reason sentence. Not a table. Rows, readable at
arm's length.

A slim top bar carries only the date. No summary stat — the counts live on
the group labels. Nothing else above the fold.

Escalation rows carry the 3px alert rule. Call today rows carry the 2px watch
rule when their placement is red or amber, and no rule when it is green; a
check-in due today carries no rule whatever the placement's health. Later
this week rows carry none. A group with nothing in it is not shown. The page
renders per request, so the date and the list are always today's.

### Logging from a row
Each row's one action works in place. The moment it is logged the row
collapses out and its group count drops. The server then re-reads and
re-scores only that placement and sends its rows back, and the list swaps
them in without a reload — the other placements have not changed, so the
Today query is not run again. Reset and load demo data change everything, so
they render the whole page again.

- **Log feedback** — tap it, then tap a rating from 1 to 5. Two taps. It is
  recorded as the client's feedback. This is the most frequent action in the
  product; treat it that way.
- **Log follow-up** — tap it, then "Still holding" or "Came back". Came back
  reopens the issue and escalates it.
- **Log check-in** — one tap.
- **Mark escalated** — one tap. The server scores the placement again and
  records the engine's reason and owner.

### `/placements` — List
Filter by health, location, trial status. Search by name. Mobile: cards.

### `/placements/[id]` — Detail
A timeline of everything on that placement: feedback, issues, follow-ups,
check-ins, escalations. Newest first. Health and score at the top with the
score's components itemised, so the number is never a black box.

### `/issues` — Open issues
Grouped by status, follow-up windows visible with their due dates. This is
where "fixed but not yet confirmed" lives.

---

## Non-negotiables

**Five seconds.** `/` is server-rendered with data. No client-side fetch on
first paint, no spinner on the primary list, no auth wall, no splash. The
list is in the HTML.

**Phone.** Test on a real phone, not a resized browser. Single column,
44px minimum tap targets, sticky group header, thumb-reachable actions. The
Today row must be legible without zoom.

**Empty, loading, error.** They said they are grading this.
- Empty (no placements) — explain what the tool is, offer to load demo data
- Empty (nothing due) — "You're clear today", plus the next thing coming due
  and when. Never a blank screen.
- Loading — none on first paint, and no skeleton. `/` is server-rendered with
  its data, so there is no first-paint fetch for a skeleton to stand in for.
- Error — what failed, a retry, and the last successful load's timestamp

**Demo data reset.** A visible control that reseeds. Graders will click
things; let them get back.

**Light mode.** Dark first, because the shift is overnight. Light follows
`prefers-color-scheme` with the same token names:

| Token | Dark | Light |
|---|---|---|
| ink | `#12171F` | `#FAFAFB` |
| slate | `#1B222C` | `#F1F3F5` |
| line | `#2A323E` | `#DDE1E6` |
| chalk | `#E8EAED` | `#151A21` |
| mute | `#8A93A0` | `#5C6672` |
| alert | `#FF5C4D` | `#C8342A` |
| watch | `#F2B441` | `#A6720C` |
| steady | `#4FB477` | `#2E7D51` |

---

## Sample data

Around 32 active placements, 24 clients. Realistic, not uniform. Build the
seed to guarantee these cases exist:

- 3 placements in days 1-14, one with zero feedback logged
- 1 post-trial placement silent for 45 days against a 30-day cadence — amber, not red, and that is the interesting case
- 1 placement silent 68 days — red
- 2 placements tripping different escalation rules
- 1 issue fixed 22 days ago whose 21-day follow-up came back REGRESSED
- 1 issue fixed 50 days ago, all three windows HELD, now closed
- 4 attendance issues, two of them a repeat pair inside 30 days
- Roughly 60% green, so the red rows actually mean something
- Escalation contacts for both roles
- 90 days of `HealthSnapshot` history, so rule 4 fires on at least one placement

The seed is `lib/demo-data.ts`, run by `pnpm db:seed` and by the reset
control. It is safe to rerun: one transaction deletes every row in every
table and inserts the demo set, dated from the Eastern day it runs, so the
situations never drift. Health history is not written by hand — the scoring
engine is replayed over each of the 90 days against the data as it stood that
day, so history cannot contradict today.

Names should be plausible for Pune, Rajkot and Manila. US client names
invented, no real F5 clients — the brief says invent your own data.

---

## Stack

- Next.js App Router, TypeScript strict
- Tailwind
- Prisma + Neon Postgres
- Vercel
- pnpm workspace

Deploy an empty shell on day one so the URL exists and build problems
surface early, not at hour 70.

---

## Acceptance criteria

- [ ] Cold load of `/` on 4G shows a populated list under five seconds
- [ ] Every row states its reason in plain English, with no pronouns
- [ ] Escalation rows say which rule tripped and who it goes to
- [ ] Logging from a row removes it and updates the group count without reload
- [ ] Placement detail itemises the score
- [ ] A regressed follow-up reopens its issue and escalates
- [ ] Both empty states and the error state are reachable and deliberate; there is no loading state on first paint
- [ ] Usable one-handed on a phone
- [ ] `pnpm typecheck` green across the workspace
- [ ] No login on any graded URL
