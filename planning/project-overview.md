# Project Overview

**Snapshot as of 2026-09-06 — a point-in-time status summary, not a living document.**
Unlike [core-aims.md](core-aims.md), [decisions.md](decisions.md), and
[open-questions.md](open-questions.md), which are kept continuously in sync with the
project, this file describes where things stood when it was written and will drift out of
date. Supersedes the 2026-09-05 revision: its single top recommendation (a real, committed
test suite) is now built and has already paid for itself — see below. Prefer
`decisions.md`/`open-questions.md`/`tech-debt.md` for current state; treat this file as a
snapshot of where things stand and what's worth doing next. **Since this section was
written: this snapshot's own #1 recommendation (a CI workflow running the suite
automatically) is already built too — [D-108](decisions.md#d-108-the-test-suite-now-runs-on-its-own-via-github-actions--deliberately-test-only-not-deploy).
This snapshot is not kept in sync going forward; see D-108 for current state there.**

## What the project is

A browser-based 2D plan generator: plans are defined in a purpose-built language as code,
and the code and the rendered plan stay in sync — editing the code updates the plan;
dragging the plan writes the code back (D-013, D-012). Five core aims
([core-aims.md](core-aims.md)):

1. Code and plan never drift apart.
2. A purpose-built language, not general-purpose code.
3. Extensible via modules loaded from within the plan itself.
4. Built to last, not just to work — technical debt tracked (`tech-debt.md`) and paid down
   alongside feature work.
5. **Findable by search engines** — a single consolidated domain, real metadata, a
   maintained sitemap/`robots.txt`, signed-in-only surfaces deliberately excluded from
   indexing.

The plan's code is meant to be primarily *authored by an AI* (D-003), with a technical
human reviewing and directing — this shapes the language toward low-ambiguity,
token-efficient generation over hand-typing ergonomics (D-017).

## What's actually built and live

The whole site is live and public at [planagonia.com](https://www.planagonia.com/), on a
single path-based domain structure (`/`, `/app`, `/docs`, `/profile`; `auth.`/`api.` stay
backend subdomains, both excluded from indexing) — `site-structure.md`'s own open questions
are now almost entirely resolved.

- **A real, committed test suite exists and is actively used — the single biggest change
  since the last snapshot.** `tests/` (pytest + Playwright, `file://` against `docs/`, no
  server/build step) now has 44 tests across 8 files covering drag/undo, containment/
  placement, the context menu, stacked elements, validation, rendering, and the newest
  connections feature. Every fix in this stretch was still verified live in a real browser
  first (this project's standing practice, unchanged) — but this time each of those checks
  also became a permanent regression test, not a throwaway script. **S-030, the prior
  snapshot's #1 recommendation, is fully resolved.**
- **Relationships between peer elements, redesigned end to end (D-107).** The old
  contact-point-only +/- icons are gone, replaced by a Ctrl/Cmd-drag gesture that works
  between any two elements regardless of distance, ending in a small choice menu ("Connect
  to X" / "Attach outside X" — the latter finally giving "outside" placement a real
  cold-start position to snap to, closing a gap open since D-032). Removing a connection
  moved into the right-click menu. Visibility is a new opt-in `settings.showConnections`
  toggle, plus two always-on aids added directly from user feedback after shipping: hovering
  any node in a connected chain shows the *whole* chain (not just its own direct edge,
  reusing the same BFS drag propagation already treats as one rigid group), and the
  Ctrl-drag gesture itself shows a live line tracking the cursor for its whole duration.
  **Two real, previously-latent bugs were found and fixed by testing this live against
  production, not by the automated suite alone:** F-023's property schema didn't recognize
  `placement` as valid on a shapeless point (so D-032's own established mechanic tripped its
  own validator); and the coordinate conversion used for both the new drag-line and
  `handleWheel`'s zoom-to-cursor silently ignored the SVG's letterboxing offset whenever the
  viewer's aspect ratio didn't match its viewBox's (almost always) — both fixed and now
  covered by permanent tests.
- **The header/toolbar redesign saga concluded (D-100 through D-106).** Several rounds of
  direct feedback landed on: every distinct action flat and always visible, icon-led, no
  dropdowns except Export's one deliberate flyout (grouping one action's own file-format
  variants, not hiding otherwise-separate actions from each other); a real sign-in/register
  popup replacing native `prompt()`s; the "Saved automatically" note dropped.
- **`planning/` itself was restructured from a chronological log into current-state
  documents.** `decisions.md`/`open-questions.md`/`tech-debt.md` each got a new intro
  paragraph stating the standing rule (update an existing entry in place; only open a new
  number for something genuinely new) and had ~15 fully-resolved/merged entries removed or
  folded together across all three files.
- **Backend, self-service registration, and the rest of the site: unchanged and stable.**
  WordPress auth + PHP/MySQL storage; undo/redo, Duplicate, all placement modes, module
  composition; the sitemap/`robots.txt`/Impressum/SEO work from `site-structure.md` — all
  live, all still passing the regression suite.

## What's decided but not built

Twenty-eight open `F-x` questions, roughly three groups:

- **Deliberately deferred by choice, not urgent:** F-016 (Scale), F-030 (reusable
  components), F-034 (sharing), F-008 (live AI integration), F-009's real-sandboxing half.
- **Real, genuinely undesigned gaps:** F-024 (no rotation — a real domain-coverage gap for
  a floor-plan tool, not just an edge case), F-029 (no multi-select), F-031 (grid-snapped
  dragging), F-036 (two mobile/touch gaps: pinch-zoom, touch context-menu), F-040 (the
  code/viewer split isn't resizable), F-041 (selection/hover glow has no alternative
  treatment), F-042 (no general settings-toggle menu beyond Grid/Connections).
- **Fresh and directly user-requested, not yet designed at all: F-043 — keyboard-driven
  move (arrow keys) and resize (Shift+arrow) for the selected element, with a configurable
  step size.** Recorded mid-task on direct request; nothing about it has been designed yet
  (default step size and where it lives, which axis each key affects, how resize works for
  a shape with no single `size`, undo-coalescing during key-repeat, keyboard-focus
  interaction with the code textarea).

`site-structure.md`'s own remaining open items: deep-linking a specific cloud plan from
Profile into the App (`/app/?cloud=<id>`) isn't built; whether `test.planagonia.com` stays a
staging mirror or gets retired now that the real domain carries the production layout.

## Technical debt

`planning/tech-debt.md`, 27 `S-x` entries (down from 34 at the last snapshot — S-001 through
S-004, S-012, S-029, and S-030 are now all resolved and removed):

- **`docs/interactivity-module.js` (S-005, S-007 through S-011)** — still where most of the
  real risk concentrates: the stacked-element paint-order cache is fragile and duplicated by
  a second mechanism (S-005); `handleRendered` is a six-responsibility god-function (S-007,
  down from seven — D-107 removed the icon-markup responsibility outright); inconsistent
  state-access conventions, incomplete teardown, and twelve module-level mutable variables
  with no ownership boundaries (S-009/S-010/S-011).
- **Core (`docs/index.html`, S-013 through S-022)** — smaller, more independent items: two
  incompatible module-matching rules, duplicated download/filename logic, an inconsistent
  silent-failure case, ad hoc storage try/catch repeated five times.
- **Secondary modules (S-023 through S-028)** — mostly "no enforced link between two things
  that must stay in sync by hand" (annotations mirroring core's geometry, `bringToFront`'s
  implicit contract with the hover CSS).
- **Project structure/process (S-031 through S-034)** — stale module docs, **no CI/CD at all
  for either tests or deploy**, physically duplicated static assets across six directories,
  a confusable `documentation/`-vs-`site-docs/` naming pair.

## What's going well, for balance

The habit of verifying every change live in a real browser before calling it done keeps
finding real bugs *this session's own new features expose*, not just old ones — both bugs
in the connections feature above were caught this way, not by the (now real, but still
finite) test suite. The planning-docs cleanup means a fresh session reading `decisions.md`
now gets the current shape of a feature directly, instead of reconstructing it from a chain
of superseded entries.

## Recommendation

**Unlike the last snapshot, this isn't "build a test suite" again — that's done. The next
highest-leverage move is to make sure it actually runs on its own, not just when someone
remembers to invoke it by hand.**

1. **S-032's test half — a CI workflow that runs `pytest tests/` on every push — is the
   cheapest, safest next step, and the direct sequel to last time's recommendation.** The
   suite is already headless-Chromium-based against a plain `file://` URL with no server or
   build step, so a GitHub Actions job is a small, self-contained addition (install Python +
   Playwright's browser, run pytest) with zero production risk — nothing about it touches
   deploy. It converts "a human/session remembered to run the tests" into a guarantee,
   closing exactly the gap that let two real bugs (both above) ship to production before
   being caught live rather than in CI. **Deliberately not recommending automating the
   `scp` deploy itself in the same step** — that would mean putting the SSH deploy key in
   GitHub's secrets, a real security-posture change this file shouldn't decide unilaterally.
2. **If a feature is wanted instead: F-043 (keyboard nudge/resize) is the one open question
   that's both directly user-requested and genuinely unbuilt** — a concrete, bounded next
   design-and-build task, unlike most of the rest of `open-questions.md` which is either
   deliberately deferred or a much bigger undertaking (rotation, multi-select, mobile).
3. **If tech debt is preferred: the stacked-element state cluster (S-005/S-009/S-010/S-011)
   is the largest remaining risk concentration**, and — unlike at the last snapshot — there's
   now a real regression suite to check any refactor there against, which is exactly the
   precondition this project's own tech-debt philosophy asks for before touching it.

If forced to pick one: **the CI workflow.** Not because it's exciting, but because — same
reasoning as last time, one level up — it's the one item that makes every future change,
whichever of the above comes next, verifiable by default instead of by memory.
