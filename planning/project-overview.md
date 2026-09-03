# Project Overview

**Snapshot as of 2026-09-03 — a point-in-time status summary, not a living document.**
Unlike [core-aims.md](core-aims.md), [decisions.md](decisions.md), and
[open-questions.md](open-questions.md), which are kept continuously in sync with the
project, this file describes where things stood when it was written and will drift out of
date. Supersedes the 2026-08-30 revision: since then the site fully launched (registration,
rate limiting, mobile pass, blog, legal page), all three of F-001's placement modes and
both of F-002's promised module capabilities closed out, undo/redo and Duplicate shipped,
and a deliberate independent review of the plan *language itself* — not just its
implementation — surfaced fourteen new open questions (F-018–F-031), several confirmed live
rather than just reasoned about. Prefer `decisions.md`/`open-questions.md` for current
state; treat this file as a snapshot of where things stand and what's worth doing next, not
a standing to-do list that updates itself.

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

**The whole site is live and public**, not just the App:
[planagonia.com](https://www.planagonia.com/) — homepage, `/app/` (the editor itself,
now indexed and in the sitemap, D-062), `/docs/` (human-audience documentation, D-055),
`/profile/` (self-service sign-up/sign-in, D-058, in plain "username/password" terms
rather than raw WordPress language, D-060), `/blog/` (launched this session, D-070, first
post a non-technical rewrite of the project's own changelog), and `/impressum/` (D-063).
A cookie/local-storage notice states plainly what the site actually does (D-064); a "Beta"
badge marks the App specifically (D-065); the backend enforces rate limiting (D-056).
Every page was checked in a real narrow viewport this session, not just eyeballed — a
hamburger menu, code/viewer tabs, and a decluttered toolbar on mobile (D-067/D-068), desktop
styling left untouched throughout.

- **Language** (`documentation/language.md`): two primitives, Element and Connection
  (D-013); real-world metric units (D-005); expressions with backward-solving on drag
  (D-008, D-012); shared corners via sibling-element references in `points` (D-018); a
  `settings { }` preamble; per-element `label`/`dimensions`/`edgeLengths`; parent-child
  containment via `placement`/`childPlacement`, now with **all three placement modes
  built**: free (default), outside-attached, and inside-flush (D-071 closed the last of
  the three this session).
- **Rendering:** SVG-based; core parses and renders geometry only — every other visible
  thing (drag, selection, annotations, syntax highlighting) is module-owned.
- **Interactivity** (`docs/interactivity-module.js`): drag-and-drop with solve-backward for
  expression-backed values, rigid propagation across `connection`s, edge-sliding, collision
  avoidance, containment, self-intersection checking. **Undo/redo shipped this session**
  (D-073) — a small app-level history (full-text snapshots, not diff-based), toolbar
  buttons and Ctrl+Z/Ctrl+Shift+Z, deliberately not layered on the textarea's native undo
  stack (that would require focusing the field on every programmatic edit, popping the
  on-screen keyboard on touch devices — checked directly, not assumed). **Duplicate
  shipped this session too** (D-074): clones an element's subtree with ids renamed,
  internal corner-references and connections repointed correctly. Scale, requested
  alongside Duplicate, was deliberately deferred as its own follow-up (F-016) — it raises
  real unresolved design questions (what "scale" means for a corner-reference-built
  polygon, no existing gesture to hang a resize handle off of) rather than being simply
  unbuilt.
- **Module composition, both halves now proven live** (F-002 closed out this session):
  `core.registerBeforeRender(cb)` lets a module inject synthesized structure into the
  parsed tree before rendering; **drag-editability of a composite's own generated pieces**
  — the part D-046 explicitly left untried — is now built too (D-072): dragging a
  composite's wall segment moves the whole thing, dragging its door slides along the wall.
  Deliberately a per-composition-type mechanism, not a general one; untested whether it
  generalizes past the one composition type (`wallWithDoor`) it's been built for.
- **Multiple named plans, client-side**, plus an optional, explicit (not automatic)
  connection to the backend: sign in, save/load the active plan to the cloud from a third
  group in the plan-switcher. `localStorage` remains the default.
- **Backend, live and tested, independent of `docs/`**: a self-hosted WordPress instance
  verifies credentials via WP Application Passwords; a PHP/MySQL storage service issues
  its own signed session tokens and provides CRUD for plan text scoped per user, with a
  direct cross-user isolation check confirmed working, not just hand-traced.
- **A real, independent review of the plan language itself happened this session** — not
  a bug hunt, a deliberate step back to ask whether the language design is actually good,
  using criteria chosen independently of the project's own stated goals (domain coverage,
  semantic determinism, whether the parser is the only spec, extension-point leakage,
  versioning, failure-mode consistency). Concretely tested by authoring a real Fiat Ducato
  campervan plan by hand and comparing it against one an independent AI (ChatGPT) produced
  from the same prompt — this comparison, plus a raster/grid-architecture thought
  experiment prompted by a real spreadsheet-based layout example, is what surfaced most of
  F-018 through F-031 below, several confirmed by actually dragging things in a real
  browser rather than just reading the code.
