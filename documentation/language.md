# Plan Language

Reference documentation for the Planagonia plan language, as currently designed. Unlike
[planning/](../planning/), which records *why* each choice was made, this document
describes *what the language is* for someone building against it or writing plans in it.

**Status:** the syntax below is real and running — it's what [docs/](../docs/), the hosted
app (D-034), actually parses — though still not finalized in every corner (see
[planning/open-questions.md](../planning/open-questions.md) F-002, F-003). Prototypes 01–14
predate later renames and syntax additions; read them as historical snapshots, not current
syntax (see the Worked examples note below). This document should be kept in sync with
[planning/decisions.md](../planning/decisions.md), which is the source of truth if the two
disagree.

The primary author of plan code is an AI, generating/editing it on the human's behalf
(D-003), which is why the concrete syntax (once designed) targets low-ambiguity,
token-efficient generation rather than hand-typing ergonomics first (D-017). Right now
that means copy-paste from a separate AI conversation into the app's editor, not a live
integration (D-023) — worth knowing if you're wondering why the language should be
easy to *generate*, not just easy to *type*.

## Core primitives

The language has exactly two primitives (decision D-013). Nothing else is built in — no
"room", "wall", "door", or object-type catalog.

**Renamed from "Node" to "Element" (D-033).** "Node" carries a strong graph/network
connotation of "a point" — right for a bare corner/anchor, wrong for the same primitive
used as a shaped, styled, child-bearing object. "Element" is neutral on visible/invisible
and container/leaf, matching how the same word is used in XML/HTML/SVG for exactly this
range of roles. Decisions and older prototypes (01–14) predate this rename and still say
"Node" throughout — read it as the same thing.

### Element

A generic element with:

- **coordinates/position** — where it sits, in its parent's local coordinate space
- **shape and style** — optional, plain properties (shape kind, size, color/stroke, etc.),
  not looked up from a named type
- **an optional label/name** — user-defined, for the author's own reference
- **optional children** — an element with children acts as a container ("area"); an
  element without children is a leaf ("object"). There is no separate area/object primitive.

```
element bed {
  shape: "rect"
  size: [1.6m, 2m]
  position: [0.3m, 0.3m]
}
```

Children are written as `element { }` blocks nested directly inside the parent's braces,
alongside its own properties — not a separate `children: [...]` list:

```
element room {
  shape: "rect"
  size: [4m, 3.5m]

  element bed {            // a child — its own position is local to `room`
    shape: "rect"
    size: [1.6m, 2m]
    position: [0.3m, 0.3m]
  }
}
```

This is confirmed against every prototype's grammar (an `element`/`node` keyword found
while parsing a parent's body becomes a child, anything else is a property). It's called
out explicitly here because an AI-authoring test
([open-questions.md](../planning/open-questions.md) F-006) found this was previously never
actually demonstrated in this document and had to be guessed.

### Connection

An attachment/relationship link between two elements (e.g. a door attached to a wall
segment, a chair attached to a table). A connection is semantic/relational, not merely a
drawn line — though it may be rendered as one (see Rendering below).

The core syntax is positional, with no braces:

```
connection wall_a door
```

An optional trailing `{ ... }` carries the connection's own properties — e.g. `kind`
(symmetric vs. directional, see D-014 below) — mirroring how an Element's `style` is
written:

```
connection swivel_seat table { kind: "directional" }
```

**Note:** the property block is new syntax (D-029) — the drag/render logic doesn't yet
treat `kind` differently either way; only the ability to *write* it exists so far.

