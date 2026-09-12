# Technical Debt

Numbered `S-x` (Gap) entries — code-quality, consistency, and correctness-risk items in the *existing* codebase that are harder to maintain or riskier than they should be, kept in mind and addressed going forward. Distinct from `F-x` (feature/design questions not yet built, `open-questions.md`) and `D-x` (decisions already made and built, `decisions.md`).

This file holds only *currently open* debt. An entry is removed once it's resolved — the fix itself is recorded as a `D-x` decision in `decisions.md`, not narrated here. Entries aren't a chronological log of when something was found; they're numbered for stable cross-referencing, and a number is retired (not reused) once its entry is resolved and removed. When new debt is found, prefer folding it into an existing related entry over adding a new number — add a new one only for something genuinely distinct.

## `docs/interactivity-module.js`

## S-007 `handleRendered` is a god-function with six unrelated responsibilities

Recomputes bboxes; runs the full plan validation pass; resets/manages pan-zoom `viewState`/`lastCoreFit`; updates the scale bar; toggles the selection class *and* calls `dimOccludingElements` (D-164, replacing the older `bringToFront` DOM reorder); refreshes the stack-hint badge and reapplies `stacked-dim` classes — all in one callback with no sub-function boundaries, despite its own name suggesting "reapply overlay state after a render." (Was seven — D-107 removed the connect/disconnect icon-markup responsibility outright along with the icons themselves, not just moved it elsewhere.)

## S-008 Validation checkers and drag-time clamps duplicate the same scope logic independently

`checkContainment` and `clampToContainment` each re-derive "rect child, D-032 scope" on their own — a comment even acknowledges "reuses `clampToContainment`'s own scope exactly" — but the actual condition is copy-typed twice, so the two can silently drift apart.

## S-035 A `hidden` subtree still has its geometry computed and validated

`computePositions` and the load-time validation pass (`checkContainment`/`checkCollisions`) walk the *full* tree unconditionally — a `hidden: true` node (D-112) renders nothing, but its position is still resolved and it can still trigger a containment/collision violation naming an element that's currently invisible on screen. Deliberately deferred when `hidden` was built: fixing it means threading a "skip this subtree" check through several existing tree-walks for a case that's cosmetic today (a stray validation message), not a functional bug.

## S-040 `findOwnPropertyLine`'s line-anchored regex can't find a property on a single-line-formatted element