- **Zero automated tests, zero CI, zero build step** anywhere in the repo — still a
  deliberate choice (D-034), unchanged this session. Playwright + headless Chromium,
  installed into this working session specifically, remains the substitute: every
  interactive fix and every language-review finding this session was confirmed by actually
  opening `docs/index.html` and dragging things, not by hand-tracing alone.

## What's decided but not built

- **D-025** — deployment topology as originally scoped ("WordPress and the storage service
  on the same server/domain") was overtaken by what actually happened (separate
  subdomains of the same shared-hosting account) — still not written up as a formal
  decision update.
- **F-016's Scale** — explicitly deferred by choice, not by neglect (see above).

## Open questions: fourteen new findings from this session's language review

`open-questions.md` now runs to F-031. The eighteen entries predating this session
(F-001–F-017) are in the state described above — F-001, F-002, F-016 (partially), and
F-017 all moved from open to built this session. What's new is F-018 through F-031, all
from the language-design review, grouped here by what they actually are rather than by
number:

**Confirmed live, not just reasoned about — the highest-severity findings:**
- **F-028**, duplicate element ids: two elements sharing an `id` — dragging the
  *first*-declared one on screen silently rewrites the *second*-declared one's position in
  the source instead, confirmed by actually doing it. No error, no warning, anywhere. This
  is a real data-corruption risk in a tool whose entire premise is that the code pane can
  be trusted to reflect what you did.
- **F-022**, collision/containment checks only ever run *during* a drag, never against a
  plan's own initial, as-authored layout — confirmed the concrete way, via the ChatGPT
  comparison plan, which had `allowCollisions: false` set and still shipped an
  unflagged overlapping rug and two identically-positioned doors.
- **F-019**, a container fully covered by its own children (an ordinary case — a counter
  with a sink and stove inset into it) becomes unclickable as a unit, since children paint
  over their parent and `elementFromPoint` always resolves to whichever child is on top —
  confirmed by trying to drag "the kitchen" in the campervan test plan and grabbing the
  stove instead, every time.
- **F-020**, `childPlacement` only checks a node's *immediate* parent, not any more distant
  ancestor — confirmed by dragging a grandchild ~700px outside its grandparent's declared
  bounds with no clamp at all.
- **F-027**, the natural-looking `style: { fill: otherElement.style.fill }` parses with
  zero error and renders the literal unevaluated expression source into the SVG — confirmed
  live, not assumed; `style` was simply never wired to invoke expression values the way
  `position`/`size` already are.
