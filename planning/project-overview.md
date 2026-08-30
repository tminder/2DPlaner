# Project Overview

**Snapshot as of 2026-08-30 — a point-in-time status summary, not a living document.**
Unlike [core-aims.md](core-aims.md), [decisions.md](decisions.md), and
[open-questions.md](open-questions.md), which are kept continuously in sync with the
project, this file describes where things stood when it was written and will drift out of
date. This revision replaces the previous one (which asked narrowly "are we ready for a
backend prototype?") with a broader pass: a full project overview plus an independent risk
assessment, requested directly rather than assumed. Prefer `decisions.md`/`open-questions.md`
for current state; treat the risk section below as a snapshot of concerns to re-check, not a
standing to-do list that updates itself.

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

- **Language** (`documentation/language.md`, 517 lines): two primitives, Element and
  Connection (D-013); real-world units (D-005); expressions with backward-solving on drag
  (D-008, D-012); shared corners via sibling-element references in `points` (D-018),
  "literal by default, corner-reference only for genuine sharing"; a `settings { }`
  preamble (`allowCollisions`, `allowSelfIntersectingPolygons`, `edgeLengths`); per-element
  `label`/`dimensions`/`edgeLengths` (D-026, D-038); parent-child containment via
  `placement`/`childPlacement` (D-032, D-044).
- **Rendering:** SVG-based; core parses and renders geometry only (D-039's split) — every
  other visible thing (drag, selection, annotations, syntax highlighting) is module-owned.
- **Interactivity** (`docs/interactivity-module.js`, 1246 lines): drag-and-drop with
  solve-backward for expression-backed values (D-012), rigid propagation across
  `connection`s (D-014), edge-sliding for a point attached to a connected rect's wall
  (D-032 mode 2), collision avoidance (D-041), containment (D-044), self-intersection
  checking (F-004). Five independently-clamped drag constraints now stack on every drag —
  see the risk section below.
- **Multiple named plans, client-side** (D-043): a list of `{id, name, text, updatedAt}`
  plans in `localStorage` with a plan-switcher UI, replacing the old single-current-plan
  model.
- **Architecture** (`documentation/modules.md`): core (`docs/index.html`, 1037 lines: parser,
  renderer, toolbar, persistence, all in one file) plus three shipped modules (D-031) —
  `interactivity-module.js`, `annotations-module.js` (D-039), `code-highlight-module.js`
  (D-042) — all auto-injected into every plan.
- **17 throwaway prototypes** (`Prototypes/01`–`16`) validated individual pieces before
  promotion into the real product.
- **Zero automated tests, zero CI, zero build step** anywhere in the repo — a deliberate
  choice (D-034: "zero dependencies, plain static files") for the build-step/dependency
  part; the absence of any test suite was never a decision, just never come up.

## What's decided but not built

- **D-019** — user auth via a self-hosted, headless WordPress instance. Fully designed,
  nothing built.
- **D-021** — a separate, minimal storage service (CRUD for plan text per user). Fully
  designed, nothing built.
- **D-025** — deployment topology. Designed, nothing built.
- No accounts, no cloud sync, no server-side code exists anywhere in this project today.

## Independent risk assessment

Asked for directly, as an outside read rather than the project's own running self-
assessment. Ordered by how much it would actually hurt if it went wrong, not by how often
it's been discussed — some of these (F-009, F-001/F-002) are already named as open
questions in `open-questions.md`; what's added here is a judgment about *urgency*, which
that file deliberately doesn't rank.

### Worth fixing before adding more features

**1. Nothing in this codebase has ever actually run in a browser.** Every fix and feature
this entire project — collision clamping, containment, corner-reference dragging,
self-intersection checking, connection propagation, expression solve-backward, the
plan-switcher, all of it — was verified by hand-tracing source code, never by opening the
page and clicking. That's a reasonable way to *design* correctly, but it is not a
substitute for execution, and the number of interacting systems has grown past the point
where hand-tracing alone catches everything: a single drag on a connected, corner-
referenced, collision-checked, containment-checked element now runs through five
independent pieces of logic in sequence (see #3 below), each individually traced
correctly in isolation, with the actual *combination* never observed running. This is the
single highest-leverage thing to do next, before any more feature work: open `docs/` in a
real browser and actually drag things around, ideally with a systematic pass through the
shipped examples rather than a spot check. If that's not feasible in this environment,
it's worth explicitly deciding to accept that risk rather than continuing to build on an
unverified base by default.

**Update, 2026-08-30: done, partially.** A real-browser pass happened — reported back as
"pretty good," with some minor unspecified issues noted but not detailed yet (deliberately
set aside for later rather than dropped). This substantially de-risks the "never run at
all" concern above; it doesn't yet close it fully, since a spot-check isn't the same as
the systematic pass through every shipped example this note originally asked for, and
whatever the noted minor issues are hasn't been triaged.

**2. External modules execute with zero sandboxing, and the trust model doesn't match how
plans actually arrive.** `docs/index.html`'s module loader (`loadExternalScript`) injects
any `module "https://..."` URL a plan declares as a live `<script src>` tag — full page
access, no confirmation, no allowlist, no CSP restricting it. `open-questions.md` already
tracks this as F-009, framed as an open design question ("does the trust model need
revisiting"); on the ground, though, it's not hypothetical — it's a live capability on a
public, indexed URL today. The stated core workflow (D-003/D-023) is a human pasting
AI-generated plan text from a separate conversation directly into the code pane and
trusting it enough to run — exactly the path where a malicious or hallucinated module URL
would execute silently. This doesn't need solving before every other feature, but it
should move from "open question" to "flagged risk with an owner" rather than sitting
alongside F-013's metric/imperial toggle in priority.

**Update, 2026-08-30: a first mitigation shipped (D-045).** Loading anything URL-like that
isn't one of the three modules this app ships itself now shows a native `confirm()` naming
the exact URL before fetching/running it; declining stops the plan from rendering rather
than silently loading. This is real, not cosmetic — it closes the "happens automatically,
no confirmation at all" framing above — but it's still not a sandbox: accepted code still
runs with full, unrestricted page access, same as before. The risk moves from "silent" to
"one click past silent," which is the honest extent of what this closes.

**3. Drag-time constraints are accumulating as independently-sequenced heuristic clamps,
with no unified model and no test of their combinations.** Collision (D-041), containment
(D-044), connection propagation (D-014), wall-sliding (D-032 mode 2), and
self-intersection checking (F-004) each clamp or reject the same `(dx, dy)` in sequence
inside `applyDrag`, and each was added with an explicit, honest note that it's "not a
jointly-solved optimum" — true and fine for two constraints, but this is now five, and
every future constraint (F-016's Scale, F-017's undo, D-032's still-unbuilt `flush`) is a
candidate to stack on top of the same function. Nothing is wrong today, but the
architecture has no answer for what happens when a collision-blocked, containment-clamped,
connection-propagated element also needs to self-intersection-check — each piece assumes
it's reasoning about a delta already validated by everything before it, and that chain
keeps getting longer. Worth a deliberate check-in the next time a constraint is added:
either accept this is permanently sequential-heuristic by design (a real, defensible
choice — document it as one), or decide what "enough constraints" looks like before
reaching for a real solve.

### Real, but not urgent

**4. The plan language has no version field and has already changed shape twice
mid-project** (D-018's shared-corner default flipped; D-032's placement syntax moved from
a connection property to an element property, after being built and shipped once already).
This is currently harmless — nothing persists a plan anywhere but the authoring browser's
own `localStorage`, and a stale plan just gets edited forward. It stops being harmless the
moment plans are shared between people, exported for long-term storage, or backed by
D-021's storage service — at that point, an old plan referencing dropped syntax silently
breaks with no migration path and no way to detect which version it's written against.
Cheap to add now (a `settings { languageVersion: 1 }` or similar, ignored until it's
needed); expensive to retrofit once real saved plans exist outside this session's control.

**5. Two large, single-file, untested modules.** `docs/index.html` (1037 lines: tokenizer,
parser, renderer, toolbar, and the new multi-plan persistence layer all in one `<script>`
block) and `interactivity-module.js` (1246 lines) are both large enough that a small,
wrong edit could plausibly regress something in an unrelated part of the file with nothing
to catch it — the project's own standing practice (hand-trace, then ask the user to click
around) is the only check that exists. This isn't a call to add a build step — D-034's
"zero dependencies, plain static files" choice is sound and doesn't need reversing — but
core's own several concerns (parser, renderer, toolbar/persistence) could split into
separate plain `<script src>` files today, no bundler required, the same way the module
system already splits interactivity/annotations/highlighting out. Would make each piece
individually smaller to hold in mind while editing it.

**6. The core value proposition still has a manual hop in it.** D-003 recasts the AI as
the plan's primary author, but F-008 confirms the actual mechanism is still copy-paste
from a separate AI conversation into the code pane (D-023) — there's no live integration.
That's a reasonable place to have stopped for a frontend-only prototype, but it means the
tool's central differentiator (code and view always in sync, AI-authored) is currently
demonstrated only in the "code edited by hand, view follows" direction, not the "AI writes,
human reviews in place" direction the whole language design (D-017's low-ambiguity,
token-efficient goals) was optimized for. Worth remembering this is still unproven in its
own primary use case, not just an F-numbered nice-to-have.

### Worth tracking, not action items yet

**7. Performance hasn't been re-measured since the constraint-stacking work started.**
F-007's one benchmark (full reparse + full DOM replacement on every `pointermove`, fine to
~800 objects, over budget by ~2000) predates collision checking, containment, and the
corner-reference drag fix — each of which adds its own `computePositions`/bbox pass per
drag frame on top of the baseline cost that was already measured. Not a problem at today's
scale (one room, one property boundary), but the ceiling is almost certainly lower than
F-007's number now, and nothing has re-checked by how much.

**8. Planning documentation has grown large enough to be its own maintenance cost.**
`decisions.md` is ~600 lines across 44 entries, several with multi-paragraph "here's what
we tried, here's why it was wrong, here's the correction" histories preserved in full.
That traceability is genuinely valuable and has caught real regressions in this project
before — but it also means picking this project back up cold (a new session, a different
person) now costs real time and tokens before touching any code, and a single feature
(e.g. D-032's containment) already has its status recorded in four separate places
(`decisions.md` D-032 and D-044, `language.md`, `open-questions.md` F-001) that all have
to be individually kept in sync going forward. Not broken yet, but worth a deliberate
prune-or-archive pass (e.g. collapsing fully-resolved, no-longer-contested decisions into
shorter final-state summaries, keeping the full back-and-forth recoverable from git history
rather than in the living document) before it grows past this size again.

**9. No LICENSE file on a public, live site.** Not a functional risk, but currently an
un-made decision rather than an intentional one — worth a deliberate choice (even
"all rights reserved, source visible for review only") rather than leaving it to whatever
the absence of a license implicitly means on GitHub.

## What's going well, for balance

The pattern of throwaway prototypes validating one question each before anything touches
`docs/` (17 of them so far) has consistently caught real bugs before they reached the live
product — the viewBox fit-box bug and the corner-tangent instability bug were both found
this way. Decisions that turned out wrong in practice (D-032's connection-based syntax,
D-041's tangent-slide collision) were reversed once real use disagreed with the design,
rather than defended past the point of being right. That combination — cheap experiments,
and a real willingness to undo a decision once it's tested and found wanting — is a good
sign for a project whose core mechanism (a novel language, primarily AI-authored) is still
this actively being discovered.

## Recommendation

Before the next feature: get this running in an actual browser and click through the
shipped examples once, end to end (risk #1) — everything else on this list is easier to
reason about once that baseline exists. Alongside or shortly after that, give the external-
module loading path (#2) an explicit decision rather than letting it stay an open question
indefinitely on a live, public URL. The rest (constraint-stacking, language versioning, file
size, documentation volume) are real but not urgent — worth a deliberate look the next time
work in that area comes up, not a reason to stop and fix them now.
