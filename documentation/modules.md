# Modules

Reference documentation for Planagonia's module system — how a plan loads one, what it's
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
app — reuses that architecture verbatim: `docs/index.html` is core (parse/render only).
Documented here in depth: `docs/interactivity-module.js` (D-031),
`docs/annotations-module.js` (D-039), `docs/code-highlight-module.js` (D-043),
`docs/hierarchy-module.js` (D-112), `docs/grid-module.js` (F-014), and
`docs/wall-with-door-module.js` (D-046/D-071) — the first three, plus grid, force-injected
into every plan; `hierarchy-module.js` loaded on demand instead (D-126, see below);
`wall-with-door-module.js` needs an explicit declaration like any external module (S-025).

## What a module can do

Three things, per D-011 — and nothing outside them, since the language's own primitive set
(Element, Connection — see [language.md](language.md#core-primitives)) is meant to stay
fixed and minimal:

1. **New interactivity** — drag, selection, connect/disconnect, hover, context menus, and
   so on. This is what `docs/interactivity-module.js` does; see below.
2. **New rendering** — either teaching the renderer a whole new `shape` kind (see "Adding a
   shape kind" below), or, as of D-039, layering additional content onto shapes core already
   knows how to render — `docs/annotations-module.js`'s label/dimensions/edgeLengths text is
   the first case of this second kind: nothing new to draw the *shape* itself, only to
   annotate it after the fact.
3. **New reusable, higher-level compositions** built from Element and Connection (e.g. a
   "wall with a door" building block a plan could drop in as one thing) — not a new
   fundamental primitive. **Nothing has actually exercised this yet.** Every module built so
   far (12/13's `star-tool`, the interactivity and annotations modules) does #1 or #2; F-002
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

Community-published external modules (F-045) are listed at
[planagonia.com/modules](https://www.planagonia.com/modules/) — check there for an
existing URL before writing a new module from scratch.

**Every plan in the hosted app gets every `AUTO_MODULES` entry whether it declares them or
not, on every render.** Currently `["grid-module.js", "annotations-module.js",
"interactivity-module.js", "code-highlight-module.js"]`, force-injected by `docs/`'s own
`rerender()` regardless of what the plan's own text says (D-034, extended by D-039 and
D-043) — D-020's own loading mechanism stays opt-in per plan; this is `docs/`'s own
convenience layered on top of it, not a change to how modules work generally. The order is
deliberate, not alphabetical: annotations has to finish registering its `onRendered`
callback before interactivity does, so its labels land in the SVG *before* interactivity's
own icons/scale-bar/fit-button (see "The annotations module" below); code-highlight has to
run after interactivity since it reads a signal interactivity's own render pass sets (see
"The code-highlight module" below). This force-injection is unconditional and silent —
`docs/`'s own plan-switcher and examples don't write a `module "..."` line for any of these
into a plan's own text either (D-126: doing so used to be `withAutoModules()`'s whole job,
removed once it became clear the lines it wrote were purely decorative, since force-
injection never actually depended on them being present).

**`hierarchy-module.js` and `wall-with-door-module.js` both ship but are deliberately *not*
in `AUTO_MODULES` (D-112, D-126)** — neither is force-loaded on every render.
`wall-with-door-module.js` needs an explicit `module` declaration like any external module
(S-025's own still-open note: nothing warns an author if `compose: "wallWithDoor"` is used
without one). `hierarchy-module.js` is loaded on demand instead: `docs/`'s own header
"Layers" button loads it the first time the panel is opened — or immediately, if a plan's
own text happens to declare it explicitly, exactly like any other module. Both are still
trusted the same as any `AUTO_MODULES` entry (`TRUSTED_MODULES`, below) — they just aren't
force-loaded.

## Trust model

**External modules run unsandboxed — no iframe, no worker, no permissions system.** Loading
one runs that code directly in the page with full access to it. This matches D-003 (an AI
is the primary author, with a technical human reviewing the result) — closer to a developer
choosing an npm package than an end user clicking an untrusted link. Whether that model
still holds if the audience broadens is F-009, open.

**One real gate, added directly in response to project-overview.md's risk review, not a
sandbox:** the first time a session would load a module that isn't in `TRUSTED_MODULES`
(`AUTO_MODULES` plus `hierarchy-module.js`, see above), `ensureModulesLoaded()` shows a
native `confirm()` naming the exact URL before fetching/running it. Declining throws
instead of loading — the plan simply doesn't render past that point, same as any other
unresolved error (D-015). This doesn't make the code any safer to run once accepted (still
no sandboxing, still full page access) — it only turns "runs automatically because a plan
declared it" into a deliberate per-URL choice, asked once per session (`loadedExternal`'s
existing dedup) and remembered if declined too (`declinedExternal`, cleared only if the
module's declaration is actually removed from the plan and re-added, or the page reloads —
otherwise a declined module would re-prompt on every keystroke, since `rerender()` runs on
every edit). Every `TRUSTED_MODULES` entry never prompts, however it was loaded —
force-injected, written out explicitly, or (`hierarchy-module.js` only) triggered by its
own header button — they all run with the same trust as core itself.

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
| `tokenize(src)` | Plan source text → the raw token list `parse()` itself starts from (each with `{type, value, start, end}`). Skips whitespace and comments rather than emitting a token for them — a module wanting the *entire* text accounted for (D-043's syntax highlighter, reconstructing exact character positions) has to fill those gaps back in from the source itself. Throws only on a genuinely invalid character, not a grammar error — usable even while the text doesn't currently parse. |
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

## The annotations module

`docs/annotations-module.js` (D-039) renders `label`/`dimensions`/`edgeLengths` (D-026,
D-038) — computed, read-only display facts about an element's own geometry. It was split
out of core (which used to render these directly) specifically because none of them are
required for the two core primitives to function, and because a read-only embed (D-024)
might reasonably want dimension labels with **no** drag/select/connect at all — a second,
independently loadable module makes that combination possible; folding this into the
interactivity module wouldn't have.

**Uses no core API beyond what D-031 already exposed.** `onRendered` to run after core's
own render, `computePositions`/`resolvePointAbs` to re-derive each element's absolute
geometry, `numOf`/`M` to read and scale values the same way core does. Nothing about this
module required a new core hook — it's the same "read the rendered result, layer more SVG
on top" pattern the interactivity module already used for its icons and scale bar, just
applied to a different kind of overlay. Since core's own parser never special-cased these
property names to begin with (`props[key] = parseValue()` accepts any key), moving their
*rendering* into a module needed no parser changes either — only moving the interpretation
of properties that were already there.

**Has to insert each label immediately after its own shape element, not append them all at
the end.** Core's CSS hover-reveal (`svg .obj:hover + .annotation[data-show="hover"]`)
depends on an annotation being its shape's *immediate* next DOM sibling — every shape is a
flat sibling directly under `<svg>`, not nested per element, so a single `insertAdjacentHTML`
at the end of the SVG would put every annotation after every shape instead of each one
after its own. The module walks the same tree core rendered and inserts each element's
annotation via `querySelector('[data-id="…"]')` + `insertAdjacentHTML("afterend", …)`,
recreating the exact interleaving core used to produce directly by rendering shape and
annotation together in one pass.

## The code-highlight module

`docs/code-highlight-module.js` (D-043) does two things to the code pane: colors syntax
(keywords, strings, numbers, comments) and marks the currently selected element's own
source span. Neither needed a new API shaped specifically for this module — `tokenize()`
(above) already existed inside core for `parse()`'s own use, and only needed exposing;
`interactivity-module.js` already recomputes a `.selected` CSS class on every render, and
just also sets `core.rootEl.dataset.selectedId` alongside it — a loose, optional signal
this module reads, with no idea code-highlight-module.js exists.

**A plain `<textarea>` can't color individual characters, so this overlays one, invisible,
on top of a colored `<pre>` backdrop kept in exact pixel sync** — the standard lightweight
alternative to a real code-editor dependency (CodeMirror, Monaco), in keeping with D-034's
"zero dependencies, plain static files" scope. The textarea itself is never replaced, only
moved into a new wrapper `<div>` alongside the backdrop — every other module's reference to
`core.sourceEl` (the same DOM node throughout) and every listener already attached to it
keep working untouched. Getting the two boxes to align pixel-for-pixel matters more than it
sounds: font, padding, and border are read from the textarea's own *computed* style rather
than hardcoded a second time, specifically so they can't silently drift out of sync with
`docs/index.html`'s own CSS later — except the wrapper's `height`, deliberately kept as a
literal `"100%"` rather than copying the computed (already-resolved-to-pixels) value, which
would otherwise freeze the wrapper at whatever height the page happened to be on module
load and stop tracking the pane's real height across a later window resize.

**`tokenize()` skips whitespace and comments entirely — reconstructing them is this
module's own job, not core's.** Core's lexer never emits a token for either (matching how
`parse()` itself just wants to skip past them); the backdrop still needs the *exact* source
text, character for character, or the two boxes drift out of alignment as soon as the text
wraps differently. The gaps between consecutive real tokens are filled back in from the raw
source, with a `//`-to-end-of-line pattern inside a gap colored as a comment separately
from plain whitespace around it.

