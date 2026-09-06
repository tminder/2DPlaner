# Open Questions

Numbered `F-x` entries — real product/design questions that are genuinely unresolved right now. Distinct from `S-x` (existing-code maintainability gaps, `tech-debt.md`) and `D-x` (decisions already made and built, `decisions.md`). An entry is removed once it's fully resolved — the resolution is recorded as a `D-x` decision, not narrated here as a "built" append. Numbers are stable identifiers, not reused once an entry is retired; a partially-built entry stays, trimmed to whatever's actually still open, with a link to the `D-x` that covers what's already done.

## F-001 Constraint-solving scope: is a general geometric solver ever actually needed?

Unlimited connections + rigid drag propagation can in principle produce over-constrained/conflicting demands on a node — the same class of problem a CAD constraint solver exists for ([decisions.md D-014](decisions.md#d-014-connection-semantics)). In practice, every concrete case asked for so far has been covered by a small, specific, geometry-scoped mechanism instead of a general solver: shared corner-node references for pinned shared points ([D-018](decisions.md#d-018-points-as-node-references-shared-corners)), and the three parent-child placement modes — outside-attached, inside, flush — for constrained sliding ([D-032](decisions.md#d-032-parent-child-placement-modes), [D-071](decisions.md#d-071-f-001-flush-built-closing-d-032s-last-unbuilt-half--the-app-back-on-the-products-own-core-questions-not-just-its-sitedecisioninfra)). Still open: whether a real conflict case will eventually show up that these specific mechanisms can't cover, at which point a real solver (or a hard complexity cap) becomes a live question rather than a hypothetical one. Also still open, unrelated to solving: containment/flush only ever check the *directly dragged* element, never one moved along by a `connection`.

## F-002 Does the composite backward-solve approach generalize past one composition type?

Module-provided compositions (a reusable higher-level building block, e.g. `wallWithDoor`) are built and demonstrated end to end — rendering ([D-046](decisions.md#d-046-f-002s-third-module-promise-finally-tested-module-provided-compositions)) and drag-editability via a per-composition-type backward-solve ([D-072](decisions.md#d-072-f-002-drag-editability-for-a-composite-the-last-open-half-of-d-046)). Only one composition type has ever been built, so whether `composeDragEdits`'s specific approach — or any part of it — actually generalizes to a second one is untested, not assumed either way.

## F-004 Collision checking: only the dragged element, only siblings

[D-041](decisions.md#d-041-collision-checking-built-into-the-interactivity-module-not-core-or-a-third-module)/[D-075](decisions.md#d-075-f-022--f-028-a-load-time-validation-pass-with-duplicate-id-detection-folded-into-the-same-sweep) built collision/containment checking, both at drag-time and at load-time. Two scope limits remain, both deliberate but unaddressed: only the *directly dragged* element is checked, never anything moved along with it via a `connection`; and checking is scoped to same-parent *siblings* only, so two elements under different parents that happen to visually overlap are never checked at all.

## F-005 Public plan viewing

Whether a plan can ever be shown to a non-owner at all (e.g. a public share link) has never been decided as a feature. If it's ever built, the reasoning already worked out: serve it as a server-rendered static snapshot (flattened SVG/PNG) rather than the raw plan-language source — a viewer gets a picture, not an editable structure, protecting the owner's content ([decisions.md D-022](decisions.md#d-022-scraping-protection-content-not-the-language)) and doubling as a performance win. A principle to reuse *if and when* this is decided, not a commitment to build it.

## F-006 Documentation may still describe a broader language than what's actually implemented

A fresh AI agent given only `documentation/language.md` (no other context) produced a plan that failed to parse — wrong `connection` syntax (the doc showed an object-literal form nothing implements; the real syntax is positional), an unsupported sibling property path guessed by analogy, and a guessed (if correct) nesting syntax with no confirming example. The core, well-documented grammar came out correct on the first try — the gap is specifically in under-documented areas (connection syntax, sibling-path scope), not general ambiguity. Needs a documentation pass reconciling the spec with the current implementation; not re-checked since the language has grown substantially (placement, flush, compose, style presets, settings) since this test was run.

## F-007 Drag performance at scale

The current architecture re-tokenizes/re-parses the entire plan and replaces the entire rendered SVG on every `pointermove` during a drag. Measured directly: fine through 800 objects, over the 60fps frame budget at 2000 ([Prototypes/11-performance-test/](../Prototypes/11-performance-test/)). Fine for a single room or small home; would need incremental/targeted DOM updates (move just the dragged element's attributes) before comfortably handling a large multi-room plan with hundreds of objects. Not yet a real problem at this project's current scale.

## F-008 Live AI integration

Today's workflow is copy-paste from a separate AI conversation ([decisions.md D-023](decisions.md#d-023-ai-integration-mechanism-current-copy-paste)). If/when a live integration is built: where the LLM calls happen (client-side exposes an API key — not viable; realistically server-mediated, a new backend concern), how AI output reaches the editor (streamed vs. a complete diff), and conflict handling if the AI generates while a human is also typing. Lower priority than the questions above — copy-paste is a complete enough stand-in for now.

## F-009 External-module trust model, given who actually picks the URL

External modules run with no sandboxing, trusted by analogy to "a developer choosing an npm package" ([decisions.md D-020](decisions.md#d-020-plan-preamble-modules-and-settings)) — but per D-003, the module URL is typically chosen by an AI, with the human reviewing the result afterward, a different risk profile than the analogy assumes. **Partially mitigated:** a `confirm()` gate before loading any non-shipped module ([D-045](decisions.md#d-045-a-confirmation-gate-before-loading-an-untrusted-external-module)) — moves the exposure from automatic to a deliberate per-URL choice, but adds no sandboxing; accepted code still runs with full page access. Still open: whether real sandboxing is ever worth building, and whether gating behind login + an explicit per-profile opt-in is worth the accounts infrastructure it would need.

## F-010 Shape-agnostic container extent

`parent.size.x` only resolves when the parent is `shape: "rect"` (the one shape kind with a `size` property) — a `circle` parent has `radius`, a `polygon`/`polyline` parent has `points` and no single "size." Whether this is worth a real shape-agnostic accessor (every node exposing a computed `bounds.x/y/width/height`) or whether "only `rect` containers support this" is an acceptable permanent constraint is open.

## F-011 Single-parent hierarchy: is multi-membership ever actually needed?

Nesting (D-013) is the only way to express a parent-child relationship — a node has exactly one parent. This buys real simplicity (no dangling parent references, drag-sync never validates a reference graph) at the cost that a node can't belong to two groupings at once (e.g. "inside the room" for coordinates *and* "part of the kitchen zone" as a non-spatial grouping). Whether this is ever actually needed for this language's target domains, or whether a purely cosmetic grouping already covers every real case, is open — not derived from hitting a concrete blocked case.

## F-012 Drag-driven reparenting is untested

Nothing has ever tested dragging a node out of one parent's block and into another's. Given F-011's single-parent model, this means moving the whole `element { ... }` text block *and* rewriting its position literal (coordinates are local to whichever parent contains it) — a bigger text splice than any edit built so far, plus a coordinate transform. Neither is known to be hard; both are unbuilt and unproven.

## F-013 Metric/imperial unit toggle

Whether a plan (or the app) should support feet/inches display. The language is grounded in metric internally ([D-005](decisions.md#d-005-units)); the open question is specifically whether imperial would be a *display*-only conversion (values stay metric internally) or something the grammar needs to accept as authored input too. Requested, not designed.

## F-015 Settings editable from the viewer, beyond the one case already built

A plan's settings are otherwise purely textual — turning on e.g. `edgeLengths` or `allowCollisions` means typing it. **One concrete case is now built:** the header menu's "Show grid" toggle reads/writes `settings.grid` directly ([decisions.md D-103](decisions.md#d-103-the-app-header-every-distinct-action-flat-and-always-visible-icon-led-export-grouped-as-its-one-deliberate-flyout--plus-a-settings-toggle-and-a-real-sign-in-popup)). Whether this generalizes to a real settings panel covering every setting, or stays a small set of individually-added toggles for the settings that are genuine on/off flags, is open.

## F-016 Context menu: Scale

Duplicate is built ([decisions.md D-074](decisions.md#d-074-f-016-duplicate--scale-kept-as-its-own-follow-up-not-bundled-in)). **A `rect`/`circle` now has a real resize gesture — Shift+arrow keys ([D-109](decisions.md#d-109-f-043-keyboard-driven-movenudge-and-resize-for-the-selected-element))** — but nothing from the *context menu itself* exists yet (no menu item, no resize-handle UI shown once an element is selected). For a corner-reference-built polygon/polyline, scale would still mean moving every referenced corner outward from a pivot — a materially different mechanism, deliberately out of scope for D-109 too, and still fully undesigned.

## F-024 No rotation, and domain coverage hasn't been audited against what a real floor plan needs

`rotation` isn't implemented anywhere — a `rect` is always axis-aligned; declaring `rotation: 45` parses and is silently ignored. For this language's own stated domain, an angled wall or a non-rectangular footprint is ordinary, not an edge case — today it's only reachable by hand-computing rotated polygon coordinates, forfeiting `rect`'s own conveniences (exact containment clamp, `flush`, collision fast paths). No curves/arcs and no multi-level/floor concept either. Not designed: whether `rotation` becomes a flat sibling property next to `position`/`size` (the natural fit, matching this language's flat style — a `transform: {}` grouping object was considered and rejected), and how far to take the rest (curves, multi-level) versus leaving them a stated limitation.

## F-029 No multi-select for bulk actions

Every interaction (drag, Duplicate, Delete, connect/disconnect) operates on exactly one element at a time — no shift-click, no marquee selection, no "delete/duplicate this cluster together" for elements that don't already share a parent (nesting already covers the case where they do). A real, missing convenience, not designed at all yet.

## F-030 A reusable component/sub-plan concept

`compose` lets a *module* generate a structure from parameters (D-046/D-072), but there's no way to reuse a whole hand-authored *subtree* as data — "here's a bathroom layout, drop it into three different van plans." Related to F-027's now-built style presets (both are "define once, reuse without repeating") but at the granularity of a whole composition instead of one style object. Needs real thought before a shape is proposed: what identifies a reusable component, whether it lives inside one plan or is shared across files, how drag-editing a placed instance relates to editing the definition.

## F-031 Grid-snapped dragging, paired with the now-built visual grid

The visual background grid is built ([decisions.md D-085](decisions.md#d-085-f-014-a-checkered-background-grid-as-a-new-auto-loaded-display-module)) — pure display, no effect on drag behavior. Still open: a setting that constrains where a drag can *land* (e.g. "snap to 1m steps"), ideally paired so the visible grid's own square size matches whatever snap increment is in effect rather than being a purely decorative reference unrelated to how dragging actually behaves. Not designed: plan-wide vs. per-element scope, whether it constrains every drag-editable property or just position, how it interacts with placement/flush/compose (a fourth thing that might need to go through whatever snapping logic this becomes), and hard-snap vs. soft-snap-unless-a-modifier-key.

## F-034 Sharing a plan with someone else — static view vs. editable plan+code

Distinguishing two things: sharing just the rendered plan (F-005's own static-snapshot proposal, plausibly built on the export mechanism) versus sharing the plan *and* its editable source with a specific person — a fundamentally bigger exposure, handing over everything F-005's own scraping-protection reasoning tries to avoid giving away for free. Not designed: the mechanism for either (a durable share link implies the existing backend; plan+code sharing could be nothing more than exporting and sending source text), whether a shared plan is a live pointer or a frozen snapshot, and how either interacts with F-009's external-module trust question.

## F-036 Two mobile/touch gaps: pinch-to-zoom, and a touch equivalent for the right-click menu

Confirmed by reading the event wiring: `handleWheel` (the only zoom mechanism) is bound to `wheel` alone, which touch never fires — and `touch-action: none` on shapes (added so single-finger drag doesn't fight native touch pan/zoom) also suppresses the browser's own native pinch-zoom over most of a plan's visible area. The right-click context menu is wired to the `contextmenu` event, which touch can raise via long-press in some browsers, inconsistently and unverified here. Not designed: whether zoom becomes a real two-finger pinch handler (and whether `touch-action: none` needs scoping more narrowly once one exists), and what a touch-friendly context-menu trigger looks like.

## F-037 Validation violations should surface directly in the code pane, not only in a separate panel

Today every static-validation finding only appears in the validation panel — a message naming an element by id, with the reader left to find that element in the code pane themselves. The ask: mark the offending span directly in the code (an inline indicator), full message on hover. **Real prerequisite gap:** violations carry only `{ type, message }`, no source position — and most of what would need underlining isn't tracked by the parser at all (`parseValue()`'s `STRING` branch returns a bare string with no span; only numeric/expression values keep one). Building this needs the parser to start capturing per-property spans generally, not a targeted fix for one property. Not designed: how broad that parser change is, how a violation renders inline once it has a span (`code-highlight-module.js`'s existing token `<span>`s are a plausible attachment point, unconfirmed), and whether the inline marker replaces the panel or the two coexist.

## F-038 Style-preset resolution is core-only — making it a module is unexplored

`resolveStyle`/`settings.styles` lives directly inside core's `renderShape`, resolved synchronously while each shape's SVG string is built — unlike every actual module (`annotations-module.js`, `grid-module.js`), which runs via `core.onRendered`, a **post**-render hook reading back an already-built SVG. By the time `onRendered` fires, `fill`/`stroke` are already burned into the string core generated, not still pending. Not designed: whether this would mean core deferring resolution (a placeholder attribute a style module rewrites after the fact) or a genuinely new pre-serialize hook nothing in this codebase offers yet — or whether the value here is purely architectural consistency rather than unlocking a concrete capability.

## F-039 The grid should be able to sit in front of the plan, semi-transparent, not just behind it

`grid-module.js` always inserts its pattern as the SVG's first children, painting behind every shape unconditionally. The ask: a plan should be able to choose a grid that sits *in front*, at reduced opacity — useful as an alignment overlay once a plan is dense enough that a background grid gets fully hidden. Not designed: the settings shape (a `layer: "front"|"back"` sibling to `size`/`type`), the default opacity, whether "front" means literally last in the SVG or needs to stay behind interactivity's own overlay icons, and re-confirming `pointer-events: none` once a front-layer grid sits visually above shapes (a regression there would be far more noticeable than for a background grid).

## F-040 The code/viewer pane split should be resizable

`textarea { flex: 0 0 420px; resize: none; }` hard-codes the split with the browser's native resize handle explicitly disabled — there is no draggable divider anywhere. Not designed: the mechanism (a thin draggable handle vs. reviving native `resize`), whether the chosen width persists (`localStorage`) or resets per session, and how this interacts with the mobile layout (no side-by-side panes there at all — presumably a desktop-only concept).

## F-041 Alternatives to the drop-shadow "glow" for selection and hover

Selection and hover both use a colored `drop-shadow` filter, differing only by hue — established early, reused since. (Connection-highlight used to be a third, distinctly-colored member of this family; it's since been unified to match plain hover's own color, [decisions.md D-101](decisions.md#d-101-a-connected-elements-hover-highlight-is-the-same-color-as-plain-hover), narrowing what "alternatives" would need to cover.) Not designed: what the alternatives actually are (a stroke/outline treatment, a background tint, a corner-handle indicator), or whether selection and hover should even keep sharing one visual family now that selection has a behavior (raising to the front) hover doesn't.

## F-042 Style modules and settings toggleable from the menu, beyond the one flag already covered

A menu that shows which modules/settings are *actually active in this exact plan* and lets someone flip them on/off, writing back via the same source-splice mechanism drag edits use. **The one setting that's a genuine, clean on/off flag is built** — `settings.grid`'s own presence/absence, via the header menu's "Show grid" toggle ([decisions.md D-103](decisions.md#d-103-the-app-header-every-distinct-action-flat-and-always-visible-icon-led-export-grouped-as-its-one-deliberate-flyout--plus-a-settings-toggle-and-a-real-sign-in-popup)). Still open, and likely to stay open rather than resolve cleanly: `AUTO_MODULES` (annotations/interactivity/code-highlight/grid) are unconditionally re-injected regardless of a plan's own `module` lines, so there's no real "off" state to toggle at the module-declaration level for any of them; style presets aren't a meaningful binary toggle either (a named registry, not a flag). Not designed: how "currently active" would even be shown for something that isn't a clean flag, and whether a non-auto external module (its own separate F-009 trust flow already) belongs in the same menu at all.

## F-044 "Open plan" and "New plan" should be separate header actions, each opening a full-width plan-picker panel

Requested directly, own framing "a proposal, to be discussed" rather than a settled design. Today both are folded into the one `<select id="plan-switcher">` dropdown (My plans / Cloud / example plans all mixed together, no visual distinction between "open an existing plan" and "start a new one," no preview of any plan's actual content) — distinct from "Import…", which is already its own separate header action for loading a plan *file* from disk. The ask: split "Open" and "New" into their own header buttons; each opens a panel docked directly under the header, spanning the app's full width (not a small dropdown or centered modal like the existing sign-in popup) — "Open" shows the list of plans (My plans/Cloud) each with a preview of the plan itself; "New" shows a blank-plan option plus a few starter templates, similarly previewed. Not designed at all yet: what a "preview" actually renders (a live mini-SVG of the plan vs. a static thumbnail, and whether/when either gets (re-)generated), the panel's own visual layout (a grid of cards vs. a list), how this reconciles with the existing plan-switcher `<select>` (replaced outright, or kept as a secondary/compact path), whether Cloud plans need their own loading/error states inside the same panel, and how this interacts with the mobile layout (today's `<select>` already degrades reasonably at narrow widths; a full-width docked panel would need its own mobile treatment).

