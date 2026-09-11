# Technical Debt

Numbered `S-x` (Gap) entries — code-quality, consistency, and correctness-risk items in the *existing* codebase that are harder to maintain or riskier than they should be, kept in mind and addressed going forward. Distinct from `F-x` (feature/design questions not yet built, `open-questions.md`) and `D-x` (decisions already made and built, `decisions.md`).

This file holds only *currently open* debt. An entry is removed once it's resolved — the fix itself is recorded as a `D-x` decision in `decisions.md`, not narrated here. Entries aren't a chronological log of when something was found; they're numbered for stable cross-referencing, and a number is retired (not reused) once its entry is resolved and removed. When new debt is found, prefer folding it into an existing related entry over adding a new number — add a new one only for something genuinely distinct.

## `docs/interactivity-module.js`

## S-007 `handleRendered` is a god-function with six unrelated responsibilities

Recomputes bboxes; runs the full plan validation pass; resets/manages pan-zoom `viewState`/`lastCoreFit`; updates the scale bar; toggles the selection class *and* calls `bringToFront` (a DOM reorder); refreshes the stack-hint badge and reapplies `stacked-dim` classes — all in one callback with no sub-function boundaries, despite its own name suggesting "reapply overlay state after a render." (Was seven — D-107 removed the connect/disconnect icon-markup responsibility outright along with the icons themselves, not just moved it elsewhere.)

## S-008 Validation checkers and drag-time clamps duplicate the same scope logic independently

`checkContainment` and `clampToContainment` each re-derive "rect child, D-032 scope" on their own — a comment even acknowledges "reuses `clampToContainment`'s own scope exactly" — but the actual condition is copy-typed twice, so the two can silently drift apart.

## S-035 A `hidden` subtree still has its geometry computed and validated

`computePositions` and the load-time validation pass (`checkContainment`/`checkCollisions`) walk the *full* tree unconditionally — a `hidden: true` node (D-112) renders nothing, but its position is still resolved and it can still trigger a containment/collision violation naming an element that's currently invisible on screen. Deliberately deferred when `hidden` was built: fixing it means threading a "skip this subtree" check through several existing tree-walks for a case that's cosmetic today (a stray validation message), not a functional bug.

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

## S-037 An expression inside a literal `points` pair silently produces `NaN`, corrupting the whole plan's render

Found live while testing D-139 (per-vertex dragging), not something that feature caused. `position` and `size` both correctly support expressions (`numOf` reads through an editable `{value}` object or a plain number), but a `points` entry's own literal `[x, y]` pair apparently never had this exercised — `numOf` on an unresolved expression *function* just returns the function itself unchanged (it only special-cases a `{value: number}` object), and the resulting `ownAbs[0] + <function>` in `resolvePointAbs` produces `NaN` via JS's own numeric coercion, not a thrown error. That `NaN` then propagates into the whole-plan fit-to-view computation (`render()`'s own `Math.min(minX, px)` reduction over every polygon/polyline point) since nothing there validates the result either, corrupting the entire SVG's `viewBox`/`width` — not just the one offending shape. No `#error` banner appears; the only visible symptom is a blank/broken viewer and a handful of cryptic `<svg> attribute width: Expected length, "NaN"` console errors, with no indication of which element or line caused it. Unaddressed — out of scope for D-139, which only reads/writes already-valid literal points.

## Secondary modules

## S-023 `annotations-module.js` re-derives geometry core already computed, with no enforced link

`annotationMarkupForNode`'s own comment admits it "mirrors core's own `renderShape` branching exactly," re-deriving rect corners and polygon/polyline absolute points from scratch since core doesn't expose per-node corner lists after rendering. Any future shape-branch change in `renderShape` can silently desync this copy — nothing links the two.

## S-024 `bringToFront`'s annotation-sibling-adjacency handling is a fragile implicit contract

`bringToFront` (`interactivity-module.js`) moves each shape's "immediately-following annotation `<g>`" along with it, explicitly to preserve the sibling adjacency `annotations-module.js`'s own `:hover + .annotation` CSS selector depends on. `annotations-module.js` has zero awareness that another module reorders its output this way. Consistent today; breaks silently (hover-reveal stops working for a raised element) if either side's naming/nesting convention ever drifts without the other being updated.

## S-025 Auto-load policy is applied inconsistently across modules that share the same justification

`grid-module.js` is auto-loaded specifically so `settings.grid` isn't silently inert for an author who didn't know to declare the module. `wall-with-door-module.js` is equally settings/property-driven (`compose: "wallWithDoor"`) but is *not* auto-loaded — an undeclared `compose` would presumably also silently do nothing, the exact gap the grid module's own auto-load exists to avoid.

## S-027 `wall-with-door-module.js`'s synthesized child ids have no collision check against real sibling ids

`segment`'s hand-built ids (`${node.id}_wall_a`, etc.) aren't checked against existing sibling ids before use. If an author's own plan happens to declare a colliding id, this could silently corrupt drag targeting the same way F-028 describes for hand-authored duplicates — and this path is exempt from the load-time duplicate-id check, since these nodes are synthesized after parsing, not part of the parsed source. Untested edge case, not confirmed broken.

## S-036 Text-splice source-editing helpers are now duplicated across two modules

`toLineSpan`/`applyEditsDescending`/`findOwnPropertyLine`-shaped helpers live privately inside both `interactivity-module.js` and (D-112) `hierarchy-module.js` — the same small "read/write a plan-text edit" primitives, copied rather than shared, since neither `window.PlanCore` nor any other cross-module channel exposes them. Accepted as the right call the first time (matching S-023's own "a module brings its own copy" tradeoff with core's geometry) but a second instance of the identical duplication is exactly the "wait for a second use, then share" signal this project's own refactor philosophy (D-095/D-096) watches for — worth hoisting onto `window.PlanCore` if a third module ever needs the same capability.

## S-028 `wall-with-door-module.js`'s own composite doesn't account for a non-zero `position`

The module's own comment states the composite's `position` isn't factored into its `from`/`to` endpoints, "left out to keep this focused." A `wallWithDoor` element nested somewhere with a non-zero `position` would likely place its segments wrong — self-admitted, unaddressed.

## Project structure / process

## S-032 Deploying has no CI/CD and no structural safeguard against a skipped step

Six independently-deployed targets (`homepage/`, `docs/`, `site-docs/`, `profile/`, `homepage/blog/`, `storage-service-php/`) each require a manual `scp` after every relevant change, with correctness resting on a human (or an assisting session) remembering to run it and separately verifying byte-counts match. Nothing would catch a deploy step that got forgotten.

## S-033 Static assets are physically duplicated across many directories

`favicon.ico`, `favicon.svg`, and `apple-touch-icon.png` each exist as separate physical copies across `docs/`, `homepage/`, every `homepage/blog/<post>/` directory, `homepage/impressum/`, `profile/`, and `site-docs/`. A future favicon change means updating (and re-deploying) every copy by hand; missing one silently leaves a stale icon on that one section indefinitely.

## S-034 `documentation/` and `site-docs/` are close enough in name to require an explicit disclaimer

`README.md` itself has to clarify that `site-docs/` (the public, human-facing documentation page) is "Not to be confused with `documentation/` below, the AI-facing language spec." Needing that disclaimer at all is itself a naming smell — a newcomer skimming folder names alone, without reading the README closely, would reasonably guess wrong about which one is which.
