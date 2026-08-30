# Modules

Reference documentation for 2DPlaner's module system — how a plan loads one, what it's
allowed to do, and the concrete `window.PlanCore` API it gets to do it with. Unlike
[planning/](../planning/), which records *why* each choice was made, this document
describes *what's actually built*. Companion to [language.md](language.md) (the plan
language itself) and [architecture.md](architecture.md) (the surrounding app). Keep in sync
with [planning/decisions.md](../planning/decisions.md), which is the source of truth if the
two disagree.

**Status:** built and in production use. The mechanism (declaring a module, internal vs.
external resolution, load-once caching) was validated in
[Prototypes/12-module-loading/](../Prototypes/12-module-loading/); the concrete
`window.PlanCore` API below was designed for and validated by
[Prototypes/14-interactivity-module/](../Prototypes/14-interactivity-module/)'s
interactivity module (D-031) and is unchanged since. [docs/](../docs/) — the actual hosted
app — reuses that architecture verbatim: `docs/index.html` is core (parse/render only),
`docs/interactivity-module.js` is the one module it ships, loaded exactly like any other.

## What a module can do

Three things, per D-011 — and nothing outside them, since the language's own primitive set
(Element, Connection — see [language.md](language.md#core-primitives)) is meant to stay
fixed and minimal:

1. **New interactivity** — drag, selection, connect/disconnect, hover, context menus, and
   so on. This is what `docs/interactivity-module.js` does; see below.
2. **New rendering** — teaching the renderer a new `shape` kind. See "Adding a shape kind"
   below.
3. **New reusable, higher-level compositions** built from Element and Connection (e.g. a
   "wall with a door" building block a plan could drop in as one thing) — not a new
   fundamental primitive. **Nothing has actually exercised this yet.** Every module built so
   far (12/13's `star-tool`, 14/15's and `docs/`'s interactivity module) does #1 or #2; F-002
   is still open on what an API for #3 would even need to expose.

## Declaring a module

A plan loads a module by name in its **preamble**, before the root element (D-020):

```
module "wall-tools"                            // internal, resolved by name
module "https://example.com/campervan-kit.js"  // external, fetched from the URL
```

One statement form covers both. Whether a name is internal or external is decided purely by
its shape (`isUrlLike()` in the core): it's external if it contains `/`, ends in `.js`, or
contains `://` — anything else is looked up in a small built-in registry
(`INTERNAL_MODULES`). **That registry is currently empty in `docs/`** — nothing ships as a
built-in module; every module a plan uses today is external, fetched via a dynamically
created `<script src>` tag.

**Every plan in the hosted app gets the interactivity module whether it declares one or
not.** `docs/`'s `loadPlan()` checks the source text for an existing
`module "…interactivity-module.js"` declaration and prepends one if it's missing (D-034) —
D-020's own loading mechanism stays opt-in per plan; this is `docs/`'s own convenience on
top of it, not a change to how modules work.

## Trust model

**External modules are trusted by default — no sandboxing.** Loading one runs that code
directly in the page: no sandboxed iframe or worker, no permissions prompt, no allowlist.
This matches D-003 (an AI is the primary author, with a technical human reviewing the
result) — closer to a developer choosing an npm package than an end user clicking an
untrusted link. Whether that model still holds if the audience broadens is F-009, open.

## Loading and lifecycle

A module is fetched/run **at most once per session**: `loadedExternal`/`loadedInternal`
track what's already been loaded, and a module already in that set is skipped on a later
render even if still declared.

**Removing a module's declaration actually deactivates it.** Every `rerender()` diffs the
plan's current module list against every module that has registered a cleanup
(`deactivateRemovedModules()`); anything no longer declared has its cleanup run and is
evicted from the loaded-module cache, so declaring it again later loads it fresh rather than
silently doing nothing. This exists because a module with real side effects — event
listeners, injected DOM/CSS, in-memory state — doesn't stop existing just because a later
edit's module list omits it; a stateless module (a shape renderer with nothing to undo)
doesn't need this, but every module gets the same treatment for consistency rather than
leaving activation semantics dependent on what kind of module it happens to be.

A module registers its own teardown with `core.registerModuleCleanup(name, cleanupFn)` —
`docs/interactivity-module.js` uses this to remove every event listener it added (by the
same named-function reference it was added with), remove its injected `<style>`/context-menu/
scale-bar/fit-button DOM, disconnect its `ResizeObserver`, unsubscribe from `onRendered`, and
clear its own drag/selection/zoom state.

## The core API: `window.PlanCore`

Everything a module gets. Core owns parsing and rendering only — selection, drag, hover, and
every other interactive behavior live entirely in a loaded module, never in core itself.

| Member | What it does |
|---|---|
| `parse(src)` | Plan source text → `{root, nodesById, modules, settings, connections}`. Throws on a syntax error. |
| `render(program)` | Pure `program` → `{svg, bboxes}`. No selection/interactivity state — a plain re-render never needs to know whether anything is selected. |
| `numOf(v)` | Unwraps an editable-literal object (or an expression function) to its plain number value. |
| `isEditable(v)` | True if `v` is a plain literal (`{value, unit, start, end}`) — i.e. safe to rewrite in place via a source-text splice, as opposed to an expression. |
| `formatNumber(value, unit)` | The reverse of parsing a literal: a number back into plan-source text, handling the cm/m unit and rounding. |
| `computePositions(node, parent, offset, positions)` | Recursively resolves absolute `[x, y]` positions for a node and its descendants into the `positions` map. |
| `computeCornerUsers(node, cornerUsers)` | Recursively collects, per corner-element id, which other elements' `points` reference it (D-018's shared corners) — needed to know what else moves when a shared corner is dragged. |
| `resolvePointAbs(pt, ownAbs, positions)` | Resolves one `points` entry — a literal `[x, y]` pair or a sibling-corner reference — to an absolute coordinate. |
| `connectedNodeIds(startId, connections)` | Every node id reachable from `startId` by following `connection` edges — the whole connected component, not just direct neighbors. |
| `polygonSelfIntersects(pts)` | True if the given absolute `[x, y]` point list, taken as a closed polygon, self-intersects (a "bowtie" — the check behind `allowSelfIntersectingPolygons`, D-033). Exposed so a module can validate a *rigid, multi-point* move as one whole before generating edits — core's own per-node realism check only ever evaluates one node's proposed position at a time, which misreads a shape's own corners all moving together as the shape deforming (D-036's correction). |
| `nodeDragEdits(node, parent, dx, dy, base, cornerUsers, warnings)` | The source-text edits needed to shift one node's own `position` (or literal `points`) by `(dx, dy)`. Solves backward through an expression-backed position (D-012) rather than overwriting it. Pushes to `warnings` — not `edits` — for anything it can't handle itself, notably a `points` entry that's a corner reference (D-018) rather than a literal pair; `docs/interactivity-module.js`'s own `dragEditsFor()` exists specifically to work around that case for whole-shape dragging (D-036). |
| `rootEl` / `sourceEl` / `dragmsgEl` / `modlogEl` | DOM mount points: the SVG's parent container, the `<textarea>` holding plan source, and two status-line elements for drag warnings / module log messages. |
| `M` | The meters-to-pixels scale the renderer's own SVG coordinates use. Not necessarily the SVG's actual on-screen scale once CSS resizes it — see D-034's `currentPxPerMeter()` in the interactivity module for why a drag has to account for that separately. |
| `rerender(opts)` | Re-parses `sourceEl.value`, re-runs the module-list diff (see Lifecycle), re-renders, and notifies every `onRendered` callback. `opts.preserveViewBox: true` keeps the current auto-fit viewBox instead of re-fitting to the new content — a drag's own repeated re-renders pass this so the camera doesn't jump mid-drag; a real content edit doesn't, so the view re-fits (D-031). |
| `onRendered(cb)` | Registers `cb(program, result)` to run after every `rerender()`. Returns an unsubscribe function — required for any module with persistent state, or its callback keeps firing after the module has been torn down. |
| `registerModuleCleanup(name, cleanupFn)` | Registers this module's own teardown; see Lifecycle above. |

Notably **not** in this API, on the judgment that it's interactivity-specific rather than
something core should need to know exists: adjacency/contact-point geometry, connect/
disconnect icon markup, the context menu's own DOM/CSS, generic source-text splice helpers.
`docs/interactivity-module.js` brings its own copies of all of it.

## Adding a shape kind

The renderer falls back to `window.PlanModules[shape]` for any `shape` value it doesn't
recognize itself (`rect`/`circle`/`polyline`/`polygon`): `window.PlanModules[shape](node,
ownAbs, M, { numOf, idAttr })`, expected to return the SVG markup for that node. A module
adds a shape kind by assigning to that global before the plan renders. Validated by
[Prototypes/12-module-loading/](../Prototypes/12-module-loading/)'s `star-tool` (internal)
and an external equivalent; **no module currently shipped in `docs/` uses this** — it's
tested, carried-over machinery, not something the hosted app currently exercises.

## The interactivity module

`docs/interactivity-module.js` is the one module the hosted app actually ships, and (per
D-034) the one every plan gets by default. It adds, entirely on top of the API above:

- **Drag-to-move** — direct nodes, expression-backed positions (solve-backward, D-012),
  connection propagation (D-014) with structural ancestor/descendant pairs skipped so a
  nested-and-connected child doesn't move at double the parent's rate (D-036), the
  edge-slide mechanic for a point resting on a connected rect (D-032), and corner-reference-
  aware whole-shape dragging for a polygon/polyline built from shared corners (D-036).
- **Click-to-select**, with connect/disconnect icons rendered on top of the selected
  element's touching neighbors, snapping the moved element flush on connect (D-018).
- **Hover previews** — which other elements share a dragged corner, which elements a
  connection links.
- **The right-click context menu** (D-030) — currently just Delete Element.
- **Zoom, pan, a scale bar, and a Fit button** (D-035) — mouse-wheel zoom-to-cursor,
  click-drag pan on empty canvas, a bottom-right scale bar recomputed on every render/zoom/
  pan/resize, and a button to reset back to core's own auto-fit view.

## Known seams

Real integration friction found while actually building this split (D-031), not smoothed
over by treating "core vs. module" as cleaner than it is:

- **Icon z-order is fixed, not composable.** The module's connect/disconnect icons are
  appended after core's *entire* render output, which already ends with anchors painted
  last — icons end up on top of anchors, with no hook for a module to insert content
  *between* two of core's own render passes.
- **A core-owned CSS rule needed a module-side override, not core awareness.** Suppressing
  the label hover-reveal during a drag needed the module to inject a higher-specificity rule
  scoped to its own `dragging` class, rather than core ever mentioning drag/interactivity
  state in its own stylesheet.
- **`rerender(opts.preserveViewBox)` is an explicit flag because core can no longer infer
  the reason for a re-render itself** — with one shared entry point for every caller, core
  has no way to tell "a drag's own repeated re-render" from "a real content edit" unless the
  caller says so.

None of these block anything currently built; they're constraints a future module author
needs to know about, not open bugs.
