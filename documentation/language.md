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

**`hidden: true` (D-112) — the element (and its whole subtree, regardless of any child's
own `hidden`) renders nothing at all: no shape, no drag/select/interaction surface either,
the same as if it had never been declared.** Not to be confused with `show` (below,
D-026/D-039) — `show` only ever controls a *label*'s own visibility, never the element
itself. Written and toggled from the app's own hierarchy/layers panel, but it's a plain
element property like any other — an AI or a human can write it directly too. **Not yet
excluded from the load-time validation pass or drag-time position computation** — a hidden
subtree's geometry is still computed and can still be validated even though nothing renders
it; a known, documented v1 limitation, not an oversight.

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

**Note:** `kind` (symmetric vs. directional) stays write-only — nothing in the app branches
on it yet; it's syntax reserved for a future distinction, not a dead end expected to be
removed.

**Creating and removing a connection interactively:** either hold Ctrl (Cmd on macOS) and
drag one element onto another, or right-click an element and choose "Connect to…" (under its
"Connections" submenu) and then click the other element — both ways of *picking* a target
converge on the exact same confirmation step. Anywhere on the canvas works — the two don't
need to be touching. A valid target (not the source itself, and not a structural
ancestor/descendant of it) opens a small menu: "Connect to `<target>`" writes a plain
`connection` line; "Attach outside `<target>`" (offered only when the target is a
`shape: "rect"`, and the dragged element is a bare point) additionally sets
`placement: "outside"` on the source and snaps it to the nearest point on the target's
boundary — see the Drag-and-drop section below for what `"outside"` then does on later
drags. Picking a target via the menu can be cancelled with Escape or by clicking empty
canvas, same as releasing a Ctrl/Cmd-drag over nothing. The same "Connections" submenu lists
a "Disconnect from `<partner>`" row per existing connection, to remove one.
`settings { showConnections: true }` draws a thin dashed line between every connected pair's
centers as a permanent, opt-in visibility aid (off by default, mirroring `grid`).

**Multi-select (F-029):** Alt+click an element to add or remove it from the current
selection (Shift and Ctrl/Cmd are both already taken — dragging alone and connecting,
respectively). A plain click always collapses back to selecting just the one element
clicked, whether or not it was already part of a group. Dragging from inside a
multi-selection moves every selected element by the same delta at once; right-clicking a
member of the selection offers "Duplicate N Elements" / "Delete N Elements" in place of the
usual single-element actions, both as one undo step. Resize handles, keyboard nudge/resize,
and connect/disconnect stay single-element only — connecting is inherently a relationship
between two specific elements, and group-resize was never asked for.

**Marquee selection (F-047):** Alt+drag on empty canvas draws a rectangle and adds every
element whose rendered bounding box intersects it (not just ones fully enclosed) to the
current selection — the same Alt modifier as Alt+click, now sweeping a whole region at once
instead of one element at a time, and just as additive: it never clears a selection made a
moment earlier by Alt+click or by an earlier marquee. An Alt+drag that never actually moves
behaves like a plain click on empty canvas (deselects) rather than a zero-size marquee.
Plain (non-Alt) drag on empty canvas is unchanged — it still pans.

**Per-vertex dragging for `polygon`/`polyline` (D-139):** selecting one shows a small handle
at every one of its own `points`, the same visual language as a rect's 4 corner handles or a
circle's radius handle — dragging one moves just that vertex, reshaping the polygon rather
than scaling it. A literal `[x, y]` point edits directly; a point that references a sibling
corner element (the wall/corner pattern the shipped "Studio Apartment" example uses
throughout) instead moves that referenced element's own position — exactly as if it had been
dragged directly by its own anchor dot, so every other shape sharing that same corner moves
with it too. Blocked, with a message, if moving a polygon's own vertex would make it
self-intersect (respects `allowSelfIntersectingPolygons`, same as every other polygon edit);
meaningless for an open `polyline`, so never checked there.

