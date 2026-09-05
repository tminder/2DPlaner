# Technical Debt

Numbered `S-x` (Gap) entries — code-quality, consistency, and correctness-risk items to keep in mind and address going forward, as distinct from `F-x` (feature/design questions, `open-questions.md`) and `D-x` (decisions already made and built, `decisions.md`). An item belongs here if it's about the *existing* code being harder to maintain or riskier than it should be — not about something that was never built yet.

Compiled from a full audit of `docs/index.html`, `docs/interactivity-module.js`, and the three smaller modules (`docs/annotations-module.js`, `docs/grid-module.js`, `docs/wall-with-door-module.js`), cross-referenced against what `decisions.md`/`open-questions.md` already self-admit — plus a separate pass over the repo's own top-level structure (folders, deploy process, README) for the same kind of "harder to maintain than it should be" risk at the project-organization level, not just inside individual files. Every entry below was read and verified directly, not inferred from naming.

**Where to start, if picking one thing:** S-030 (no test suite anywhere in the repo) was the single highest-leverage item in this whole document — now built (D-093) — and every other fix here is safer to make with it in place. Among the remaining code-level items, S-001 (the clamp/slide duplication F-026 already named) turned out lower-risk to fix than assumed — each function has only 1-2 call sites — and S-002/S-003 (the six near-identical "action" functions and three competing edit-apply idioms) are a contained, low-risk refactor that would make every future context-menu action cheaper to add correctly. S-012 is the only item here that's an active, shipped, user-visible bug rather than a maintainability risk, and probably deserves a standalone fix before the others.

## `docs/interactivity-module.js`

## S-001 Six independently-reinvented "clamp/slide/warn" functions (confirms F-026)

`clampToNoCollision`, `clampToStayInside`, `clampRectToStayInsideRect`, `clampFlushInsideRect`, `trySlideAlongConnectedRect`, and the door-slide branch inside `composeDragEdits` all solve the same underlying problem — clamp a proposed `dx/dy` against some boundary, optionally sliding along it, optionally warning — each with its own logic. `clampFlushInsideRect`'s own comment admits it's "same shape as `trySlideAlongConnectedRect`'s… mechanic." Verified directly: each has only 1-2 call sites, so unifying them is **lower-risk than the repeated-rebuilding history suggests** — the real obstacle is reconciling their differing return shapes (delta vs. finished edits), warning conventions, and exactness (binary-search+tangent vs. closed-form per-axis), not fan-out.

## S-002 Six "action" functions share an unfactored 5-step shape

`duplicateElement`, `deleteElement`, `reorderSibling`, `setPlacementInside`, `toggleFlush`, `clearPlacement` each: re-parse fresh from `core.sourceEl.value`, build an edits/spans array, sort descending, splice, `core.rerender()`, `core.commitUndoStep()`. Confirmed via 6+ identical `try { base = core.parseExpanded(text); } catch (e) { return; }` lines. A shared helper (parse-guard + apply-and-commit) is overdue — every new menu action currently means re-copying this shape by hand.

## S-003 Three different "apply edits to text" idioms coexist for the identical operation

(a) inline `sort((a,b)=>b.start-a.start)` + manual splice loop, repeated in `applyDrag`, `duplicateElement`, `reorderSibling`, `createConnection`; (b) the shared `deleteSpans` helper (used by `deleteElement`/`clearPlacement`/`removeConnection`); (c) the later `applyEditsDescending` helper (added for F-035, used only by `setPlacementInside`/`toggleFlush`, never retrofitted into the earlier functions it duplicates). Should converge on one.

## S-004 Silent argument-mismatch: `snapPositionEdits` passes 8 args to a 7-param function

`snapPositionEdits` always calls `clampFn(nodeId, dx, dy, positions, containerAbs, containerSize, childSize, warnings)`, but `clampRectToStayInsideRect` only declares 7 params — `warnings` is silently dropped, and the code says so in a comment instead of fixing it. A future `clampFn` that *does* need `warnings` would break silently with no error, just missing warning messages.

## S-005 `stackOrderCache` is never invalidated and can go stale after a real reorder

Populated once per id-set and never cleared — not on render, not after `reorderSibling` physically changes sibling declaration order in the source. A later hover over the same point (same id set) can still return the pre-reorder cached order. Also an unbounded, session-lifetime `Map` with no eviction.

## S-006 Two independent mechanisms freeze paint order to fight the same problem

