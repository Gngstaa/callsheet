# CLAUDE.md

Working agreement for this repository.

## What this is

Callsheet answers one question for one person: who do I call today, and why?

The user is an F5 client success manager with dozens of active placements.
They open this between calls, often on a phone. Every decision in this repo
should be checked against that sentence. If a change makes the first screen
slower, busier, or less obvious, it is the wrong change even if it is
technically better.

## Architecture

- Next.js App Router, TypeScript strict mode, Tailwind
- Prisma + Postgres (Neon), pnpm workspace
- `packages/db/repositories/*.repository.ts` — **all** database access lives
  here. No inline Prisma calls in route handlers, server components, or
  actions. If you need a new query, add a repository method.
- `lib/scoring.ts` — pure. Takes a hydrated placement plus a reference date,
  returns actions with scores and reasons. No database access, no `new
  Date()` inside it. The reference date is always injected so the logic is
  testable and so demo data does not drift.

The scoring module is the product. Treat changes to it as changes to the
business logic, not refactors.

## How I work

I plan and review in chat, then hand you the work. You do the file edits and
the running. That split is deliberate — do not skip ahead to implementation
when I am still describing the shape of something.

**Ask before you assume.** If the spec is ambiguous, say which reading you
picked and why, in your response, before writing the code. Do not silently
choose and move on. On this project the ambiguity is usually in the scoring
rules, and a wrong guess there is expensive to unwind.

**Small, reviewable changes.** One concern per pass. I would rather review
four focused diffs than one large one where a formatting change is hiding a
logic change.

**Do not commit.** Ever, without me saying so explicitly. I commit from
PowerShell on Windows. Stage nothing, run no git commands from your sandbox
— the mount is unreliable and I do not trust its view of the working tree.
If you think something is ready to commit, say so and stop.

**Verify before you believe a failure.** If a file looks truncated,
corrupted, or NUL-padded from your side, that is usually the sandbox mount,
not the file. Tell me and let me check from PowerShell with `Get-Item` or
`git status` before either of us starts "repairing" anything. I have lost
real work to a phantom corruption report.

## Environment

Windows. PowerShell only — no bash syntax, no `&&` chaining, no `export`.
Quote any path containing parentheses or brackets.

`pnpm typecheck` must be green across the whole workspace before I will
consider a change done. Not just the package you touched. Run it yourself and
report the result rather than telling me it should pass.

LF/CRLF warnings on staging are normal noise here. Ignore them.

## Secrets

Never print environment variable values, connection strings, or API keys —
not in terminal output, not in an explanation, not in a code comment showing
"an example". Describe symptoms instead: "the database URL is unset" not the
URL. If a command's output would contain a credential, redact it before
showing me.

## Conventions

- Server components by default. Reach for `"use client"` only when you need
  interactivity, and say why in the PR description.
- No `any`. If the types are fighting you, the model is probably wrong —
  raise it rather than casting through it.
- Every state a user can reach gets designed: empty, loading, error, and the
  good case. A screen without an empty state is not finished.
- Reasons render as sentences a person would say out loud. "Meridian
  Construction hasn't sent feedback in 26 days" not
  "SILENCE_THRESHOLD_EXCEEDED".
- Commit messages, when I ask for one: explicit scope, multi-paragraph body
  explaining why rather than what. Plain hyphens, no em-dashes, "Rs" instead
  of the rupee sign — the shell mangles unicode in `-m` arguments. File
  contents keep their original characters.

## Sample data

All data in this repository is invented. No real F5 client or professional
appears anywhere, including in comments and test fixtures. The seed is
designed to exercise specific edge cases documented in `SPEC.md` — if you
change the seed, keep those cases alive or tell me which one you dropped.

## What I will push back on

- Adding a screen. Five is the budget.
- Adding a filter, sort, or setting to the Today view. It is a list you read,
  not a tool you configure.
- Charts. Nobody makes a phone call because of a chart.
- Anything that puts a spinner between opening the app and seeing the list.