**Proportional scale for `polygon`/`polyline` (D-143):** a selected shape also shows 4
square handles at its own bounding-box corners (offset just outside the shape itself so
they never sit exactly on top of a per-vertex handle, D-139's own, when a vertex happens to
coincide with a bbox corner) — dragging one scales every point by the same factor from the
diagonally-opposite corner, the same "fixed anchor, drag the other corner" gesture a rect's
own resize handles already use. Offered only when every corner-reference point the shape
uses is exclusive to it — a shape sharing so much as one corner with another element gets no
scale handles at all, since moving that corner would silently distort whatever else
references it too (an unresolved design question this version deliberately doesn't attempt
to solve, rather than guess at). No self-intersection check here — unlike per-vertex
dragging, a proportional scale from a fixed pivot can never turn an already-simple polygon
into a self-intersecting one (a genuinely provable fact about linear transforms, not just
untested).

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
- **`rotation` (degrees, clockwise, D-141) — `rect` only**, a flat sibling of
  `position`/`size`, default `0`. Meaningless for `circle` (rotationally symmetric);
  `polygon`/`polyline` already encode arbitrary orientation directly through their own
  points, no separate property needed. Resize handles, dimension/edge-length labels, and
  collision detection against a rotated `rect` all follow its true rotated footprint, not
  its unrotated bounding box. **Containment of a rotated `rect` (either the child or the
  parent) is also exact**, routed through the same general polygon-boundary check a
  polygon parent already used — but **`flush` and `placement: "outside"` against a rotated
  `rect` are unsupported**: both need exact edge-projection math this version doesn't have,
  so they warn and fall back to ordinary, unconstrained dragging instead of doing something
  silently wrong.

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

### Containment

D-032 mode 3: an element can be constrained to stay within its own parent's boundary when
dragged, sliding along whatever wall it hits rather than freezing outright — the same
"stay responsive, don't just reject" shape as collision checking above, but against the
*parent's* geometry instead of a sibling's.

```
element room {
  shape: "rect"
  size: [5m, 4m]
  childPlacement: "inside"          // default for every direct child that doesn't override it

  element sofa {                     // inherits "inside" from room
    shape: "rect"
    size: [1.6m, 0.7m]
    position: [1m, 1m]
  }

  element lamp {
    shape: "rect"
    size: [0.4m, 0.4m]
    position: [4m, 3m]
    placement: "free"                // overrides room's default — not constrained
  }
}
```

`placement` on the child always overrides `childPlacement` inherited from the parent —
unset on both means `"free"` (today's only-ever-implemented default: no constraint at
all). The two are deliberately different names, not one word reused at two scopes — "my
own placement" and "the default I hand to my children" are different claims (D-032).

**Scoped to what's actually validated, same shape as collision's own circle/polygon
caveat above:** only a `rect` child with a literal `position` participates. A `rect`
parent gets an exact, non-iterative per-axis clamp; a `polygon` parent falls back to a
tangent-slide approach that's safe (never lets the child escape) but not perfectly smooth
at every angle. A `circle`/`polyline`/shapeless parent has no unambiguous "inside" and
isn't checked. A child that inherited `"inside"` only as its parent's ambient default but
isn't itself a `rect` is silently left unconstrained, rather than warned about on every
drag — but an *explicit* `placement: "inside"` on an unsupported child does warn, since
that was a direct, specific request nothing can currently honor.

**`flush` is now built** — D-032's other half, a door-in-wall style attachment that's
*both* contained *and* pinned against one specific edge, layered on top of `"inside"`:

```
element window {
  shape: "rect"
  size: [1.2m, 0.2m]
  position: [1m, 0m]
  placement: "inside"
  flush: true                        // in addition to staying inside, stays pinned to
}                                     // whichever edge of the parent it's nearest to
```

`flush` is judged from wherever the element already sits — whichever of the parent's four
edges it's currently nearest becomes the locked edge. Dragging along that edge slides the
element within its own span (warning, not blocking, once it reaches either end); dragging
perpendicular to it is ignored outright, the same "motion off-axis doesn't do anything"
shape mode 2's outside-attached mechanic already uses. This doesn't let an element peel
off one edge and re-attach to a different one — a bigger gesture than this version
supports, same narrow scope as everywhere else placement is checked. Scoped identically
to plain `"inside"`: a `rect` child (literal size) against a `rect` parent only — declaring
`flush` against a `polygon`/other parent warns rather than silently doing nothing.