**Selection highlighting only ever reflects the *last successful* parse.**
`core.onRendered` fires only after a parse that actually succeeds (D-031); mid-edit, while
the text is temporarily invalid, the highlighted span simply stays wherever it last was,
rather than disappearing and reappearing on every keystroke of an in-progress edit.

**Reacts to the selection signal directly via a `MutationObserver`, not only through
`onRendered`.** The signal (`core.rootEl.dataset.selectedId`) is a plain DOM attribute set
by `interactivity-module.js`'s own render pass — relying solely on this module's
`onRendered` callback also having fired by then means trusting an ordering assumption
between two independently loaded modules that turned out not to be reliably observable
(reported as the highlight not appearing at all). Watching the attribute directly with a
`MutationObserver` reacts to the one thing that actually has to change for a re-highlight
to be needed, regardless of which module's callback fired when — `onRendered` is still
kept too, since a real edit still needs to refresh the *coloring*, not just the selection
mark.

**Scrolls the selected element's span into view, once per selection change — not once per
render.** Every render reaches the same `refresh()` (a drag's own repeated re-renders
included), so scrolling unconditionally there would fight a user dragging an
already-selected element, yanking the code pane's scroll position every frame. Guarded by
comparing the current `selectedId` against the previous one. Positioned via
`marked.scrollIntoView()` — a hand-computed target `scrollTop` (from the highlight span's
own `offsetTop`/`offsetHeight`) was tried first and reported not to work; `offsetHeight` on
a *multi-line* inline element (exactly what a selected element's span usually is) is
inconsistently defined across browsers, typically describing one line box rather than the
true multi-line extent, a plausible explanation even though nothing wrong turned up
reviewing that math directly. `scrollIntoView()` scrolls `backdrop` (the element's own
nearest positioned ancestor) rather than `textarea` (the two are only ever kept in sync
manually, not natively linked) — the result is read back onto `textarea` immediately after.

**Selecting a parent marks only the parent's own text, not its children's — `ownRanges()`,
not the element's raw `[start, end)`.** A parent's own span (`node.start` to `node.end`)
textually *contains* every child's own declaration too, so highlighting it naively would
paint a child's text as "selected" right along with the parent's, just because it happens
to sit inside the parent's braces. `ownRanges()` walks the parent's direct children (already
in source order) and returns whatever's *between* them instead — before the first child,
between consecutive children, after the last — each becoming its own separate
`tok-selected` wrapper. A leaf element (no children) is the degenerate case: one range,
identical to its full span, unchanged from a single-child-free element's original behavior.

**Selection background is one wrapper per contiguous range, not a class on every token
inside it.** An earlier version put a `tok-selected` class directly on each individual
token/gap `<span>` within the selection — syntactically fine, but many adjacent inline
elements each painting their own identical background color show a faint seam at every
boundary between them, a real rendering artifact that read as a thin border around every
separate word (reported directly). `colorRange()` now renders the ordinary syntax coloring
with no selection awareness at all; `renderHighlighted()` wraps each of `ownRanges()`'s
disjoint ranges in exactly one outer `tok-selected` span around that coloring, so there's
only ever one background-painting element per range, nothing for a seam to form between.

## The hierarchy module

`docs/hierarchy-module.js` (D-112) renders the full element tree — every parent, expandable
to its children — into `#hierarchy-panel`, lets a viewer show/hide any subtree (writes/
clears `hidden`, a new *core*-level rendering property `renderShape` itself checks — see
[language.md](language.md#element)) and reorder siblings (swaps two adjacent declarations,
changing paint order).

**The one module so far whose own DOM slot core provides empty and stable, rather than the
module creating everything itself.** Every other module either overlays content on top of
`#plan-root` (interactivity's icons/scale bar, annotations' labels) or moves an existing
core element into a new wrapper at runtime (code-highlight's own textarea wrap). A layers
panel needs its own dedicated space *beside* the code/viewer split, decided upfront in
`docs/index.html`'s own layout rather than injected — but the module still owns everything
that happens *inside* that slot end to end (the tree markup, the click handling, the
source-text edits), exactly like core owns `.viewer-pane` as an empty container that its
own renderer happens to fill. Whether the panel is open at all is core's own concern too (a
header button toggling a class + `localStorage`, not plan content) — the module doesn't
know or care whether it's currently visible, it just keeps `#hierarchy-panel`'s content
current on every render regardless.

**Lists siblings in *reverse* declaration order — last-declared (topmost paint order,
D-110) shown first/topmost** — so "the row at the top of the list is the thing in front"
reads the way every layers panel already does elsewhere (Photoshop/Illustrator/Figma).
Reorder button semantics follow directly from the reversal: "▲" (toward the top of the
list, more toward the front) swaps a node with its *next-higher-index* array neighbor;
"▼" with the *next-lower-index* one.

**Brings its own small, private text-splice helpers (`toLineSpan`, `applyEditsDescending`,
`findOwnPropertyLine`) rather than sharing `interactivity-module.js`'s private copies of
the same shape.** Not in the core API (see the list above) and modules can't reach into
each other's closures — the same "brings its own copy" tradeoff `annotations-module.js`
already has with core's own geometry, now a *second* instance of it. Tracked in
[planning/tech-debt.md](../planning/tech-debt.md) as a real signal worth revisiting (a
third module needing the identical capability would make hoisting it onto
`window.PlanCore` clearly worth the migration), not fixed as part of building this module.

## The grid module

`docs/grid-module.js` (F-014) draws a checkered or line background from
`settings { grid: { size: 1, type: "checker" } }` (`type` defaults to `"checker"`; the only
other value is `"lines"`) — a scale reference only, no interactivity dependency at all, not
even selection state. `size` also drives grid-snapped dragging and resizing
([language.md](language.md), F-031) via `interactivity-module.js` reading the same
`settings.grid.size` directly — this module has no involvement in that half at all, purely
display.

**A single `<rect>` filled with a repeating `<pattern>`, not individually drawn lines/tiles
covering the viewBox.** SVG's own `patternUnits="userSpaceOnUse"` tiles the pattern
automatically; the module only ever computes one tile's own markup (`checkerTile`/
`linesTile`, both returning a tile size plus its inner markup) and one bounding `<rect>` to
fill with it.

**The bounding rect is a deliberate, finite boundary — 5x the fit-to-content box, centered
on it — not true infinite tiling.** Comfortably covers this app's own bounded zoom-out (2x,
`interactivity-module.js`) plus realistic panning, recomputed fresh on every render from the
current viewBox rather than kept in sync with pan/zoom on every frame — reaching into
`interactivity-module.js`'s own wheel/drag handlers to do that continuously is exactly the
cross-module dependency this module exists to not need.