Found live while building D-150: `findOwnPropertyLine` (used by `setPlacementInside`/`toggleFlush`/`clearPlacement`/`reparentElement` to locate `placement`/`flush`) matches `^([ \t]*)key\s*:.*$` with `/gm` — anchored to a physical *line* start. Every shipped example writes one property per line, but nothing in the grammar requires that; an element written entirely on one line (`element x { shape: "rect" ... placement: "inside" ... }`) has `placement:` sitting mid-line, never at a line start, so the regex silently finds nothing. Every caller above then silently no-ops on that property instead of erroring — `clearPlacement`/`reparentElement` still complete (the reparent/position-rewrite itself isn't affected), just leaving a stale `placement`/`flush` behind on a single-line element specifically. Not fixed in D-150 (out of scope for that pass, and shared by D-148 before it) — would need `findOwnPropertyLine` to locate a property by token position instead of a per-line regex.

## `docs/index.html` (core)

## S-016 Two independent recursive interpreters over the same AST must be kept in sync by hand

`evalAst` and `linearize` both walk `num`/`neg`/`bin`/`path` nodes with separate per-operator logic. Adding a new operator or AST node type requires updating both, with nothing enforcing that they stay consistent.

## S-018 Storage access repeats an ad hoc try/catch shape with no shared helper

`savePlansList`, `loadPlansList`, `setActivePlan`, `setCloudSession`, `cloudToken`/`cloudUsername` each independently wrap `localStorage`/`sessionStorage` calls in their own `try { } catch (e) { }`. Nothing reminds a future storage read/write elsewhere that this guard is needed.

## S-019 `render()` re-derives geometry `renderShape()` already computed, instead of one shared bbox pass

`bboxes` is only populated for rects inside `renderShape`; `render()` then separately re-walks the whole tree and recomputes polyline/polygon points and circle radii a second time just to fold their extents into the fit box. Any future shape type will likely repeat the same oversight.

## S-020 `nodeDragEdits` solves "literal vs. expression" differently for `position` than for `points`

A `position` coordinate that's an expression attempts `trySolveBackward` to rewrite the source; a `points` entry that's a corner-ref function never attempts anything and just warns "drag that corner directly." Plausibly a deliberate limit (corner refs aren't linear-solvable the same way), but it's undocumented, so it reads as an inconsistency rather than a designed boundary.

## S-021 `checkRealism` recomputes the whole tree's positions from scratch per candidate drag position

Called on every proposed move during an active drag, over the entire plan every time. Fine at today's plan sizes; a likely bottleneck as plans grow (see also F-007, drag performance at scale).

## S-022 Value-kind tagging is purely structural/duck-typed

`isEditable` (`"start" in v`) and `numOf` (`"value" in v`) rely on ad hoc shape checks rather than any explicit tag or class. Any future value object that happens to carry a `start` or `value` property would silently be misidentified as a literal token.

## Secondary modules

## S-023 `annotations-module.js` re-derives geometry core already computed, with no enforced link

`annotationMarkupForNode`'s own comment admits it "mirrors core's own `renderShape` branching exactly," re-deriving rect corners and polygon/polyline absolute points from scratch since core doesn't expose per-node corner lists after rendering. Any future shape-branch change in `renderShape` can silently desync this copy — nothing links the two.

## S-025 Auto-load policy is applied inconsistently across modules that share the same justification

`grid-module.js` is auto-loaded specifically so `settings.grid` isn't silently inert for an author who didn't know to declare the module. `wall-with-door-module.js` is equally settings/property-driven (`compose: "wallWithDoor"`) but is *not* auto-loaded — an undeclared `compose` would presumably also silently do nothing, the exact gap the grid module's own auto-load exists to avoid.

## S-027 `wall-with-door-module.js`'s synthesized child ids have no collision check against real sibling ids

`segment`'s hand-built ids (`${node.id}_wall_a`, etc.) aren't checked against existing sibling ids before use. If an author's own plan happens to declare a colliding id, this could silently corrupt drag targeting the same way F-028 describes for hand-authored duplicates — and this path is exempt from the load-time duplicate-id check, since these nodes are synthesized after parsing, not part of the parsed source. Untested edge case, not confirmed broken.

## S-036 Text-splice source-editing helpers are now duplicated across two modules

`toLineSpan`/`applyEditsDescending`/`findOwnPropertyLine`-shaped helpers live privately inside both `interactivity-module.js` and (D-112) `hierarchy-module.js` — the same small "read/write a plan-text edit" primitives, copied rather than shared, since neither `window.PlanCore` nor any other cross-module channel exposes them. Accepted as the right call the first time (matching S-023's own "a module brings its own copy" tradeoff with core's geometry) but a second instance of the identical duplication is exactly the "wait for a second use, then share" signal this project's own refactor philosophy (D-095/D-096) watches for — worth hoisting onto `window.PlanCore` if a third module ever needs the same capability.

## S-028 `wall-with-door-module.js`'s own composite doesn't account for a non-zero `position`

The module's own comment states the composite's `position` isn't factored into its `from`/`to` endpoints, "left out to keep this focused." A `wallWithDoor` element nested somewhere with a non-zero `position` would likely place its segments wrong — self-admitted, unaddressed.

## Project structure / process

## S-033 Static assets are physically duplicated across many directories

`favicon.ico`, `favicon.svg`, and `apple-touch-icon.png` each exist as separate physical copies across `docs/`, `homepage/`, every `homepage/blog/<post>/` directory, `homepage/impressum/`, `profile/`, and `site-docs/`. A future favicon change means updating (and re-deploying) every copy by hand; missing one silently leaves a stale icon on that one section indefinitely.

## S-034 `documentation/` and `site-docs/` are close enough in name to require an explicit disclaimer

`README.md` itself has to clarify that `site-docs/` (the public, human-facing documentation page) is "Not to be confused with `documentation/` below, the AI-facing language spec." Needing that disclaimer at all is itself a naming smell — a newcomer skimming folder names alone, without reading the README closely, would reasonably guess wrong about which one is which.
