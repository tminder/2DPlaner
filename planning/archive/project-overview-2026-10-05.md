# Project Overview

**Snapshot as of 2026-10-05 — a point-in-time status summary, not a living document.**
Unlike [core-aims.md](core-aims.md), [decisions.md](decisions.md), and
[open-questions.md](open-questions.md), which are kept continuously in sync with the
project, this file describes where things stood when it was written and will drift out of
date. Supersedes the 2026-09-13 revision — 4 decisions (D-168 through D-171) landed since
then, closing out that same working session; no further work has landed since.

## What the project is

A browser-based 2D plan generator: plans are defined in a purpose-built language as code,
and the code and the rendered plan stay in sync — editing the code updates the plan;
dragging the plan writes the code back (D-013, D-012). Six core aims
([core-aims.md](core-aims.md)) — see "Core aims, checked against this window" below for
how this snapshot's own work holds up against each one.

The plan's code is meant to be primarily *authored by an AI* (D-003), with a technical
human reviewing and directing — this shapes the language toward low-ambiguity,
token-efficient generation over hand-typing ergonomics (D-017).

## What's actually built and live

The whole site is live and public at [planagonia.com](https://www.planagonia.com/).

**Since the last snapshot, thematically (4 decisions, D-168–D-171):**

- **A real investigation of S-041, not a guess.** Asked to analyze the code-editor
  caret-desync report in depth, three concrete hypotheses were built and tested live
  against the real app (a `word-break`/`overflow-wrap` mismatch, a bold-keyword line-height
  drift, and the comparison methodology itself) — all three ruled out. The first "find"
  turned out to be an artifact of the test's own invalid syntax, a useful lesson in itself
  (D-168). Still unreproduced with a clean repro; two real candidates (native scrollbar
  width, a layout change that skips `syncBoxMetrics()`) are named for next time rather than
  guessed at further.
- **Arrow-style dimension lines, a real architectural-drawing convention, added as an
  opt-in visual style for `edgeLengths`** — a new plan-wide `settings.dimensionStyle:
  "arrows"`, toggled by a header button, draws a witness-tick + arrow-marked line + text
  instead of plain text per edge (D-169). Deliberately scoped smaller than the reference
  image that prompted it: the bigger "auto-detect aligned walls and draw a summed
  dimension chain with a running total" idea was recorded as F-053 instead of built, after
  asking directly which was wanted.
- **The header's hover-only flyouts (New Element/Grid/Snap/Export) were unreachable on a
  real touchscreen — fixed at the root, not patched around.** A tap can't sustain CSS
  `:hover`, so a flyout would flash open for an instant and vanish before a finger could
  reach it, uncovering the mobile Code/Viewer pane underneath (D-170). A `.submenu-open`
  class under a `(hover: none)` media query, toggled by a capture-phase click listener
  (which runs *before* the tapped box's own bubble-phase handler, letting it suppress
  Grid's/Snap's own mouse-only on/off shortcut for that same tap) replaces `:hover` on
  touch without touching desktop behavior at all — verified in both a genuinely
  touch-capable Playwright context and an ordinary one. Snap's own flyout gained explicit
  On/Off buttons as a direct consequence: its box-click was the *only* way to toggle it,
  and that's exactly the click this fix now suppresses on touch.
- **All four shipped example plans rebuilt from scratch, not patched further** — explicitly
  "start over, no quick fixes" (D-171). `Blank` is now genuinely empty (a bare shapeless
  root, no placeholder rectangle). Studio Apartment showcases `flush`, `rotation`, and
  `dimensionStyle: "arrows"` declared by default so the new feature is visible the instant
  it opens. Electrical Grid's three parcels are now real, directly-adjacent `polygon`s
  sharing boundary corners (a genuine shared-corners showcase outside a single room, per
  direct correction mid-task), each house's connection point now declares `placement:
  "outside"` explicitly, and the distribution cabinet gained a `hidden` internal detail.
  Campervan Build kept its proven hidden/reveal trick and added a rotated fold-out table
  and a `flush`-pinned cabinet. A real, found-and-reverted side note: `compose:
  "wallWithDoor"` was tried for the apartment's door, found to need a `TRUSTED_MODULES` fix
  to avoid an untrusted-module prompt, then the whole composite was dropped from this pass
  per direct instruction — the trust-list change was reverted too, nothing speculative left
  in place.
- **A real, confirmed (if not yet fixed) finding for the long-standing S-042 "doubled
  labels" report, found while investigating a fresh instance of it against the rebuilt
  examples.** The stack-hint badge (D-077/F-021) lists the currently-hovered element's own
  name as its "current" stack entry, positioned at the cursor — when that same element also
  carries its own persistent `show: "always"` label, the two visually collide and read as
  doubled text in a screenshot ("Tisch Tisch"). Confirmed live for Studio Apartment's
  `side_table`; not yet reproduced for Campervan Build's `bett` specifically, and a
  fix (skip repeating the "current" entry's name when it's already shown persistently) is
  designed but not yet built — recorded in `tech-debt.md`, not actioned this snapshot.

**Unchanged and stable:** the core parser/renderer, undo/redo, connections, module
composition, structural reparenting, the SEO/site-structure work, the full D-047–D-120
auth backend arc, and everything from the D-153–D-167 window (the mobile header
scroll/flyout bug chain, Grid/Snap's settings surface, the metric/imperial toggle, New
Element, selection-dimming) — all still live, all still passing the full regression suite.

**The test suite stands at 217 tests, unchanged in count from the last snapshot** — D-169
was the one decision this window to add coverage (5 new cases), already folded into that
total; D-168/D-170/D-171 each verified live without adding further automated tests. Still
`pytest` + Playwright against a plain `file://` copy of `docs/`, no server or build step.

## Core aims, checked against this window

1. **Code and plan stay in sync** — upheld, untouched this window in any way that would
   put it at risk; `dimensionStyle`'s own display-only split (D-169) follows the same
   "never let a display preference touch what gets written to source" discipline
   `formatMeasurement` already established.
2. **A purpose-built plan language** — extended cleanly: `dimensionStyle` is one more flat,
   presence-based setting, reusing `toggleSettingsFlag` unchanged; no new grammar needed.
3. **Extensible via modules, core kept lean** — held, with one real test of the boundary:
   `compose: "wallWithDoor"` (a real, already-built module) was tried in a shipped example,
   needed a one-line `TRUSTED_MODULES` fix to use cleanly, and the whole attempt was
   cleanly reverted — including that trust-list change — once the feature itself was
   dropped from scope, leaving nothing speculative in place either way.
4. **Built to last, debt tracked** — net roughly flat: S-041 stayed open (investigated, not
   resolved) and S-042 gained a real, confirmed partial root cause without yet being fixed
   — both honestly left open rather than closed prematurely. 19 entries, unchanged in count
   from the last snapshot.
5. **Findable by search engines** — untouched this window; no new information either way.
6. **Commercial success / IP protection** — untouched since D-121; still the one core aim
   with no concrete mechanism decided beyond "the hosted service is the moat" (F-046).

## What's decided but not built

**28 open `F-x` questions** (`open-questions.md`) — none closed this window; five new ones
recorded (F-053 through F-057), all from direct requests made in passing while other work
was underway, none designed or built yet. Notable groupings:

- **Real, undesigned gaps:** F-024 (domain coverage never audited), F-010 (shape-agnostic
  container extent — still `rect`-only), F-007 (drag performance at scale), F-030 (a
  reusable component/sub-plan concept).
- **Fresh this window, nothing designed yet:** F-053 (automatic summed dimension chains —
  the bigger half of the arrow-dimension request, deliberately deferred), F-054 (Delete/
  Duplicate from a right-click or long-press on a plan-picker card), F-055 (a "Rename"
  action on the element right-click menu, explicitly bounded by the existing 5-top-level-
  item ceiling), F-056 (changing an element's style from its own right-click menu), F-057
  (a selected element should keep drag/right-click priority within its own bounds, even
  under something stacked on top — right-click already partly does this per D-077, drag
  does not).
- **Deliberately deferred by choice:** F-005/F-034 (public/shared plan viewing), F-008
  (live AI integration), F-009's real-sandboxing half, F-045/F-046 (real module
  submissions, monetization shape), F-048/F-049 (module-registrable header/tabs — a
  direction recorded in D-157, still not built) — all waiting on volume/decisions outside
  the codebase itself, not on engineering time.

## Technical debt

**19 `S-x` entries** (`tech-debt.md`) — count unchanged from the last snapshot, but **not**
untouched: S-042 (doubled labels) moved from "never reproduced" to "root cause confirmed
for one of its two reported cases, fix designed, not yet built" — genuine progress that
doesn't show up as a number going down, since the entry stays open until the fix actually
lands.

- **Real investigation, not resolution, this window:** S-041 (code-editor caret desync —
  three hypotheses ruled out, still no clean repro) and S-042 (doubled labels — the
  stack-hint-badge mechanism confirmed for one case, not yet fixed).
- **Unchanged, still open:** `handleRendered`'s six responsibilities (S-007);
  containment-scope duplication between validation and drag-clamps (S-008); a `hidden`
  subtree still gets validated (S-035); `findOwnPropertyLine`'s single-line-formatting
  blind spot (S-040); the two-independent-interpreters risk in core (S-016); storage
  try/catch duplication (S-018); several "no enforced link" pairs across modules
  (S-023/S-025/S-027/S-028/S-036); project-structure items (duplicated static assets
  S-033, the `documentation/`-vs-`site-docs/` naming pair S-034); and a handful of
  smaller, longer-standing items (S-019 through S-022) untouched since before the last
  snapshot too.

## What's going well, for balance

**Two real investigations this window both resisted the temptation to claim a fix that
wasn't actually confirmed.** S-041's own first "finding" (a CSS property mismatch) looked
like a confirmed root cause right up until the test that produced it was itself found to be
invalid — caught before it was written down as fact, not after. S-042 similarly stopped at
"root cause confirmed for the case that could actually be reproduced," rather than
generalizing to the unreproduced second case or shipping an untested fix. Both are recorded
exactly as certain as they actually are — no more, no less.

**D-171's own revert discipline is worth naming specifically:** trying `compose:
"wallWithDoor"`, finding it needed a trust-list fix, and then cleanly reverting *both* the
feature attempt *and* the trust-list change once the feature was dropped — rather than
leaving the unused fix in place "since it's harmless" — kept the codebase free of anything
speculative that nothing currently exercises.

## Recommendation

**No single blocking gap dominates this snapshot — the same as every snapshot since
D-121.** Three real candidates, one carried forward and two new:

1. **F-046 (monetization shape, trademark, a real Terms of Service) is the same standing
   recommendation as every snapshot since D-121** — unchanged again this window, still the
   one open question every other public-facing choice arguably should be checked against
   before more surface area accumulates on top of it.
2. **S-042's now-designed-but-unbuilt fix is unusually cheap for what it closes:** the
   mechanism is confirmed, the fix (skip the stack badge's own redundant "current" name
   when it's already shown persistently) is small and localized to `stackHintMarkup`, and
   it directly addresses a report that's now surfaced twice, independently, against real
   shipped content.
3. **F-054 (Delete/Duplicate on a plan-picker card) already has a mostly-worked-out design**
   from earlier investigation (reusing `createPlan`/a new shared `deletePlanById`, a small
   popup menu mirroring the existing `.submenu` styling, long-press via the same timing
   D-115 already established) — cheap to pick back up since the thinking is already done,
   just not yet written as code.

**If forced to pick one: S-042's fix.** It's the cheapest of the three (a small, already-
localized change with a confirmed mechanism behind it), and — unlike F-046, which needs a
business decision before any code — it's purely technical and ready to build right now.