**Always inserts itself as the SVG's very first child, `afterbegin`, regardless of callback
registration order** — the grid has to paint behind every shape unconditionally, and unlike
`annotations-module.js` (which has to run *after* `interactivity-module.js`, see above) its
own position in `AUTO_MODULES`'s list genuinely doesn't matter for stacking.

**Auto-loaded** (`AUTO_MODULES`, `docs/index.html`) specifically so `settings.grid` isn't
silently inert for a plan author who didn't know to declare the module — the same reasoning
`annotations-module.js`/`interactivity-module.js`/`code-highlight-module.js` are auto-loaded
for. `wall-with-door-module.js` (below) is equally settings/property-driven but *not*
auto-loaded, a known inconsistency ([planning/tech-debt.md](../planning/tech-debt.md)
S-025).

## The wall-with-door module

`docs/wall-with-door-module.js` (D-046, D-071) is F-002's third module promise — a reusable,
higher-level building block "composed from Element and Connection," not a new fundamental
primitive:

```
element w { compose: "wallWithDoor", from: [0m,0m], to: [5m,0m], doorAt: 2m, doorWidth: 0.9m }
```

expands into three ordinary `polyline` children (`w_wall_a`, `w_door`, `w_wall_b`) — what
this app's own `apartment` example still writes by hand as four corner elements plus three
polylines (D-018's shared-corner pattern) for the identical visual.

**Runs via `core.registerBeforeRender`, not `core.onRendered`, the only module here that
does** — its synthesized children are pushed into the tree *before* core ever renders, so
rendering itself needs zero composition-specific code: the expanded polylines are
indistinguishable from ones typed directly into the plan, drag-editable the same way
(`interactivity-module.js`'s own `composeDragEdits`, a per-composition-type backward-solve
this module's own expansion has to stay the mirror image of).

**Needs an explicit `module` declaration — the one built-in module that isn't force-loaded
or triggered by a button.** Unlike the grid module above, nothing currently warns a plan
author if `compose: "wallWithDoor"` is used without declaring this module at all; it would
simply do nothing ([planning/tech-debt.md](../planning/tech-debt.md) S-025's own still-open
note).

**Known limitation, self-admitted, not yet fixed:** the composite's own `position` isn't
factored into `from`/`to` — both are treated as already being in the composite's parent's
own local space. A `wallWithDoor` element nested somewhere with a non-zero `position` will
likely place its segments wrong ([planning/tech-debt.md](../planning/tech-debt.md) S-028).

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
- **A module that injects markup tied to CSS adjacent-sibling selectors has to insert it in
  the right place, not just anywhere in the SVG** (found building the annotations module,
  D-039). Core's own `.obj:hover + .annotation` hover-reveal rule only works if the injected
  element is literally the next DOM sibling of the shape it's about — appending everything
  in one batch at the end of the SVG (simpler to write) silently breaks that rule for every
  element but the last. There's no core hook that would make this automatic; a module doing
  this has to walk the tree and place each insertion itself.

None of these block anything currently built; they're constraints a future module author
needs to know about, not open bugs.