**Right-click's own "No placement (moves freely)" action (D-148) does more than clear
`placement`/`flush`:** it promotes the element one level up in the source, out of its own
parent's `{ }` block and into a sibling of it under the *grandparent* — not just freed from
containment, genuinely no longer nested inside that parent at all. Its `position` is
rewritten (or added, if it had none) to keep it exactly where it visually was. Scoped to
one level, matching `placement`'s own "always the immediate parent" rule — not a blanket
detach from the whole ancestry. If the parent is already the plan's own root element (this
grammar only ever allows one), there's nowhere to promote to, so it falls back to clearing
`placement`/`flush` in place, same as before this existed. An expression-valued `position`
degrades the same way, since it can't be safely rewritten to preserve where the element
sits.

**Still open:** containment for an element moved along by a `connection` rather than
dragged directly (the same F-004 gap collision checking has).

**An unrecognized `placement` value now warns, mid-drag, rather than being silently
ignored forever.** `"inside"` and `"outside"` (mode 2's own connected-point mechanic,
which has never needed an explicit declaration to work — see the Drag-and-drop section
above — but is now recognized as a real, named value too, so declaring it states intent
and gets checked) are the only two this language currently understands; anything else
(a typo, a guessed value) surfaces `placement "X" isn't recognized` the first time that
element is dragged, instead of the value doing nothing with no explanation anywhere.

**Keyboard nudge/resize (F-043):** once an element is selected, arrow keys move it by
`keyboardStep` in the pressed direction (reusing this same drag machinery — connected
elements move with it, exactly as a mouse-drag would), and Shift+arrow resizes it by the
same step — `Right`/`Left` adjust a `rect`'s width, `Down`/`Up` its height; any of the four
resizes a `circle`'s `radius` (`Right`/`Down` grow, `Left`/`Up` shrink), since it has no
independent width/height to pick between. A shapeless (bare point) element or a
`polygon`/`polyline` has no size this can adjust yet — Shift+arrow is a no-op on either,
reported via the same message area a drag warning would use, not silently ignored. Holding
a key coalesces the whole hold into one undo step (committed on release), rather than one
step per repeated keystroke. Arrow keys keep their ordinary meaning (moving the caret)
whenever the code editor or any text field has focus.

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
(D-032, see "Containment" above) this doesn't check. `polyline` and shapeless elements don't participate — they're
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

**`styles` (F-027) — named style presets, referenced from an element's own `style` by a
plain string instead of repeating the same object.** Three elements meant to share a color
today either repeat the same `style: {...}` object three times (drift risk — edit one,
forget the others — and real token cost for an AI generating the plan, D-017) or nothing
at all. `settings { styles: { ... } }` defines named presets in the preamble; any
element's `style` may be either the usual inline object (unchanged) or a string naming one:

```
settings {
  styles: {
    wall: { stroke: "#444", strokeWidth: 0.1 }
  }
}
element wall_a { shape: "polyline", points: [c1, c2], style: "wall" }
element wall_b { shape: "polyline", points: [c2, c3], style: "wall" }
```

A dedicated resolution step, not routed through the general expression system, deliberately:
`style: { fill: otherElement.style.fill }` looks like it should work the same way
(expressions already resolve `parent.size.x`-style paths, D-008) but doesn't — it parses
with no error and renders the expression's own unevaluated source as a literal, broken SVG
attribute, since `style` was never wired to invoke expression values the way
`position`/`size` already are. Presets sidestep that failure mode entirely rather than
inheriting it. An unrecognized preset name warns (in the browser console) and renders with
no style, rather than a hard parse error — matching this language's existing pattern of
surfacing a bad value rather than rejecting the whole plan over it (D-032/D-044's own
unrecognized-placement warnings). Deliberately **not** a partial merge: an element's
`style` is either the full inline object or the full preset, never both combined — the
same override shape (a value fully replaces the default, nothing merges) `placement` vs.
`childPlacement` and per-element `edgeLengths` already use elsewhere in this language.

**`version` (F-025) — which revision of this language a plan was written against, purely a
forward-compatibility marker.** `settings { version: 1 }` is the current value; every
plan the app itself creates (new plans, the three shipped examples) now sets it. Nothing
in the parser or renderer branches on it yet, and an omitted `version` is treated exactly
like `version: 1` — the language hasn't had a breaking change since this field was
introduced, so there's nothing yet for it to disambiguate. It exists because the language
has already changed shape more than once since the first real plans existed (`placement`,
`flush`, `compose`, and `childPlacement` were all added after that point) with no way at
all to tell which revision an old saved plan assumed — costless to add now, expensive to
retrofit once plans are saved somewhere longer-lived than a single browser's own
`localStorage`.

