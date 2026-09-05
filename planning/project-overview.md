# Project Overview

**Snapshot as of 2026-09-05 — a point-in-time status summary, not a living document.**
Unlike [core-aims.md](core-aims.md), [decisions.md](decisions.md), and
[open-questions.md](open-questions.md), which are kept continuously in sync with the
project, this file describes where things stood when it was written and will drift out of
date. Supersedes the same-day earlier revision: every item that one flagged as unresolved
is now built — F-021 is fully closed (four more rounds beyond its "core case"), F-023 (a
real property schema) is built, F-035 (placement/flush from the right-click menu) is built,
F-014 (the background grid) is built — plus a full technical-debt audit and a new, fourth
core aim adopted as a direct result of it. Prefer `decisions.md`/`open-questions.md` for
current state; treat this file as a snapshot of where things stand and what's worth doing
next, not a standing to-do list that updates itself.

## What the project is

A browser-based 2D plan generator: plans are defined in a purpose-built language as code,
and the code and the rendered plan stay in sync — editing the code updates the plan;
dragging the plan writes the code back (D-013, D-012). Four core aims
([core-aims.md](core-aims.md)):

1. Code and plan never drift apart.
2. A purpose-built language, not general-purpose code.
3. Extensible via modules loaded from within the plan itself.
4. **Built to last, not just to work** — new — technical debt is avoided where possible and
   paid down alongside ongoing feature work, not left to accumulate. Adopted directly off
   the back of this stretch's own technical-debt audit (below), not stated in the abstract.

The plan's code is meant to be primarily *authored by an AI* (D-003), with a technical
human reviewing and directing — this shapes the language toward low-ambiguity,
token-efficient generation over hand-typing ergonomics (D-017).

## What's actually built and live

The whole site is live and public at [planagonia.com](https://www.planagonia.com/). Since
the last snapshot, every remaining item it flagged has been built, plus a great deal that
came from real use of what was just shipped:

- **F-021 fully closed, five decisions deep (D-077, D-086 through D-091).** Reaching a
  hidden element (click-cycling) and discovering one exists (a hover badge) were already
  built; this stretch added a *persistent* front/back swap via right-click that actually
  reorders an element's declaration in the source (there's no z-index in this language —
  paint order is declaration order), then fixed it twice more after real use surfaced that
  right-click could only ever reach whatever was already visually on top, and that the
  hover-dim/badge check only ever sampled once at element-entry rather than continuously —
  both traced to root cause and fixed, not patched around.
- **F-023: a real property schema (D-084).** A per-shape allow-list, checked as three more
  functions in the existing load-time validation pass — no parser rewrite. Catches an
  unrecognized `shape`, a property a shape doesn't use, and `flush` without a resolved
  `"inside"` placement. Found two more real, previously undetected instances of its own
  named problem while building it (`dimensions` on a `polygon`, `edgeLengths` on a
  `circle` — both already documented as unsupported in prose, neither ever enforced).
- **F-014: a background grid (D-085), plus a second style added the same day.** A new
  auto-loaded, settings-driven module (`settings { grid: { size, type } }`) — a checkerboard
  by default, plain grid lines as a second `type` option requested right after the first
  shipped. Deliberately settings-only, not a viewer toggle, matching how `styles`/`version`
  already work.
- **F-035: placement/flush from the right-click menu (D-092).** "Place Inside," "Make
  Flush"/"Un-flush," and "Clear Placement" — each immediately snaps the element into a
  valid resting position when set, reusing the exact clamp math a drag already applies,
  rather than leaving it wherever it was until the next manual drag. "Outside" deliberately
  not built: confirmed directly that it has no cold-start positioning logic anywhere in
  this codebase at all, only ever activating once an element is already touching a target
  edge mid-drag.
