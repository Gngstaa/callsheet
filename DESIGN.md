# Callsheet — Design Direction

Read this before writing any component. `SPEC.md` says what the tool does;
this says what it looks like and why.

## What this is, so the design has somewhere to come from

Not a dashboard. A **triage list**. The nearest real-world objects are a
dispatcher's board, a nurse's handover sheet, a shift log — surfaces where
one person scans a ranked list, acts, and moves on. Nobody browses this.
Nobody explores it. They read the top of it and pick up the phone.

The user is one F5 client success manager. From F5's own public job listing,
this side of the operation runs **overnight IST hours** to cover US business
time. So the person opening this is doing it somewhere between 1am and 5am,
on a phone, in a dark room, between calls.

That fact drives most of what follows. It is also worth saying out loud in
the walkthrough — designing for the night shift because that is when the job
actually happens is the kind of thing the brief is asking you to notice
without being told.

---

## Principles

**The hero is the first row.** No greeting, no date banner, no summary stat,
no "Good morning". The top of the screen is the top of the list. The first
thing in the viewport is a human name and a reason to call them. Everything
that pushes that down is cut, including things that would be defensible on
any other product.

**Colour ranks, words explain.** Severity is visible at a glance, but the
reason is always a sentence. Never a coloured dot alone, never a status word
standing in for an explanation. If someone screenshots a row and sends it to
a colleague, the colleague should understand it.

**Rows, not cards.** No boxed containers, no shadows, no per-item borders. A
continuous list with a steady vertical rhythm scans faster and does not
imply each item is a separate object to open.

**Quiet everywhere except severity.** One thing on this screen is allowed to
be loud, and it is the escalation group. Everything else — type, spacing,
chrome — stays flat and unremarkable so that loudness still means something
at 3am on the fortieth row.

---

## Colour

Dark ground, because of the shift. Deep desaturated blue-grey rather than
black — black plus one bright accent is the house style of every AI-built
ops tool and it reads as such.

```
ink      #12171F   page ground
slate    #1B222C   raised surfaces: sheets, modals, the sticky header
line     #2A323E   hairlines and dividers
chalk    #E8EAED   primary text
mute     #8A93A0   secondary text, group labels, timestamps
alert    #FF5C4D   escalation
watch    #F2B441   needs attention
steady   #4FB477   healthy — used sparingly, see below
```

Green barely appears. A healthy placement produces no row; the absence *is*
the signal. Green shows up only on the placement detail screen and on the
"you're clear" state. Resist adding green chips to the list to make it look
balanced.

Red, amber and green are a bad system for colourblind users on their own, so
severity is encoded three ways at once: the colour, the weight of the left
rule (3px / 2px / none), and the words in the reason line. Any one of the
three should be enough.

Light mode: build it, respect `prefers-color-scheme`, but design dark first.
Same token names, light values:

```
ink      #FAFAFB
slate    #F1F3F5
line     #DDE1E6
chalk    #151A21
mute     #5C6672
alert    #C8342A
watch    #A6720C
steady   #2E7D51
```

---

## Type

**IBM Plex Sans**, one family, everything. It was drawn for technical and
operational interfaces, its tabular figures line up cleanly in a list of
durations, and it is not Inter — which is what every other submission will
use.

Numerals in the list use `font-variant-numeric: tabular-nums` so "9 days"
and "26 days" occupy the same width down the column. Do **not** reach for a
monospace face to get that effect; mono for small data labels is a tell and
Plex's tabular figures already solve it.

```
Person name       17px / 600 / -0.01em     chalk
Client + day      14px / 400               mute
Reason line       15px / 400 / 1.45        chalk
Group label       13px / 500               mute
Action button     15px / 500               chalk
Detail headings   20px / 600
Body prose        16px / 1.55, max 66ch
```

Sentence case throughout. No tracked-out capitals, no eyebrow labels above
headings, no single word in a heading picked out in a different colour.

---

## The Today row

The most important component in the product. Three lines of text and one
action.

```
┃ Priya Deshmukh
┃ Meridian Construction, day 9 of trial
┃ No feedback from Tom Becker since the placement started 9 days ago
┃                              [ Log feedback ]
```

- Left rule is the severity: 3px `alert`, 2px `watch`, nothing for routine.
  It runs the full height of the row, flush left, no rounding.
- Name is the largest thing in the row. This is a person you are about to
  call, not a record ID.
- Second line is context: client, then where the placement sits in its life.
  Written as a phrase, not fields joined by separators.
- Third line is the reason, as a sentence someone would say out loud.
  "Meridian Construction hasn't sent feedback in 26 days", not
  "SILENCE_THRESHOLD_EXCEEDED" and not "Feedback overdue".
- One primary action per row. Secondary actions live behind a long-press or
  overflow, not on the surface.

Escalation rows carry a fourth line naming the rule that tripped: "Second
attendance issue in 30 days — needs Arvind." Say who it goes to. An
escalation that does not name a person is a to-do, not an escalation.

Row height floats with content. No truncation with an ellipsis on the reason
line — if it needs two lines, it takes two lines. Never make someone tap to
find out why they are calling.

## Groups

Three, in order, with a quiet label and a count:

```
Escalate now   2
Call today     7
Later this week   4   (collapsed)
```

Label sits in `mute`, sentence case, with a hairline above. The count lives
here rather than in a header stat — that was the accessory I removed.
"Later this week" is collapsed by default so the top of the screen stays
honest about the size of the day.

---

## States

Written as direction, not mood. Errors do not apologise and are never vague.

**No data at all**
> Nothing loaded yet.
> Load the demo set to see a working day.
> `[ Load demo data ]`

**Nothing due today** — the state that must never be blank:
> You're clear today.
> Next up: Arjun Rao at Harbor Insurance, feedback due Thursday.

**Loading** — skeleton rows at the exact final dimensions, left rule
included, no layout shift when real data lands. Only ever below the fold;
the first screen is server-rendered with data in the HTML.

**Error**
> Couldn't reach the database.
> Last loaded 8:14am.
> `[ Try again ]`

---

## Motion

One moment, and it belongs to the user: logging feedback collapses the row
out over 180ms and decrements the group count. That is the whole motion
budget.

No entrance animations. No fade-and-slide-up on sections. No hover
transitions — there is no hover on a phone. Respect
`prefers-reduced-motion` and drop the collapse to an instant removal.

---

## Phone

The primary target, not the responsive afterthought.

- Single column, 16px side gutters, rows full-bleed to the gutters
- 44px minimum tap targets; the row action is a full-width button inside the
  row, thumb-reachable
- Group headers stick under a slim top bar carrying only the date
- Test on a real device. A resized desktop browser will not show you that
  the reason line wraps badly at 360px

---

## Reject list

Things that will show up if nobody says not to:

- Cards with rounded corners and a soft grey shadow around every item
- A stat strip across the top of Today
- Numbered markers (01 / 02 / 03) — the list is ranked, but it reorders as
  the day goes on and numbering implies a fixed sequence
- Charts of any kind. Nobody makes a phone call because of a chart
- A sidebar. Five screens do not need permanent navigation
- ALL-CAPS labels, eyebrow text, `→` glyphs appended to buttons
- Meta strings joined with middle dots
- Status pills that say "At Risk" with no explanation attached
- Any animation the user did not trigger

---

## Quality floor

Visible keyboard focus rings. Contrast at least 4.5:1 for text on ink —
check `mute` on `slate` specifically, it is the one that fails. Reduced
motion respected. Semantic list markup so a screen reader announces the
group and the count. All of this without mentioning any of it in the UI.
