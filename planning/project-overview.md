# Project Overview

**Snapshot as of 2026-09-13 — a point-in-time status summary, not a living document.**
Unlike [core-aims.md](core-aims.md), [decisions.md](decisions.md), and
[open-questions.md](open-questions.md), which are kept continuously in sync with the
project, this file describes where things stood when it was written and will drift out of
date. Supersedes the 2026-09-12 revision — 15 decisions (D-153 through D-167) landed since
then.

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

**Since the last snapshot, thematically (15 decisions, D-153–D-167):**

- **The mobile header row took three real bugs to get right.** D-153 revised D-151's own
  wrap-based overflow fix into a horizontal-scroll row instead (a phone screen can't spare
  a row that grows taller) — then immediately found and fixed two follow-on regressions,
  live: `overflow-x: auto` on the scroll container silently clipped every flyout's own
  `position: absolute` menu regardless of scroll position, and `flex-shrink`'s own default
  squeezed every button to fit instead of the row ever actually needing to scroll. D-158
  found a fourth, related bug shortly after — the JS-repositioned flyout's own 4px gap
  above its button created a dead zone that lost hover mid-transit, reported directly as
  "submenu can't be used"; fixed by removing the gap entirely.
- **Grid and Snap's settings surface grew, then had a real correctness bug in its own new
  code.** D-156 relocated Fit into the header, gave Grid's flyout an explicit "Off," and
  added a first Snap toggle — which turned out (D-161, reported twice) to still be silently
  coupled to whether a grid was merely *declared* at all, never actually independent of it.
  Fixed by making `settings.snap` a fully standalone object with zero remaining dependency
  on `grid` in either direction, each with its own separately-sized flyout. D-159 then
  finished menu-editing Grid's own last two source-text-only settings (`layer`, `opacity`),
  closing most of F-042.
- **Metric/imperial display toggle (F-013), decided as a real architectural question before
  being built.** Plan language stays metric forever — D-003's AI-authoring surface stays
  unambiguous regardless of who's *viewing* a plan — only the two human-facing display
  surfaces (dimension/edge labels, the scale bar) convert. Verified by a Plan-agent review
  of the actual codebase before implementation, which caught an inch-rounding carry bug
  (0.1" rounding up to a bare "12.0"" instead of rolling into the next foot) before it ever
  shipped.
- **A "New Element" flyout**, so dropping a fresh shape into a plan doesn't need hand-typing
  an `element {}` block (D-162) — corrected the same day from furniture presets to the four
  generic shapes the language is actually built from, once asked directly (D-163). Recorded
  as F-050: placement still lands at a fixed offset, not yet parent/child-aware.
- **Selection no longer visually reorders the DOM.** D-164 replaced "bring the selected
  element to the front" with dimming whatever currently occludes it instead — closing
  S-024, and catching a real bug via its own new tests before shipping: a shared CSS class
  between this and F-021's unrelated hover-dim mechanism let one feature's cleanup silently
  erase the other's state, fixed with a genuinely separate class.