- **A full technical-debt audit (new, `planning/tech-debt.md`, 34 numbered `S-x` entries)**
  — three parallel deep reads of `docs/index.html`, `docs/interactivity-module.js`, the
  three smaller modules, and the project's own top-level structure. Found one genuinely
  shipped, currently-live bug (a missing style fallback on `polygon`/`polyline` renders
  literal `stroke="undefined"`/`stroke-width="NaN"`), one already-acknowledged still-broken
  behavior (D-041's collision-slide against circles/non-rect polygons), and a cluster of
  real maintainability risk in the stacked-element subsystem specifically — five
  interacting pieces of state that needed four same-day bug-fix rounds this stretch alone
  (D-086, D-088, D-090, D-091) before settling.
- **Eight new open questions logged, none built** (F-036 through F-042, plus a stray
  misplaced paragraph in `open-questions.md` found and fixed along the way): mobile
  pinch-zoom/touch-menu gaps, inline-in-code error display, style-preset-as-module
  architecture, front-layer grid, a resizable code/viewer split, alternatives to the shared
  selection/hover glow, and a menu that reads the plan's own parsed structure to offer
  live module/settings toggles.
- **Backend, everything from before, unchanged**: self-hosted WordPress auth plus a
  PHP/MySQL storage service, both live and tested; undo/redo, Duplicate, all three
  placement modes, module composition — none of it touched this stretch, none of it
  regressed (confirmed by an explicit shipped-examples/drag/duplicate/delete regression
  pass after nearly every change this stretch made).
- **Zero automated tests, zero CI, zero build step — no longer just "deliberate" (D-034),
  now flagged as this project's single highest-leverage piece of technical debt (S-030).**
  Every fix this stretch was still verified with Playwright against a real, running browser
  before being called done, same discipline as always — but every one of those checks was
  written into a session-local scratchpad and thrown away afterward, never committed as a
  regression suite. See Recommendation below.

## What's decided but not built

- **F-016's Scale** — explicitly deferred by choice, unchanged.
- **F-032** (a Word-like icon menu for the App's toolbar) — recorded only, unchanged.
- **F-036 through F-042** — all recorded only this stretch, per explicit instruction each
  time ("nur notieren"), not designed or built.
- **D-025** — deployment topology write-up, still not formally updated to match what
  actually shipped (separate subdomains). Unchanged since the last snapshot; genuinely
  low-priority (the deployment itself works and is documented in `README.md`/`site-structure.md`,
  just not back-filled into a D-number).

## Open questions: forty-two now, most of this stretch's own additions still unbuilt

F-018 through F-035 (the two rounds of language review plus everything reached from real
use of what got built) are now closed except F-024 (rotation/domain coverage), F-026 (the
clamp/slide unification — now also tracked concretely as S-001 in the tech-debt audit,
confirmed lower-risk to unify than the repeated-rebuilding history suggested), F-029
(multi-select), F-030/F-031 (deliberately least-developed), F-032/F-034 (deferred by
choice), and F-036 through F-042 (this stretch's own new findings, all log-only).

**Still open, roughly by size:**

- **Cheap, well-scoped:** F-013 (metric/imperial display toggle), F-040 (resizable
  code/viewer pane split — currently a fixed 420px with no handle at all).
- **Real, but genuinely undesigned:** F-024 (rotation), F-026 (clamp/slide unification —
  see S-001), F-029 (multi-select), F-037 (inline-in-code diagnostics — would need the
  parser to start tracking per-property source spans, which it currently doesn't for any
  string-valued property), F-038 (style-preset resolution's architectural inconsistency
  with every other display module), F-041 (glow alternatives).
- **Deliberately deferred, least developed:** F-030 (reusable components), F-031
  (grid-snapped dragging), F-032 (icon menu), F-034 (sharing), F-036 (mobile touch gaps),
  F-039 (front-layer grid), F-042 (a menu that reads the plan's own code), F-016's Scale.

## Technical debt — now a first-class, tracked concern, not an afterthought

`planning/tech-debt.md`, 34 `S-x` entries, split into three groups: code-level debt in core
(`docs/index.html`, S-012 through S-022), code-level debt in the interactivity module
(S-001 through S-011 — the largest, most organically-grown file in the project, and where
most of the real risk concentrates), debt in the three smaller modules (S-023 through
S-028), one already-shipped-and-broken behavior (S-029), and five items about the project's
own structure and process rather than any single file (S-030 through S-034). This audit is
what prompted Core Aim 4 above — the intent is for this list to actually shrink over time
alongside feature work, not sit as a permanent, ignored appendix.

## What's going well, for balance

The same habit that made both language reviews worth doing kept paying off at a finer
grain this stretch: nearly every feature request that touched the stacked-element subsystem
(F-021's several rounds) surfaced a *second*, real bug while being built or immediately
after shipping, not months later — each one traced to an actual root cause and fixed there,
not patched at the symptom. The technical-debt audit itself is a continuation of that same
instinct turned on the *whole codebase* deliberately, rather than only ever reacting to
whatever the next feature request happens to touch.

## Recommendation

**This is the first snapshot where the honest answer isn't "the next feature" — it's to act
on the sustainability principle this stretch itself just adopted, before the codebase grows
any further without one.**

1. **S-030 (a real, committed test suite) is the single highest-leverage thing to build
   next, not another F-number.** Every fix this project has ever shipped was verified by
   hand, in a throwaway session script, then discarded — there is no repeatable regression
   check anywhere in the repository. The stacked-element subsystem alone needed four
   same-day bug-fix rounds this stretch specifically because each fix's blast radius wasn't
   mechanically checked against everything built before it — a committed suite (even a
   modest one covering drag, containment, click-cycling, and the context-menu actions)
   would make every future change in this area, and every item in `tech-debt.md`, cheaper
   and safer to act on. This is the one recommendation in this document that isn't a
   feature — it's infrastructure for building every feature after it more safely.
2. **If a feature is wanted regardless, F-013 or F-040 are the cheapest, most contained
   options left** — a display-only unit toggle and a resizable pane divider, neither
   touching the parts of the codebase the audit flagged as fragile.
3. **S-001 through S-003 (the clamp/slide duplication, the six near-identical action
   functions, the three competing edit-apply idioms) are the best-scoped code-debt items to
   pay down once a test suite exists to check the refactor against** — confirmed lower-risk
   than assumed (each clamp function has only 1-2 call sites), but a refactor across
   several call sites is exactly the kind of change a regression suite is for.

If forced to pick one: S-030. Not because it's exciting, but because it's the one item
that makes every other item on this page — the open questions, the debt list, whatever
comes after — genuinely cheaper to act on correctly.