**Caveat:** Connections are the least-tested part of this language. [Prototypes/03-drag-sync/](../Prototypes/03-drag-sync/)
is the only prototype that implements them at all, and only in the sense that D-018 later
showed was the wrong tool for the job it was tested on (see D-014's status note in
[decisions.md](../planning/decisions.md#d-014-connection-semantics)) — 04 and 05 drop
Connections entirely in favor of shared corners. Treat this syntax as unconfirmed for
Connections' actual remaining purpose (loose attachments), not as settled.

Higher-level concepts like a wall-with-a-door are not language keywords; they're composed
from Elements and Connections by the plan's author, or provided as a reusable composition
by a module (see Modules below).

### Shared corners

A `polyline`-shaped element's `points` can reference a sibling element's id instead of a
literal `[x, y]` pair, in which case that sibling's own resolved position supplies the
coordinate (D-018). This lets two lines share an exact endpoint — e.g. two wall segments
meeting at a corner — by both referencing the *same* corner element, rather than each
storing its own copy of the coordinate:

```
element corner_1 { position: [1.2m, 0m] }   // a plain Element, no shape -> renders as nothing

element wall_a { shape: "polyline", points: [[0m, 0m], corner_1] }
element wall_b { shape: "polyline", points: [corner_1, [4m, 0m]] }
```

**Renamed from `"line"` (D-029):** the old name implied a single 2-point segment; the
shape actually supports any number of points (an open, possibly multi-segment path — see
[Prototypes/09-more-shapes/](../Prototypes/09-more-shapes/)), which `"polyline"` (matching
the SVG element it renders as) states correctly.

A corner isn't a new primitive — it's the same Element used everywhere else. This is a
narrower, more direct tool than a Connection for the specific case of "these two things
touch at exactly one point": dragging `corner_1` moves both walls' shared endpoint by
construction, with nothing to keep in sync. Connections remain for looser attachments that
aren't pinned to one exact shared point (e.g. a door positioned somewhere along a wall).

The same mechanism applies to a **closed** shape, not just open line segments: a
`polygon` element's `points` can reference corner elements too, so a rectangle-like shape
with 4 corner elements can be deformed into a general (non-right-angled) quadrilateral by
dragging just one corner, while the other 3 stay fixed:

```
element panel {
  shape: "polygon"
  points: [corner_nw, corner_ne, corner_se, corner_sw]
}
element corner_nw { position: [0.5m, 0.5m] }
element corner_ne { position: [4m, 0.5m] }
element corner_se { position: [4m, 3m] }
element corner_sw { position: [0.5m, 3m] }
```

**Literal points by default; a corner element only when something is actually shared**
(D-018 correction). Reaching for corner elements as *the* way to write any polygon/polyline
— even a standalone shape nothing else references — was a real, examined habit early
examples fell into, not a rule this language ever stated. If no other element references a
point, a corner element buys nothing (nothing is being kept in sync) while still costing a
separate declaration for every point *and* the extra drag-time machinery a shape built
entirely from corner references needs (D-036). Write the coordinates directly instead:

```
element rug {
  shape: "polygon"
  points: [[1m, 2.6m], [1.9m, 2.5m], [2.1m, 3.4m], [1.5m, 3.9m], [0.7m, 3.5m]]
}
```

`points` entries can also mix the two freely — a shape can have some literal points and one
corner reference, when only *one* of its points is actually the one being shared with
something else (see [docs/](../docs/)'s utility example: `stromanschluss`'s first two
points are literal, its third references `haus_anschluss`, which is *also* the target of a
separate `connection` and so has to remain a real element regardless).

**Why this isn't done via `connection` instead, asked directly:** Connection's own
semantics (D-014) are whole-element rigid propagation — drag one, the other moves by the
same delta — which has no notion of "just this one point of one element should track just
this one point of another." Giving Connection that would mean either indexed/named
sub-element references (more syntax, not less) or a real geometric constraint ("keep these
two points coincident," solved rather than represented) — exactly the general
constraint-solving this language has repeatedly, deliberately avoided building (F-001).
Corner-reference sharing sidesteps needing to *solve* coincidence at all: there's only ever
one point element, referenced twice, so there's nothing to keep synchronized and no
solver to write. It's the same category of feature as an expression referencing
`parent.size.x` (D-008) — a property value pointing at another element's data — applied
specifically to `points`, not a third relationship primitive alongside Element and
Connection (D-013).

## Units and coordinates

Positions and sizes are given in real-world units (meters/cm), not abstract numbers
(D-005). An element's coordinates are local to its parent; the renderer is responsible for
scaling real-world units to screen pixels.

## Expressions

Values don't have to be literals — they can be small expressions/formulas (D-008), e.g.:

```
position: [parent.size.x - 1.2m - 0.2m, 0.2m]
```

This keeps the language declarative (the plan is still a description of what exists),
without forcing every dimension to be a hardcoded number.

**Scope:** an expression can only reference values in its own local scope — its parent or
siblings within the same container — not arbitrary elements anywhere in the plan (D-010,
decided to keep dependencies simple and drag-and-drop sync tractable).

**What's actually implemented is narrower than that scope rule suggests.** Every prototype
only supports `parent.<prop>.<x|y>` paths (e.g. `parent.size.x`) and single-segment
sibling-id references used specifically as a `points` entry (D-018's shared corners, e.g.
`points: [corner_1, corner_2]`). A general sibling property path like
`swivel_seat.position.x` is *not* implemented anywhere — it parses (the grammar doesn't
distinguish `parent` from any other identifier), but fails at render time with an
unresolved-reference error. This gap was found via the F-006 AI-authoring test: an agent
reasoning by analogy from the `parent.size.x` example wrote exactly this and it broke.
Read D-010's scope as the intended rule, not yet the implemented one.

**The `.x`/`.y` suffix is a general rule, not a `size`-specific special case.** Any
property whose value is a 2-element `[a, b]` array — `size`, `position`, a `points` entry
written as a literal pair — can be indexed the same way: `.x` reads element 0, `.y` reads
element 1. `parent.size.x` is the only example shown above because it's the only one
that's come up in practice, not because `size` is special.

**`parent.size.x` only resolves when the parent actually has a `size` property** — in
practice, only a `shape: "rect"` element has one. A `circle` parent has `radius` instead, a
`polygon`/`line` parent has `points` and no single "size" at all; referencing
`parent.size.x` through one of those fails the same unresolved-reference way as a bad
sibling path. There's no shape-agnostic "my container's extent" accessor yet — see
[open-questions.md](../planning/open-questions.md) F-010 for whether one should exist.

The language deliberately stops short of a full scripting language: no loops, no
functions, no control flow (D-008).

## Rendering

- **Technology:** the reference renderer targets SVG (D-004).
- **Default appearance:** an element with coordinates but no shape/style renders as nothing
  in the plan output. In an editor view specifically, an otherwise-invisible element still
  shows a visible affordance on hover, so it stays discoverable and draggable (D-016).
- **Connections** may be rendered as a line between the two elements they link, but that's
  a rendering choice, not part of what a connection *means* (D-013).

## Labels and dimensions

Any element can carry `label: "text"` (a display name) and, for `rect`/`circle` shapes,
`dimensions: true` (the shape's own computed size — width × height, or diameter — not
a value the author types in, so it can't drift out of sync with the actual geometry).
Visibility is per element via `show: "always"` or `show: "hover"` (D-026):

```
element fountain {
  shape: "circle"
  radius: 0.45m
  position: [2m, 2m]
  label: "Brunnen"
  show: "always"
  dimensions: true
}
```

**Renamed from `showDimensions` (D-029):** the old name shared the word "show" with the
unrelated `show` visibility property, even though one is "include this content at all"
(a boolean) and the other is "when to reveal already-included content" (an enum) — a real
source of confusion since only one of the two actually controls visibility.

`polygon`/`line` support `label` only, not `dimensions` — a single width/height or diameter
doesn't mean anything for a shape with no fixed number of sides. A shapeless element
(D-016) can't carry a label at all yet — a known gap, not a deliberate exclusion.

### Edge lengths

`edgeLengths: true` (D-038) shows each individual edge's own computed length — the length
of one wall segment, one side of a plot boundary — as opposed to `dimensions`' single
whole-shape figure. Supported on `rect` (all 4 sides, computed from `size`), `polygon`
(every side, including the closing edge back to the first point), and `polyline` (every
segment, no closing edge); not on `circle` (no straight edges to measure) or a shapeless
element. Reuses the same `show: "always" | "hover"` an element already has — one visibility
mode per element governs its label, dimensions, and edge lengths together, rather than
adding a second independent visibility axis:

```
element grundstueck {
  shape: "polygon"
  points: [ecke_1, ecke_2, ecke_3, ecke_4]
  label: "Grundstück"
  show: "hover"
  edgeLengths: true   // each of the 4 boundary sides gets its own length label
}
```

**Also settable plan-wide**, as `settings { edgeLengths: true }` — see Settings below. An
element's own `edgeLengths` always overrides the plan default when set (`true` or `false`);
leaving it unset means "inherit the plan default." Deliberately the same property name at
both levels rather than two different words for what is, at either scope, the identical
on/off knob (D-033 principle #2 — reusing one name for one concept, not the reverse).

## Editing and drag-and-drop

Every visual element must be representable and editable via drag-and-drop — there is no
code-only visual element (D-009). This is a hard constraint on the language: its structure
has to map cleanly to and from direct manipulation of the rendered view. Concretely:

- **Dragging a value backed by an expression** (e.g. `width: 3 * bay_width`): the system
  tries to solve backward, adjusting the referenced variable(s) so the expression still
  holds, rather than overwriting it with a literal (D-012).
- **Dragging an element with connections:** the drag rigidly propagates to every element
  it's connected to, so connected elements stay joined (D-014) — *unless* the dragged
  element is a bare point resting on a connected rect's edge, in which case it slides along
  that edge instead (D-032, first built in
  [Prototypes/15-utility-connection/](../Prototypes/15-utility-connection/)). An element
  can carry any number of connections at once, and each connection is independently
  symmetric ("these two are joined") or directional (one element anchored to the other).
  **Still largely unproven beyond that one case** — see the Connection section above and
  D-014's status note in
  [decisions.md](../planning/decisions.md#d-014-connection-semantics).
- **When a drag can't be solved** — an unsolvable expression, or conflicting/
  over-constrained connections — the drag still completes visually, but the UI warns and
  flags the affected expression(s)/connection(s) for the user to resolve, rather than
  silently picking an answer or rejecting the drag outright (D-015).
- How far connection conflict-resolution goes (simple chains vs. a real geometric
  constraint solver) is explicitly still open — see
  [planning/open-questions.md](../planning/open-questions.md) F-001.

## Modules

Modules can add new rendering and new interactivity, and can add new *reusable, higher-
level compositions* built from Element and Connection (e.g. a "wall with a door" building
block) — but not new fundamental primitives; the core stays fixed at exactly the two above
(D-011). A plan loads a module by declaring it in the **preamble**, before the root element
(D-020):

```
module "wall-tools"                              // internal, resolved by name
module "https://example.com/campervan-kit.js"    // external, fetched from the URL
```

That's the language-level grammar; what a module can actually do once loaded (the
`window.PlanCore` API, load/cleanup lifecycle, the trust model, and what's currently shipped
in [docs/](../docs/)) is documented in full in [modules.md](modules.md), kept separate from
this file since it's about the surrounding system, not the plan language itself.

## Settings

The preamble can also include a `settings { ... }` block — plan-level configuration,
extensible rather than a fixed list. The first two concrete settings (D-020):

```
settings {
  allowCollisions: true                // default: collisions between objects are NOT checked
  allowSelfIntersectingPolygons: false // default: self-intersecting shapes are checked
  edgeLengths: false                   // default: no per-element opt-in needed
}
```

Polygon-realism checking is a real default behavior, not just an illustrative example —
`allowSelfIntersectingPolygons` opts *out* of it per plan. Collision checking (below) is
the opposite: opt-in, off unless a plan (or element) explicitly turns it on.

**Collision checking (D-041), opt-in — `allowCollisions` defaults to `true` (checking
off).** Unlike its settings-block neighbor, blocking every geometric overlap by default
would break a common, entirely legitimate pattern this language has no other way to
express yet — a rug positioned under a table, artwork overlapping a wall, anything meant
to visually sit on top of or behind something else. Turning collision checking on is a
deliberate per-plan (or per-element) choice, not a silent default every existing plan
would otherwise have to work around.

When it's on, `rect`/`circle`/`polygon` elements sharing the same direct parent may not
overlap. Dragging one into another doesn't just freeze the drag outright (a hard reject
felt "stuck" in every direction, since drag deltas are cumulative from the gesture's own
start — see D-041's correction) — it slides along whatever it hits (a wall, a circle's
curve, a polygon's diagonal edge) toward the furthest point along the attempted move that
doesn't overlap, staying responsive to being pulled away again, rather than D-015's
warn-and-flag pattern either. Scoped to siblings only: a chair positioned inside a room
isn't a collision with the room itself, that's containment, a different relationship
(D-032) this doesn't check. `polyline` and shapeless elements don't participate — they're
meant to touch/connect by design (D-014/D-018), not something to police for overlap. Two
shapes resting exactly flush against each other are *not* a collision, only genuine
overlapping area is.

Also settable per element, `allowCollisions: true | false`, overriding the plan default for
that specific element — the same override pattern as `edgeLengths` (D-038): unset inherits
the plan default; an explicit value always wins. Since a collision is inherently between
*two* elements, either one opting out exempts that pair from the check.

**Not yet checked:** an element dragged along by a `connection` (rather than directly) —
only the element the user is actually dragging is validated. See
[planning/open-questions.md](../planning/open-questions.md) F-004 for what's still open.

`edgeLengths` is a different kind of setting from its two neighbors above — not a check to
opt out of, but a *display default* to opt into: `settings { edgeLengths: true }` turns edge
length labels on for every `rect`/`polygon`/`polyline` in the plan that doesn't say
otherwise itself. See "Edge lengths" above for the per-element property it shares its name
with, and how the two combine.

**Renamed from `allowUnrealisticPolygons` (D-033):** the old name implied general
realism-checking; the actual check is specifically self-intersection (a "bowtie") and
nothing else — *not* non-convexity, so a concave shape like an L-shaped room is perfectly
realistic and isn't flagged. The new name says exactly what's checked, without needing
the reader to already know that "unrealistic" here has a narrow, specific meaning. A
violation is checked against the *proposed* position before it's committed, so a corner
drag that would cross the shape simply stops being applied (with a message), rather than
being allowed and flagged afterward like D-015's unsolvable-expression case.

## Worked examples

Prototypes 01–14 predate the D-033 renames and use the original names throughout
(`node`, `allowUnrealisticPolygons`) — described below exactly as they exist, not
retroactively updated. [Prototypes/15-utility-connection/](../Prototypes/15-utility-connection/)
is the first to use the current names. **[docs/](../docs/) is the one that matters going
forward** — the actual hosted app (D-034), reusing 15's core/module structure, kept in sync
with this document rather than frozen as a snapshot; the prototypes below stay purely
historical.

- [Prototypes/language-sketch-01.md](../Prototypes/language-sketch-01.md) — three sketched
  plans (a room, a campervan interior, an outdoor layout) used to derive the primitives
  above, plus the wall/door composition example.
- [Prototypes/01-node-connection-render/](../Prototypes/01-node-connection-render/) — a
  runnable prototype rendering a small Node/Connection plan to SVG in the browser.
- [Prototypes/02-text-parser/](../Prototypes/02-text-parser/) — a first concrete syntax
  (text → parser → live SVG render).
- [Prototypes/03-drag-sync/](../Prototypes/03-drag-sync/) — the same syntax, plus dragging
  the rendered plan rewrites the source text (D-012 solve-backward, D-014 connection
  propagation). Doesn't yet implement shared corners (D-018).
- [Prototypes/04-shared-corners/](../Prototypes/04-shared-corners/) — implements D-018
  (`wall_a`/`door`/`wall_b` share `corner_1`/`corner_2` instead of duplicating
  coordinates) and two distinct hover states: hovering an object previews "this moves as a
  whole", hovering a corner previews "these lines move with it". Implements no Connections
  at all — see the D-018 narrowing above.
- [Prototypes/05-polygon-corners/](../Prototypes/05-polygon-corners/) — extends D-018 to a
  closed `polygon` shape: dragging one of 4 corner nodes deforms a rectangle into a
  general quadrilateral while the other 3 corners stay fixed. Also implements D-020's
  `settings` block with `allowUnrealisticPolygons` (self-intersection checking).
- [Prototypes/09-more-shapes/](../Prototypes/09-more-shapes/) — confirms `points` and the
  F-004 realism check are generic over point count and open-vs-closed shape (a 5-point
  polygon, a 4-point line with each point its own node), and adds `circle` as a new shape
  kind (center position + radius).
- [Prototypes/10-labels-dimensions/](../Prototypes/10-labels-dimensions/) — implements
  D-026 (`label`, `showDimensions`, `show`) across all four shape kinds.
- [Prototypes/13-unified/](../Prototypes/13-unified/) — everything above combined into one
  realistic plan (a small studio apartment): the full expression grammar, `settings` and
  `module` preamble, `connection` statements, all four shape kinds plus a module-provided
  one, shared corners *and* a real Connection side by side, and D-026/D-012/F-004 all live
  in the same drag path. Frontend-only, no backend — see D-027.
- [Prototypes/14-interactivity-module/](../Prototypes/14-interactivity-module/) — same plan
  again, restructured so the host page only parses and renders; every interactive behavior
  (drag, selection, connect/disconnect, hover, the right-click menu) is moved into a loaded
  module, the first test of D-011's "modules can add new interactivity" promise. See D-031.
- [Prototypes/15-utility-connection/](../Prototypes/15-utility-connection/) — a property
  boundary, a house, and a utility connection line: the first plan outside a room's
  interior, using the same primitives with zero core changes (see D-001). Reuses 14's core
  and interactivity module structurally, but adopts D-033's renames (`element` instead of
  `node`, `allowSelfIntersectingPolygons` instead of `allowUnrealisticPolygons`) and builds
  the first working slice of D-032: a connected point now slides along its parent's wall
  instead of dragging the whole
  house when moved directly.
- [Prototypes/16-parent-child-placement/](../Prototypes/16-parent-child-placement/) — a
  standalone local test of D-032's "inside" placement mode. Started with
  `connection child parent { placement: "inside" }`; revised after actually using it to
  `placement: "inside"` directly on the child (a parent's already unambiguous via nesting,
  so the connection just restated its id on every child) with `childPlacement` settable
  once on the parent as the default for every child that doesn't override it. A rect child
  is clamped to stay within its rect parent's boundary when dragged — exactly, via a
  closed-form per-axis clamp for the rect/rect case (found necessary after a first
  tangent-slide attempt, reusing D-041's approach, let a child escape right at a corner);
  a polygon parent still falls back to that general, less-validated approach. Not wired
  into [docs/](../docs/) — a first validation, not a finished feature. Scoped narrowly: only
  a `rect` child with a literal `position`, no `flush` (D-032's other, still-unbuilt half),
  no corner-refs or other connections.