- **A plain two-point line no longer shows four scale-corner handles** (D-165) — its own two
  endpoint handles already gave full control, so the redundant set (still shown for a
  polygon or a multi-point path, where it isn't redundant) was a real, reported annoyance,
  not a hypothetical one.
- **Three more mobile-only adjustments** (D-155): the viewer now fills its full available
  box instead of sitting inset by inherited padding; the Code/Viewer tab bar matches the
  app's own established active/inactive color tokens instead of hardcoded greys left over
  from before that system existed; Layers became reachable on mobile at all, as a third
  tab — previously entirely unreachable there, not just styled differently. Recorded F-049
  (the whole content-tab mechanism deserves a real, module-registrable design) while doing
  the minimum consistent extension of today's one-off version.
- **A future-direction discussion, deliberately not built yet:** modules should eventually
  be able to register their own header buttons and content tabs (D-157), tying F-048/F-049
  together into one shape before either gets built for real — deferred specifically because
  only one real caller (`hierarchy-module.js`) exists today, matching this project's own
  "wait for a second use, then generalize" precedent (S-036) rather than guessing at an API
  shape against a single hypothetical case.
- **Tech debt: S-038/S-039 paid down together** (D-154) — one shared
  `isValidGestureTarget` helper replacing four hand-copied "is this a valid drop/relate
  target" checks, and `clearPlacement` now delegates its own grandparent-reparenting case to
  `reparentElement` instead of carrying a ~50-line near-duplicate of the same splice
  mechanic.
- **Content and documentation, not app code:** all five blog posts lengthened 50–65% using
  only real project history already in `decisions.md`, cross-linked to each other (newer
  posts crediting older ones), and the "Open the app" callout varied rather than appearing
  on every single post (D-166). `/docs/` — untouched since D-055 — was brought back in sync
  with the app: two actively wrong claims fixed (the connect/disconnect icons D-107 removed
  long ago, an outdated "context menu: currently Delete" line) and a full pass of
  since-shipped features documented for the first time (D-167).

**Unchanged and stable:** the core parser/renderer, undo/redo, connections, module
composition, structural reparenting, the SEO/site-structure work, and the full D-047–D-120
auth backend arc — all still live, all still passing the full regression suite on every
push.

**The test suite has grown to 206 tests** (was 180 at the last snapshot) — still `pytest` +
Playwright against a plain `file://` copy of `docs/`, no server or build step. The
live-verification habit kept catching this window's own new bugs, not just legacy ones: all
three mobile-header regressions (D-153), the Fit button's own relocation bug (D-156, a
stale re-append list silently moving it back out of the header on the very next render),
the flyout dead-zone (D-158), the twice-reported Snap coupling bug (D-161), and D-164's own
shared-class bug — none assumed correct from reading the code, all found by actually running
the feature. D-160's inch-rounding carry bug is the one caught a different way this
window — by an independent Plan-agent review of the real codebase before any code was
written, not by live testing after the fact.

## Core aims, checked against this window

1. **Code and plan stay in sync** — upheld: the metric/imperial toggle (D-160) is display
   convertible in exactly two places and never allowed to touch what a drag or edit writes
   into plan source, verified directly, not just designed that way; Snap's fix (D-161) keeps
   the setting itself, not any view state, as the one source of truth for whether dragging
   snaps.
2. **A purpose-built plan language** — extended cleanly: `settings.snap` as its own flat
   object needed no new grammar (an object literal already parses generically, D-020); New
   Element's presets are the language's own four base shapes, not a new vocabulary on top of
   it.
3. **Extensible via modules, core kept lean** — held. Every interaction change (New Element,
   occlusion-dimming, two-point-line handles) landed in `interactivity-module.js`, never
   core; Fit/Grid/Snap stay core-owned header slots a module fills, the same boundary
   `#hierarchy-panel` already established, not a new exception to it. D-157 explicitly
   declined to generalize that boundary into a real extension API until a second real
   caller exists — a deliberate non-decision, not an oversight.
4. **Built to last, debt tracked** — net two items paid down this window (S-038, S-039), one
   more resolved as a side effect of D-164 (S-024, gone once `bringToFront` was deleted
   outright), one new item recorded from an unreproduced report (S-041) and one more from
   this session's own earlier work (S-042, doubled labels, also unreproduced) — 19 entries
   now, down from 20 at the last snapshot net of the new ones.
5. **Findable by search engines** — untouched this window; no new information either way.
6. **Commercial success / IP protection** — untouched since D-121; still the one core aim
   with no concrete mechanism decided beyond "the hosted service is the moat" (F-046).

## What's decided but not built

**23 open `F-x` questions** (`open-questions.md`) — F-013 (metric/imperial) closed this
window; F-042 (settings toggleable from the menu) mostly closed, with the two structurally
unavailable pieces (auto-loaded modules have no real "off" state; style presets aren't a
clean binary flag) left as the honestly-final shape of that question. Notable groupings:

- **Real, undesigned gaps:** F-024 (domain coverage never audited against what a real floor
  plan needs), F-010 (shape-agnostic container extent — still `rect`-only), F-007 (drag
  performance at scale), F-030 (a reusable component/sub-plan concept).
