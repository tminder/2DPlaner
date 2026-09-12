# Project Overview

**Snapshot as of 2026-09-12 — a point-in-time status summary, not a living document.**
Unlike [core-aims.md](core-aims.md), [decisions.md](decisions.md), and
[open-questions.md](open-questions.md), which are kept continuously in sync with the
project, this file describes where things stood when it was written and will drift out of
date. Supersedes the 2026-09-07 revision — 32 decisions (D-121 through D-152) landed since
then, across two long working sessions.

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

**Since the last snapshot, thematically (32 decisions, D-121–D-152):**

- **Grid: snapping, then a full settings surface.** D-122 built grid-snapped dragging
  (declaring a grid made every drag/resize hard-snap to it, deliberately coupled — "no
  second flag" — to the visible grid's own size). D-149 then decoupled that: `snap: false`
  shows a grid without forcing snap; `layer: "none"` keeps snap with no visual pattern at
  all; `layer: "front"` + `opacity` puts a semi-transparent grid *over* the plan (F-039);
  and the header's own Grid toggle grew a flyout editing `type`/`size` directly — the
  first menu-driven edit of a setting's own *value*, not just its on/off presence.
- **Selection went through five real visual iterations before settling.** Multi-select
  (F-029/D-124, Alt+click, deliberately not marquee at first) and marquee selection
  (F-047/D-134) shipped, then the *look* of "selected" churned hard: a glow → hidden
  handles + a dashed box (D-136) → a hard-edged shadow (D-137) → back to a glow, boosted
  and unified with hover's own treatment (D-138) — each change reported directly, not
  self-initiated. A real corruption bug was caught mid-stream: a marquee-selected group
  sharing a corner reference could corrupt the source on drag (D-135).
- **The app header went through five full revisions** (D-128 through D-132) — unified
  buttons → a two-row ribbon → hover-flyout tabs → docked-and-permanent → the logo
  replacing a dedicated File tab — before landing on today's shape, then had its icons
  unified to inline Lucide SVGs (D-133) replacing a mix of emoji and Unicode glyphs.
- **The right-click menu went through an even bigger rewrite.** D-144 first added
  right-click "Connect to…" (previously Ctrl/Cmd-drag only) and capped the existing
  list-style menu at 5 top-level items. Then, per direct feedback, D-145 replaced that
  entire list menu with a **radial menu** — round icon buttons arranged around the click
  point, nested groups blooming as a second ring — followed by two focused fixes: D-146
  (touch-drives-a-real-right-click, a real select-on-right-click bug, bigger buttons, an
  opening animation, a centered CSS-only tooltip replacing the native one) and D-147 (a
  group ring no longer replays the first ring's own opening animation). D-152 later found
  and fixed the one thing none of this had exercised: "Connect to…" never actually worked
  on touch, because the candidate resolution relied on hover state touch doesn't have.
- **Structural reparenting, closing F-012.** D-148 made "No placement (moves freely)"
  genuinely detach an element from its parent (one level up, into the grandparent) instead
  of just clearing its placement properties in place. D-150 generalized that same
  strip→reparse→splice mechanic to an *arbitrary* drop target, triggered by an ordinary
  drag held with Shift through release — F-012's own "unbuilt and unproven" mechanic,
  finally built, with two real bugs (an async-render race hiding the live highlight; a
  single-line-formatted target nesting the moved element as a sibling instead of a child)
  found and fixed live before either shipped.
- **Two real domain-coverage/editing gaps closed.** D-139 built per-vertex dragging for
  polygon/polyline (previously resize-only); D-143 added proportional scale for the same
  shapes (D-074's own long-deferred "shared corners would distort" question, resolved the
  same way D-141 later resolved an analogous rotation question: don't attempt the risky
  case, don't guess at it). D-141 itself added `rotation` for `shape: "rect"` — collision
  and containment turned out *exact*, not just conservative, once a rotated rect was
  represented as its own true polygon corners, a genuine upgrade found mid-implementation.
- **Two silent-corruption/false-warning bugs fixed at the source.** D-140: an expression
  inside a literal `points` pair produced `NaN` that poisoned the *entire* plan's
  fit-to-view computation with no visible error — now throws a clear one. D-123: F-037's
  validation violations now mark inline in the code pane instead of naming an element and
  leaving the reader to find it.
- **Deploy stopped being purely manual.** D-142's `scripts/deploy.sh` auto-detects which
  of six live targets actually changed (per-target commit tracking in a committed
  `.deploy-state`), deploys only those, byte-verifies every upload — replacing "remember
  all six mappings and verify by hand." Two real bugs found by actually running it
  end-to-end: a stale state entry silently read as "nothing changed" instead of failing
  loudly; a multi-file deploy silently truncated to one file (`ssh` without `-n` eating
  the deploy loop's own stdin).
- **Mobile/touch got a dedicated pass, all reported directly.** D-151: header overflow on
  narrow screens (flex-wrap), iOS Safari's zoom-on-focus for sub-16px inputs, a flyout
  submenu that opened off-screen (moved below its button, then edge-corrected), a too-wide
  tab/toolbar gap. D-152: touch's own "Connect to…" fix above.
- **Business/IP got its first concrete answer** (D-121): the hosted service (accounts,
  cloud sync) is the moat, not client-code secrecy — the repo stays public, a `LICENSE`
  file now makes "all rights reserved" explicit rather than silent. F-046's other three
  parts (monetization shape, trademark, a real ToS) are still fully open.
- **A module store page shipped at the smallest workable scope** (D-125): manually-curated,
  currently empty, deliberately sidestepping F-009's trust question and F-046's licensing
  question until real submissions exist. `hierarchy-module.js` now loads on demand rather
  than always (D-126).
- **A tech-debt round paid down three items outright** (D-127: S-017, S-026, S-031),
  alongside the ordinary per-feature debt already tracked below.

**Unchanged and stable:** the core parser/renderer, undo/redo, connections, module
composition, the SEO/site-structure work, the auth backend (D-117–D-120, the previous
snapshot's own big fix chain) — all still live, all still passing the full regression
suite on every push.

**The test suite has grown to 180 tests** (was 98 at the last snapshot), still `pytest` +
Playwright against a plain `file://` copy of `docs/`, no server or build step. The
live-verification habit caught real bugs *this window's own new work* introduced, not just
legacy ones — the async-render-race highlight bug (D-150), the touch-hover gap (D-152),
and two separate stray-backtick-in-a-CSS-comment incidents (D-145, D-146 — the second one
prompted a persistent memory entry, not just a decisions.md note, specifically because it
repeated) are the clearest examples: none were assumed correct from reading the code.

## Core aims, checked against this window

1. **Code and plan stay in sync** — upheld and extended: two new structural drag-to-source
   mechanics (D-148/D-150) both carefully recompute position to preserve visual sync, the
   same discipline every existing drag edit already followed.
2. **A purpose-built plan language** — extended cleanly (`rotation`, grid's `layer`/
   `opacity`/`snap`, generalized reparenting) without the language drifting toward
   general-purpose code; every new property stays a flat, declarative setting.
3. **Extensible via modules, core kept lean** — held. Every rendering/interactivity
   addition (rotation, scale, connect, reparent) landed in `interactivity-module.js`, never
   core; the header/menu work (five revisions, the grid flyout's own settings-editing code)
   correctly stayed in core specifically *because* it's app chrome, not plan rendering —
   consistent with the existing boundary, not a new exception to it. F-048 (a module still
   can't extend the header itself) remains open, unchanged, not violated.
4. **Built to last, debt tracked** — the point of this very audit. Three new items surfaced
   below, all found by name while building this window's own features (not a separate
   grep-for-problems pass) — matching how S-037 and others were found in the prior window.
5. **Findable by search engines** — untouched this window; no new information either way.
6. **Commercial success / IP protection** — D-121 answered *where* the protection comes
   from; *how the business works* (monetization shape), trademark, and a real Terms of
   Service for the hosted service are all still completely open, unchanged since the last
   snapshot.

## What's decided but not built

**20 open `F-x` questions** (`open-questions.md`) — F-012 (drag-driven reparenting) and
F-039 (grid in front) both closed this window. Notable groupings:

- **Real, undesigned gaps:** F-024 (no curves/arcs, no multi-level concept — rotation alone
  doesn't close this), F-010 (shape-agnostic container extent — `parent.size.x` still
  `rect`-only), F-013 (metric/imperial toggle), F-030 (reusable sub-plan components).
- **Fresh, directly requested, nothing designed yet:** F-048 (a module can't touch the
  header), F-042 (extending the one settings-flyout precedent — Grid's own type/size — to
  more settings).
- **Deliberately deferred by choice:** F-005/F-034 (public/shared plan viewing), F-008
  (live AI integration), F-009's real-sandboxing half, F-045/F-046's harder questions
  (real module submissions, monetization shape) — all waiting on volume/decisions outside
  the codebase itself, not on engineering time.

## Technical debt

**20 `S-x` entries** (`tech-debt.md`) — net roughly flat since the last snapshot (21): three
resolved outright in a dedicated pass (D-127: S-017/S-026/S-031), two more resolved as a
side effect of feature work (S-032's deploy risk, closed by D-142; S-037's `NaN` bug,
closed by D-140), three new ones surfaced by this window's own work:

- **New — all found live, all in `docs/interactivity-module.js`:**
  - **S-038**: the exact "valid candidate" check (exists, not self, not an
    ancestor/descendant either way) is now hand-copied *four* times (relateDrag,
    connectPick twice over — D-144 then D-152 — and D-150's own drag-reparent detection) —
    past the "second/third use, then share" threshold this project's own refactor
    philosophy (S-036) already names for a different pair of helpers.
  - **S-039**: `clearPlacement` (D-148) and `reparentElement` (D-150) duplicate almost the
    entire same strip→reparse→splice mechanic — D-148's own "grandparent" case is
    structurally just `reparentElement` with a fixed one-level dedent, never unified.
  - **S-040**: `findOwnPropertyLine`'s line-anchored regex silently can't find
    `placement`/`flush` on a single-line-formatted element (found live while building
    D-150) — every caller degrades quietly instead of erroring, so this has been true
    since before D-148 existed, just never noticed until now.
- **Unchanged, still open:** `handleRendered`'s six responsibilities (S-007);
  containment-scope duplication between validation and drag-clamps (S-008); a `hidden`
  subtree still gets validated (S-035); the two-independent-interpreters risk in core
  (S-016); storage try/catch duplication (S-018); several "no enforced link" pairs across
  modules (S-023/S-024/S-036); project-structure items (duplicated static assets S-033, the
  `documentation/`-vs-`site-docs/` naming pair S-034).

## What's going well, for balance

**The live-verification habit is catching this window's own bugs at almost a 1:1 rate with
features shipped** — D-135, D-140's own discovery, the D-141 false-warning, three D-142
deploy bugs, D-143's handle-overlap regression, D-144's two pointerdown/window-closer bugs,
two separate D-145/D-146 backtick incidents, D-150's async-render race and single-line
splice bug, D-152's touch-hover gap. None of these were caught by "the code looks right on
reading" — every one was found by actually running the feature, often against a
deliberately adversarial case (a stale SHA, a single-line-formatted plan, a raw touch
`PointerEvent` sequence with no mouse involved at all). The backtick repeat is the one
genuine process gap this surfaced, and it was closed the right way — a persistent memory
entry, not just a decisions.md note — specifically *because* it repeated once already.

## Recommendation

**No single blocking gap dominates this snapshot.** Two real candidates:

1. **S-038/S-039 together are the most mechanically similar tech debt this codebase has
   accumulated in one window** — both are "the same logic, written down more than twice."
   Neither is urgent (nothing is broken), but both are now past the threshold this
   project's own stated philosophy uses to decide when duplication should be hoisted
   rather than tolerated, and fixing them together (a shared candidate-validity helper; a
   shared reparent-splice core that `clearPlacement` calls with `grandparentId`) is one
   focused refactor, not two.
2. **F-046's still-fully-open half (monetization shape, trademark, a real ToS)** is the
   same standing recommendation as the last snapshot, unchanged because nothing touched it
   this window — still the one open question every other public-facing choice arguably
   should be checked against before more surface area accumulates on top of it.

**If forced to pick one: S-038/S-039.** It's the cheaper, purely-technical fix available
right now with no external decision needed first, and this window's own two big features
(the radial menu, drag-driven reparenting) are exactly the kind of "several similar
gestures accumulating their own copy of the same check" pattern that made the duplication
visible in the first place — a third gesture built the same way before this is cleaned up
would make the eventual refactor larger, not smaller.
