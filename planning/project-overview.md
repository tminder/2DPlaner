# Project Overview

**Snapshot as of 2026-08-30 — a point-in-time status summary, not a living document.**
Unlike [core-aims.md](core-aims.md), [decisions.md](decisions.md), and
[open-questions.md](open-questions.md), which are kept continuously in sync with the
project, this file describes where things stood when it was written and will drift out of
date. Written to answer one question directly: are we ready for a first backend prototype?
Prefer `decisions.md`/`open-questions.md` for current state.

## What the project is

A browser-based 2D plan generator: plans are defined in a purpose-built language as code,
and the code and the rendered plan stay in sync — editing the code updates the plan;
dragging the plan writes the code back (D-013, D-012). Three core aims
([core-aims.md](core-aims.md)):

1. Code and plan never drift apart.
2. A purpose-built language, not general-purpose code.
3. Extensible via modules loaded from within the plan itself.

The plan's code is meant to be primarily *authored by an AI* (D-003), with a technical
human reviewing and directing — this shapes the language toward low-ambiguity,
token-efficient generation over hand-typing ergonomics (D-017).

## What's actually built and live

**Live:** [tminder.github.io/2DPlaner](https://tminder.github.io/2DPlaner/) — frontend-only,
static files, no backend, no accounts, `localStorage` for persistence.

- **Language** (`documentation/language.md`): two primitives, Element and Connection
  (D-013); real-world units (D-005); expressions with backward-solving on drag (D-008,
  D-012); shared corners via sibling-element references in `points` (D-018), now with an
  explicit "literal by default, corner-reference only for genuine sharing" rule; a
  `settings { }` preamble (`allowCollisions`, `allowSelfIntersectingPolygons`,
  `edgeLengths`); per-element `label`/`dimensions`/`edgeLengths` (D-026, D-038).
- **Rendering:** SVG-based; core parses and renders geometry only (D-039's split) — every
  other visible thing (drag, selection, annotations, syntax highlighting) is module-owned.
- **Interactivity:** drag-and-drop with solve-backward for expression-backed values (D-012),
  rigid propagation across `connection`s (D-014), edge-sliding for a point attached to a
  connected rect's wall (D-032, "outside" mode — built, working), collision avoidance
  (D-041 — exact for rect-vs-rect via axis-separated clamping, safe but not perfectly smooth
  for circle/polygon), self-intersection checking (F-004, `allowSelfIntersectingPolygons`).
- **Containment** (D-032 "inside" mode): validated standalone in
  [Prototypes/16-parent-child-placement/](../Prototypes/16-parent-child-placement/) — exact
  for a rect child in a rect parent — but **not wired into the live product**.
- **Architecture** (`documentation/modules.md`): core + three shipped modules (D-031) —
  `interactivity-module.js`, `annotations-module.js` (D-039), `code-highlight-module.js`
  (D-042) — all auto-injected into every plan.
- **17 throwaway prototypes** (`Prototypes/01`–`16`) validated individual pieces before
  promotion into the real product.

## What's decided but not built

- **D-019** — user auth via a self-hosted, headless WordPress instance (core only, no
  plugins), credential verification via WP's own Application Passwords. Fully designed,
  nothing built.
- **D-021** — a separate, minimal storage service (CRUD for plan text per user). Fully
  designed, nothing built.
- **D-025** — deployment topology (WordPress and storage service on the same server/domain).
  Designed, nothing built.
- No accounts, no cloud sync, no server-side code exists anywhere in this project today.

## Are we ready for a first backend prototype?

**Not quite — and the project already flagged this concern once before.** D-019 itself
carries a "sequencing note": auth and storage were decided *before* F-001 (constraint-
solving scope) and F-002 (module API surface) — the two genuinely unresolved core-product
questions — were settled, which runs against this project's own stated principle (D-002) of
settling the concept before building infrastructure around it.

**Where F-001/F-002 actually stand now**, after this session's work:

- **F-002 (module API surface):** two of the three promised module capabilities — new
  interactivity, new rendering — are now validated by three real, shipped modules. The
  third — reusable, higher-level *compositions* built from Element/Connection (e.g. a
  "wall with a door" building block) — **has never been attempted by any module.** Still
  open.
- **F-001 (constraint-solving scope):** substantially narrower than when the sequencing note
  was written — D-032's "outside" placement mode is built and working, "inside" is exact for
  the rect-in-rect case, collision avoidance is exact for the common rect-vs-rect case — but
  explicitly not closed: containment isn't in the live product yet, multiple simultaneous
  constraints on one element are unhandled, and an element moved along by a `connection`
  (rather than dragged directly) isn't collision-checked at all.

**Two further, independent gaps:**

1. **No concept of multiple named plans exists yet, even purely locally.** `localStorage`
   currently holds exactly one "current plan," not a list. This is a prerequisite for
   "save/load plans" with *or without* a backend, and hasn't been touched.
2. **The language is still visibly changing shape.** This session alone: the shared-corners
   guidance was rewritten, and D-032's placement syntax was reversed once already
   (connection-based → element-property-based) after being built and tested. Persisting
   user-authored plans server-side now means near-certain migration work as the language
   keeps moving.

## Recommendation

Don't build the full D-019/D-021 architecture (WordPress auth + separate storage service)
yet. Instead, first introduce "multiple named plans" entirely client-side — a list in
`localStorage`, a UI to rename/switch between them — needed either way, independent of any
backend, and the step that would actually clarify what shape of data a future storage
service needs to persist. A real backend prototype after that would be a much smaller,
better-informed step than building the whole decided architecture now.