- **Fresh, directly requested this window, nothing designed yet:** F-050 (intuitive New
  Element placement — parent/child detection), F-051 (extending a line piece by piece),
  F-052 (how, or whether, user plan data could ever inform the product, statistics, or a
  sale).
- **Deliberately deferred by choice:** F-005/F-034 (public/shared plan viewing), F-008
  (live AI integration), F-009's real-sandboxing half, F-045/F-046 (real module
  submissions, monetization shape), F-048/F-049 (module-registrable header/tabs — a
  direction is now recorded in D-157, still not built) — all waiting on volume/decisions
  outside the codebase itself, not on engineering time.

## Technical debt

**19 `S-x` entries** (`tech-debt.md`) — down from 20 net of this window's own churn: three
resolved (D-154's S-038/S-039; S-024 as a side effect of D-164 deleting `bringToFront`
outright), two newly recorded (S-041, S-042 — both reported directly, neither yet
reproduced).

- **Resolved this window:** S-038/S-039 (D-154, see above); S-024 (gone once selection
  stopped visually reordering the DOM, D-164).
- **New, unreproduced reports, both worth revisiting if they recur:** S-041 (the code
  editor's syntax-highlight backdrop sometimes desyncing from where typing actually lands)
  and S-042 (doubled labels/dimension text on a real plan, screenshotted once but the
  underlying plan source never supplied).
- **Unchanged, still open:** `handleRendered`'s six responsibilities (S-007);
  containment-scope duplication between validation and drag-clamps (S-008); a `hidden`
  subtree still gets validated (S-035); `findOwnPropertyLine`'s single-line-formatting
  blind spot (S-040); the two-independent-interpreters risk in core (S-016); storage
  try/catch duplication (S-018); several "no enforced link" pairs across modules
  (S-023/S-025/S-027/S-028/S-036); project-structure items (duplicated static assets
  S-033, the `documentation/`-vs-`site-docs/` naming pair S-034).

## What's going well, for balance

**The live-verification habit kept catching this window's own bugs, most of them in
rapid, in-sequence pairs rather than isolated one-offs** — D-153's three mobile-header
regressions found and fixed one after another in the same pass, D-156's Fit-button
relocation immediately followed by D-158's flyout dead-zone, D-161's Snap bug caught only
because the user reported it *twice* before it was taken as real rather than a one-off
misunderstanding. None were caught by "the code looks right on reading" — every one came
from actually running the feature, often by deliberately re-testing the *exact* reported
scenario (a stepped mouse trajectory into a flyout, not a teleporting one that would skip
past the dead zone) rather than a generic smoke test. D-160 is the one exception worth
naming for balance: its inch-rounding bug was caught by an independent Plan-agent code
review *before* any code was written, not after — a second verification method that worked
just as well as live testing for a bug that was really about arithmetic, not interaction.

## Recommendation

**No single blocking gap dominates this snapshot, same as the last one.** Two real
candidates, one carried forward and one new:

1. **F-046 (monetization shape, trademark, a real Terms of Service) is the same standing
   recommendation as every snapshot since D-121** — unchanged again this window because
   nothing touched it, and still the one open question every other public-facing choice
   arguably should be checked against before more surface area (New Element, the metric
   toggle, the blog itself) accumulates on top of it.
2. **The two unreproduced reports (S-041, S-042) are both real enough to have been reported
   by name, specific enough to have a plausible mechanism already written down, and neither
   has repro steps yet.** Not urgent — nothing is confirmed broken — but both are exactly
   the kind of thing that's cheap to fix the moment they *do* reproduce (a scroll-sync
   check, a markup-insertion audit) and expensive to debug cold months later if the report
   is only in a screenshot and a memory, not a tracked entry with next steps. Recording them
   this window (rather than letting them live only in conversation) is the actual fix
   available right now; reproducing either is the next real step, not something to guess at
   further from the armchair.

**If forced to pick one: F-046.** It costs nothing to keep deferring technically, but it's
the one core aim (#6) with zero concrete mechanism after six snapshots' worth of feature
work landing on top of it — the same argument every prior snapshot has made, still true
because the gap hasn't moved.