`clickCycle.candidates` (D-086) and `stackOrderCache` (D-088/090) were built at different times to solve the identical issue — `bringToFront` scrambling live `elementsFromPoint` order — instead of sharing one. The stacked-element subsystem as a whole (`candidateIdsAtPoint` → `excludeOutsideAttachedPairs` → `resolvedCandidatesAtPoint` → `updateStackedHint` → `bringToFront`) needed four same-day bug-fix rounds (D-086, D-088, D-090, D-091) after each prior fix missed an edge case — a real fragility signal even without an inline "hack" comment admitting it.

## S-007 `handleRendered` is a god-function with seven unrelated responsibilities

Recomputes bboxes; runs the full plan validation pass; resets/manages pan-zoom `viewState`/`lastCoreFit`; updates the scale bar; toggles the selection class *and* calls `bringToFront` (a DOM reorder); refreshes the stack-hint badge and reapplies `stacked-dim` classes; builds and injects connect/disconnect icon markup — all in one callback with no sub-function boundaries, despite its own name suggesting "reapply overlay state after a render."

## S-008 Validation checkers and drag-time clamps duplicate the same scope logic independently

`checkContainment` and `clampToContainment` each re-derive "rect child, D-032 scope" on their own — a comment even acknowledges "reuses `clampToContainment`'s own scope exactly" — but the actual condition is copy-typed twice, so the two can silently drift apart.

## S-009 Inconsistent state-access convention within one subsystem

Some functions take `base`/`program` as an explicit parameter (`excludeOutsideAttachedPairs`, every `check*` validator); others (`candidateIdsAtPoint`, `resolvedCandidatesAtPoint`) reach directly for the module-level `program` closure variable instead — same file, same feature area, two conventions.

## S-010 Teardown doesn't reset every state variable it claims to

The cleanup comment says it "undoes exactly what setup above did," but only resets `drag`/`canvasDrag`/`selectedId`/`viewState`/`lastCoreFit` — `clickCycle`, `stackHintCandidates`, `contextMenuItems`, `program`, `lastBboxes`, and `stackOrderCache` are left untouched. Harmless today only because the whole IIFE closure is discarded on reload; the comment's claim is inaccurate regardless.

## S-011 Eleven module-level mutable variables with no ownership boundaries