**`grid` (F-014/F-031/D-149) — a visual background grid, and (by default, once declared)
the increment every mouse/touch drag and resize snaps to.** `settings { grid: { size: 1,
type: "checker" } }` — `size` in meters (default `1`), `type` `"checker"` (default) or
`"lines"`. Editable from the header's own View tab too, not just by hand: the "Grid"
toggle's own flyout has Squares/Lines buttons and a size field that write `type`/`size`
directly — the toggle button itself still just turns `settings.grid` on/off as before.

Declaring `grid` at all makes every ordinary drag and every resize-handle drag (D-116)
land on an exact multiple of `size` by default — hard snap, no modifier-key exception. A
rect resize handle's own dragged corner snaps to a grid intersection directly; a circle's
radius handle snaps the resulting radius to a clean multiple of `size` instead (the
cursor's raw position on the circle's edge has no reason to land on an intersection at
all); a polygon/polyline's own per-vertex handle (D-139) snaps the dragged point to a grid
intersection, same as a rect corner. Containment/collision clamping still runs after
snapping and can shrink the result further, same as it already overrides an unsnapped
drag; a connected group still moves by one shared, already-snapped delta rather than each
member re-snapping independently, preserving the rigid-group guarantee connections already
depend on.

**Visibility and snap are two independent knobs (D-149), not one coupled setting anymore:**
- `snap: false` shows the grid without forcing discrete snapping.
- `layer: "none"` keeps snapping active with no visual pattern rendered at all — a
  snap-only grid, `size` still meaningful as the increment.
- `layer: "front"` (default `"back"`) paints the grid over every shape instead of behind
  them, meant to pair with a reduced `opacity` (default `1`, not auto-lowered just because
  `layer` is `"front"` — a full-opacity front grid would otherwise hide the plan
  underneath it entirely). `pointer-events: none` on the grid's own rect (unchanged either
  way) keeps a front grid from ever intercepting a click or drag meant for what's rendered
  beneath it.

Omitting `snap`/`layer`/`opacity` entirely preserves the exact original behavior: a
declared grid renders behind every shape and snaps, exactly as before this decoupling
existed.

**`keyboardStep` (F-043) — the distance (in meters) one arrow-key press moves or resizes
the selected element.** `settings { keyboardStep: 0.1 }` is the default if omitted; one
shared value drives both the plain-arrow move and the Shift+arrow resize described under
"Editing and drag-and-drop" above. Deliberately independent of `grid`'s own `size` even
though a declared grid now affects mouse/touch dragging (F-031) — tying keyboard-step to
it would make this shortcut's behavior silently depend on an unrelated setting being
declared at all, purely because both happen to be a distance in meters.

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
  a polygon parent still falls back to that general, less-validated approach. Scoped
  narrowly: only a `rect` child with a literal `position`, no corner-refs or other
  connections. **Since promoted into [docs/](../docs/)'s `interactivity-module.js`** — see
  "Containment" above, which now also covers `flush` (D-032's other half, D-071).
- [Prototypes/17-module-composition/](../Prototypes/17-module-composition/) — tests D-011's
  third module promise: a module offering a reusable, higher-level building block
  "composed from Element and Connection" — literally the wall-with-a-door example this
  document has used illustratively throughout. `wall-with-door-module.js` expands one
  compact `compose: "wallWithDoor"` element into the same three-piece wall/door/wall
  structure the shipped `apartment` example writes by hand as four corner elements. Needed
  exactly one new core hook, `registerBeforeRender`, letting a module inject synthesized
  child nodes before `render()` runs — rendering itself needed zero composition-specific
  code once that existed. **Since promoted into [docs/](../docs/)** (D-071), drag-editability
  included: dragging a wall segment moves the whole composite (`from`/`to` shift together);
  dragging the door slides `doorAt` along the wall, clamped to its own span — solved
  backward into the composite's own parameters, the way D-046 originally flagged as
  needed but genuinely harder than D-012's existing per-property solving. `docs/`'s own
  `parse()` had to split into a bare parse and a `parseExpanded` (parse + run every
  `registerBeforeRender` callback + reindex) — module loading itself depends on a first,
  un-expanded parse to discover which modules a plan even declares, so expansion can't be
  folded into parsing itself without a circular dependency.
