# Callsheet

A client success tool that answers one question: **who do I call today, and why?**

Live: **https://f5.magmaai.io**

Built for one person — a client success manager responsible for every active
placement at once, across US clients and remote professionals in India and
the Philippines. They open this between calls, often on a phone. Everything
in the product serves that one sentence; anything that made the first screen
slower or busier was cut.

All data is invented. No real client or professional appears anywhere.

---

## Running it

```bash
pnpm install
# DATABASE_URL in .env.local at the repo root (Neon Postgres)
pnpm db:migrate
pnpm db:seed        # replaces all data with the demo set
pnpm dev
```

`pnpm typecheck` · `pnpm test` (121 tests) · `pnpm lint` · `pnpm build`

---

## How it works

**`lib/scoring.ts` is the product.** It takes a hydrated placement and an
injected reference date, and returns ranked actions with reason sentences. No
database access, no ambient clock — identical inputs always produce an
identical day, which is what makes it testable and what keeps the demo data
stable.

**The Today screen is server-rendered with data in the HTML.** No client
fetch on first paint, so there is no first-paint skeleton — not a missing
state, but the consequence of the screen loading with its content already in
it. Loading states exist where there is actually a wait: row actions and
retry.

**Grouping is authoritative; score only orders rows within a group.** An
escalation always sits above the working list regardless of its score.

---

## Decisions worth explaining

**The 90-day trial period is F5's own number**, taken from their public
claim that 98% of placed professionals remain past the first 90 days, rather
than a figure invented for the exercise.

**Silence outranks a poor rating.** A client who tells you they are unhappy
is still talking to you. A client who has gone quiet for two cadence periods
may already be drafting the email. Feedback cadence is weekly for the first
30 days, biweekly to day 90, monthly after.

**A problem is not closed when it is fixed.** Issues move to `FIXED` when a
fix lands, and only to `CLOSED` once follow-up checks at +7, +21 and +45 days
all confirm it held. A check returning `REGRESSED` reopens the issue and
escalates.

**Escalations route by problem type, not to one senior contact.** Client
relationship failures go to the account director; performance and attendance
go to the delivery manager. Every escalation row names the rule that tripped
and the person it goes to — an escalation that names nobody is just a to-do.

**Escalations are their own table.** They started as fields on `Issue`, which
cannot work: health red for seven consecutive days has no issue to hang an
escalation from, and one issue can escalate twice for different reasons.

**The operational day is the US Eastern business day.** This role runs
overnight IST to cover US business hours, so a list keyed to the IST date
would reorder itself in the middle of a shift. Timestamps are stored in UTC
and the day is derived in `America/New_York`.

**Health history is replayed, not written by hand.** The seed runs the
scoring engine across the previous 90 days against the data as it stood on
each of those days, so stored snapshots can never contradict what the engine
says now.

**Reasons never name the person already in the row heading.** Client calls
name the client contact, professional calls drop the name, and escalation
reasons state the problem while the owner appears on the line below.

---

## Performance

The screen is graded on how fast the answer appears, so action latency was
measured before anything was changed. Re-running the full Today query through
`revalidatePath` turned out to be 68% of a row action's cost, and the query
was fetching 2,400 health snapshot rows to use 12 — 429KB per load, including
completed check-ins and professional feedback the engine never reads.

| | Before | After |
|---|---|---|
| Logged row leaves the page | 5,860ms | 1,445ms |
| Reset demo data | 14,250ms | 6,574ms |
| Today query payload | 429KB | 72KB |

Four changes got there: row actions re-read and re-score only the placement
they touched and swap those rows in, the placement query loads only what the
engine reads, idle database connections are held for five minutes rather than
ten seconds, and reset uses a single `TRUNCATE` instead of ten sequential
deletes. A test asserts the swapped list is identical to a full re-run, both
after a check-in and after a follow-up regression that creates new
escalations.

Measured from a machine roughly 300ms from the database. Co-located on
Vercel, round trips are single-digit milliseconds.

Health snapshot writes are deferred off the response path and run without a
transaction — 32 upserts in one transaction hit Prisma's 5s ceiling over a
pooled connection, and the rows are independent, so the transaction bought
nothing and cost the request.

Timing instrumentation is still in `lib/server-timing.ts`, off unless
`CALLSHEET_TIMING=1` is set. It logs table names only, never values.

---

## Stack

Next.js App Router · TypeScript strict · Tailwind v4 · Prisma 7 · Neon
Postgres · pnpm workspaces · Vitest · Vercel

Database access is confined to `packages/db/repositories`. Design tokens live
in `app/globals.css`; Tailwind's default colours and font sizes are removed,
so `bg-red-500` does not exist and components use `ink`, `chalk`, `alert` and
the rest by name.

---

`SPEC.md` is what it does and why. `DESIGN.md` is what it looks like and why.
`CLAUDE.md` is how the work was run.