`program`, `lastBboxes`, `selectedId`, `drag`, `contextMenuItems`, `clickCycle`, `stackHintCandidates`, `viewState`, `lastCoreFit`, `canvasDrag`, `stackOrderCache` — nearly every function reads/writes several of these directly. Correctness currently depends on remembering which handler runs in what order rather than any enforced contract. Worth considering a single explicit state object with documented invariants, at least for the ones that must stay in sync with each other (S-006's two freeze mechanisms being the clearest case).

## `docs/index.html` (core)

## S-012 Real, currently-shipped rendering bug: `polygon`/`polyline` has no style fallback

`renderShape`'s rect/circle branches default a missing `stroke`/`fill` to `"none"` and `strokeWidth` to `0.02`; the polygon/polyline branch emits `style.stroke` and `numOf(style.strokeWidth)*M` raw, with no fallback. A polygon whose `style` object omits `stroke`/`strokeWidth` renders literal `stroke="undefined"` and `stroke-width="NaN"` in the actual SVG output — not a style regression, a broken/invalid attribute. The only item in this file classified as an active bug rather than a maintainability risk.

**Built — [decisions.md D-094](decisions.md#d-094-s-012-polygonpolyline-now-falls-back-like-rectcircle-when-style-omits-strokestrokewidth).** A one-line fix, applying the exact fallback pattern `rect`/`circle` already had. Now covered by two permanent tests in `tests/test_rendering.py`.

## S-013 `isTrustedModule` and `hasModuleDeclared` use incompatible matching rules

`isTrustedModule` does exact string equality against `AUTO_MODULES`; `hasModuleDeclared` matches by a path-tolerant substring regex. A plan declaring e.g. `module "modules/grid-module.js"` would be treated as "already declared" (skipping auto-injection) yet still trigger the untrusted-module `confirm()` dialog every session, since the exact string differs from `"grid-module.js"`.

## S-014 Duplicated download boilerplate and filename-sanitization

The `save-btn` handler hand-rolls the same Blob→ObjectURL→temporary-`<a>`→click→revoke sequence that `downloadBlob()` formalizes right afterward — never refactored to call it. The filename-sanitizing regex is duplicated verbatim in two places; a future change to allowed filename characters has two places to update and will likely only catch one.

## S-015 `fixedViewBox` invalidation duplicated at three call sites instead of centralized

`switchToPlan`, `newPlanFromExample`, and the startup bootstrap all manually set `fixedViewBox = null` before calling `rerender()`, even though `rerender()` itself already does this unless `preserveViewBox` is passed. Only works because every call site remembers to duplicate it.

## S-016 Two independent recursive interpreters over the same AST must be kept in sync by hand

`evalAst` and `linearize` both walk `num`/`neg`/`bin`/`path` nodes with separate per-operator logic. Adding a new operator or AST node type requires updating both, with nothing enforcing that they stay consistent.

## S-017 Inconsistent failure visibility: one silent warning among otherwise-loud failures

An unresolvable style preset (`resolveStyle`) only `console.warn`s and falls back to `{}`; every other bad-input case on the same render path (an unknown `points` reference, an unknown module) throws and surfaces in the visible `#error` banner. A user will never see why their shape lost its color unless they open devtools.

## S-018 Storage access repeats an ad hoc try/catch shape with no shared helper

`savePlansList`, `loadPlansList`, `setActivePlan`, `setCloudSession`, `cloudToken`/`cloudUsername` each independently wrap `localStorage`/`sessionStorage` calls in their own `try { } catch (e) { }`. Nothing reminds a future storage read/write elsewhere that this guard is needed.

## S-019 `render()` re-derives geometry `renderShape()` already computed, instead of one shared bbox pass

`bboxes` is only populated for rects inside `renderShape`; `render()` then separately re-walks the whole tree and recomputes polyline/polygon points and circle radii a second time just to fold their extents into the fit box — a narrow patch (added after the Blank example exposed the gap) rather than a generalized single pass. Any future shape type will likely repeat the same oversight.

## S-020 `nodeDragEdits` solves "literal vs. expression" differently for `position` than for `points`

A `position` coordinate that's an expression attempts `trySolveBackward` to rewrite the source; a `points` entry that's a corner-ref function never attempts anything and just warns "drag that corner directly." Plausibly a deliberate limit (corner refs aren't linear-solvable the same way), but it's undocumented, so it reads as an inconsistency rather than a designed boundary.

## S-021 `checkRealism` recomputes the whole tree's positions from scratch per candidate drag position

Called on every proposed move during an active drag, over the entire plan every time. Fine at today's plan sizes; a likely bottleneck as plans grow (see also F-007, drag performance at scale).

## S-022 Value-kind tagging is purely structural/duck-typed

`isEditable` (`"start" in v`) and `numOf` (`"value" in v`) rely on ad hoc shape checks rather than any explicit tag or class. Any future value object that happens to carry a `start` or `value` property would silently be misidentified as a literal token.

## Secondary modules

## S-023 `annotations-module.js` re-derives geometry core already computed, with no enforced link

`annotationMarkupForNode`'s own comment admits it "mirrors core's own `renderShape` branching exactly," re-deriving rect corners and polygon/polyline absolute points from scratch since core doesn't expose per-node corner lists after rendering. Any future shape-branch change in `renderShape` can silently desync this copy — nothing (no test, no shared function) links the two.

## S-024 `bringToFront`'s annotation-sibling-adjacency handling is a fragile implicit contract

`bringToFront` (`interactivity-module.js`) moves each shape's "immediately-following annotation `<g>`" along with it, explicitly to preserve the sibling adjacency `annotations-module.js`'s own `:hover + .annotation` CSS selector depends on. `annotations-module.js` has zero awareness that another module reorders its output this way. Consistent today; breaks silently (hover-reveal stops working for a raised element) if either side's naming/nesting convention ever drifts without the other being updated.

## S-025 Auto-load policy is applied inconsistently across modules that share the same justification

`grid-module.js` is auto-loaded specifically so `settings.grid` isn't silently inert for an author who didn't know to declare the module (citing F-023's own reasoning). `wall-with-door-module.js` is equally settings/property-driven (`compose: "wallWithDoor"`) but is *not* auto-loaded — an undeclared `compose` would presumably also silently do nothing, the exact gap the grid module's own design comment says it exists to avoid.

## S-026 `annotations-module.js`'s `fmtMeters` reimplements number formatting instead of reusing `core.formatNumber`

Produces a second, independently-maintained formatting rule (plain rounding + `.toString()`) that can drift from core's own display convention, despite `core.formatNumber` being exposed on `window.PlanCore` specifically for this.

## S-027 `wall-with-door-module.js`'s synthesized child ids have no collision check against real sibling ids

`segment`'s hand-built ids (`${node.id}_wall_a`, etc.) aren't checked against existing sibling ids before use. If an author's own plan happens to declare a colliding id, this could silently corrupt drag targeting the same way F-028 describes for hand-authored duplicates — and this path is exempt from D-075's load-time duplicate-id check, since these nodes are synthesized after parsing, not part of the parsed source. Untested edge case, not confirmed broken.

## S-028 `wall-with-door-module.js`'s own composite doesn't account for a non-zero `position`

The module's own comment states the composite's `position` isn't factored into its `from`/`to` endpoints, "left out to keep this focused." A `wallWithDoor` element nested somewhere with a non-zero `position` would likely place its segments wrong — self-admitted, unaddressed.

## Already-shipped, currently-broken behavior (not a style/maintainability item)

## S-029 Collision-avoidance sliding against a circle or non-axis-aligned polygon edge — recorded as "not fully working"

`decisions.md` D-041 itself documents four rounds of fixes (reject → uniform-scale clamp → X/Y-separated clamp → general surface-normal slide) and states the session stopped mid-fix without a captured repro. This is a genuinely open, shipped bug in collision-clamping — distinct from every other entry here, which is about code shape, not incorrect behavior a user can already trigger today.

## Project structure / process

Found by reading the repo's own top-level layout, `README.md`, `.gitignore`, and `documentation/` against what's actually shipped — not code-level, but process/organization debt with the same "harder to maintain than it should be" character as everything above. The project's own naming choices are, for the most part, already explained directly in `README.md` (e.g. why `docs/` is the app and not documentation, why `storage-service/` is kept alongside `storage-service-php/`) — the items below are the ones that aren't already mitigated by that self-documentation.

## S-030 No test suite lives in the repository at all

Every verification this project has ever had — dozens of Playwright scripts across many sessions — was written into a session-local scratchpad temp directory, run once, and discarded; none were ever committed. There is no `tests/` directory, no fixture plans, no repeatable regression suite anywhere in the repo (confirmed: no directory anywhere matches `*test*` except an unrelated `Prototypes/11-performance-test` name). This is the largest sustainability gap of anything in this document: every future change to `docs/index.html` or `docs/interactivity-module.js` currently has no automated safety net — correctness depends entirely on whoever is making the change happening to re-derive the right ad hoc checks by hand, in whatever session they're working in.

**Built — [decisions.md D-093](decisions.md#d-093-s-030-a-real-committed-test-suite--python--pytest--playwright-chosen-after-checking-not-assuming-that-node-was-available).** `tests/` at the repo root, Python + pytest + Playwright (Node/npm checked directly and found genuinely absent from this machine, not assumed available), 27 tests across six files covering shipped examples, drag/undo, containment/placement/flush, the load-time validation pass, the stacked-element subsystem, and the context menu's structural actions. Not a wholesale port of this session's own ~65 scratchpad scripts — a curated set covering what the audit itself flagged as most valuable and most fragile. Two real bugs found in the process of writing it, both in test code rather than the product (a debounce race in a test helper, a wrong assumption about click-cycling's own first-click behavior) — see D-093 for both.

## S-031 `documentation/modules.md` is stale — missing two of the four shipped modules

Documents `annotations-module.js`, `interactivity-module.js`, and `code-highlight-module.js` in detail, but has no section for `grid-module.js` (D-085) or `wall-with-door-module.js`, both real, currently-auto-loaded/shipped modules. Confirmed by grepping the file directly for all five module names. A reader relying on this file to understand "what modules exist and what they do" gets an incomplete picture with no indication anything is missing.

## S-032 Deploying has no CI/CD and no structural safeguard against a skipped step

Five independently-deployed targets (`homepage/`, `docs/`, `site-docs/`, `profile/`, `storage-service-php/`) each require a manual `scp` after every relevant change, with correctness resting on a human (or an assisting session) remembering to run it and separately verifying byte-counts match. This has worked so far because of consistent session-level discipline, not because the repository itself enforces or automates it — nothing would catch a deploy step that got forgotten.

## S-033 Static assets are physically duplicated across seven directories

`favicon.ico`, `favicon.svg`, and `apple-touch-icon.png` each exist as separate physical copies in `docs/`, `homepage/`, `homepage/blog/`, `homepage/blog/planagonia-is-live/`, `homepage/blog/six-bugs-we-found/`, `homepage/impressum/`, `profile/`, and `site-docs/` — confirmed via the repo's own directory listing. A future favicon change means updating (and re-deploying) up to eight copies by hand; missing one silently leaves a stale icon on that one section indefinitely.

## S-034 `documentation/` and `site-docs/` are close enough in name to require an explicit disclaimer

`README.md` itself has to clarify that `site-docs/` (the public, human-facing documentation page) is "Not to be confused with `documentation/` below, the AI-facing language spec." Needing that disclaimer at all is itself a naming smell — a newcomer skimming folder names alone, without reading the README closely, would reasonably guess wrong about which one is which.