- **F-023**, no formal grammar or property schema anywhere — the hand-rolled parser is the
  only precise spec that exists. Confirmed with three separate live examples of the same
  underlying gap: an unrecognized `shape` renders as a silent invisible point,
  `rotation: 45` on a `rect` (F-024: rotation doesn't exist at all) silently does nothing,
  and `flush: true` without its required `placement: "inside"` silently does nothing
  either.

**Real, but design questions rather than confirmed bugs:**
- F-021 (no way to reach whatever's underneath a stacked/overlapping element — the general
  case F-019 is one specific instance of), F-025 (no version marker on the plan format,
  despite the language already having changed shape twice this project), F-026 (the
  "pinned to an edge, slides, clamps, warns" mechanism independently rebuilt four times now
  with no shared code), F-029 (no multi-select for bulk actions).

**Real, explicitly deferred at the user's own request rather than designed yet:**
- F-030 (a reusable component/sub-plan concept, broader than F-027's style-preset idea),
  F-031 (discrete/grid-snapped drag positions, paired with F-014's still-unbuilt visual
  grid).

**A concrete direction sketched, not yet built:**
- F-027 also proposes a specific fix shape — a named `styles: {}` preset registry in
  `settings`, referenced by string rather than routed through the (proven broken, for this
  case) expression system.

## What's going well, for balance

The pattern that's carried this whole project — cheap, throwaway experiments before
anything touches the real product, and a real willingness to test a decision against
reality rather than defend it once made — held up again this session in a new form: instead
of only testing code changes in a browser (which also kept happening, on every single fix),
the language *design itself* got put through the same discipline. Rather than accepting
"the language is fine, we designed it carefully," it got tested against independently-
chosen critique criteria, an actual authored example, a second AI's independent attempt at
the same brief, and a real-world reference photo — and every uncomfortable finding that
came out of that (F-019, F-022, F-023, F-027, F-028) got written down precisely rather than
smoothed over. That's the harder, more valuable version of the same habit this project has
shown throughout: three good syntax proposals (a `transform: {}` wrapper, "innovative"
alternative syntax, a full raster architecture) were each seriously considered and then
honestly rejected once checked against the language's own real precedent and use cases,
rather than adopted just for novelty's sake.

## Recommendation

**Build F-022 (a load-time validation pass) with F-028 (duplicate-id detection) folded in
as part of the same first pass — not F-016's Scale, and not any of the remaining language-
2.0 design questions yet.**

Reasoning, in order of how much it matters:

1. **These are the two highest-severity findings this session actually produced**, and
   both are the same *kind* of problem: something silently wrong, discoverable only by
   accident (dragging the exact right element, or eyeballing a rendered overlap), in a tool
   whose entire premise (D-003, D-017) is that the code pane can be trusted as the single
   source of truth for what a plan actually is. F-028 in particular — a drag on one visible
   element silently corrupting a *different* element's position in the source — is about as
   bad as a bug gets under that premise specifically.
2. **It needs no new mechanism, only a new call site.** `clampToNoCollision` and
   `clampToContainment` already exist, are already known-correct (D-041/D-044/D-071), and
   currently only ever run from inside `applyDrag`. F-022 is exactly the ask to run that
   same logic once against a freshly loaded/parsed plan and surface whatever it finds — a
   genuinely small addition, not a new subsystem. Detecting a duplicate id (F-028) is a
   single pass over `nodesById`'s declaration order, cheap to add to the same sweep.
3. **It's a natural, low-commitment seed for F-023's much bigger, still-undesigned question**
   (should there be a real schema at all) without having to answer that question now — a
   validation pass that reports "here's everything wrong with this plan as loaded" is useful
   on its own, and later becomes the obvious place to add more checks (an unrecognized
   `shape`, an orphaned `flush`) if F-023 is ever picked up, rather than a separate effort.
4. **Everything else waiting in the queue is either explicitly deferred by your own choice**
   (F-016's Scale, F-030, F-031) **or a genuine design question with no clear shape yet**
   (F-021, F-023 in full, F-026's refactor, F-029) — none of those are blocked by anything,
   they just aren't as concretely ready to build as this one is, and none carry the same
   "silently wrong" severity.

The main open design question if this is picked up: how results surface for more than one
violation at once — today's single-gesture `dragmsg` line isn't built for a list. Worth
settling before writing code, not a blocker to deciding whether to proceed at all.
