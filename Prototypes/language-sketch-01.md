# Language sketch: 3 example plans

Throwaway syntax to explore what the plan language needs to express, per
[planning/decisions.md](../planning/decisions.md) (declarative core + expressions,
local-scoped references, real-world units).
Not a proposed final syntax — just enough concrete detail to spot the shared primitives.

## 1. A room (floor plan)

```
area room "Bedroom" {
  size: [4m, 3.5m]

  boundary {
    edge north { opening door { at: 1.2m, width: 0.9m } }
    edge east  { }
    edge south { opening window { at: 1.5m, width: 1.2m } }
    edge west  { }
  }

  object bed {
    type: "bed_double"
    size: [1.6m, 2m]
    position: [0.3m, 0.3m]
  }

  object desk {
    type: "desk"
    size: [1.2m, 0.6m]
    position: [size.x - 1.2m - 0.2m, 0.2m]   // expression referencing parent area's size
  }
}
```

## 2. A campervan interior

```
area van "Campervan Interior" {
  shape: "rounded-rect"        // not every area is an axis-aligned rectangle
  size: [5.4m, 1.9m]

  object kitchen_unit {
    type: "cabinet"
    size: [0.6m, 1.2m]
    position: [0, 0]
  }

  object bed {
    type: "bed_single"
    size: [1.9m, 0.7m]
    position: [size.x - 1.9m, 0]   // expression again, same pattern as the room
  }

  object seat_swivel {
    type: "seat"
    size: [0.5m, 0.5m]
    position: [0.3m, size.y - 0.5m]
  }
}
```

## 3. An outdoor layout

```
area garden "Backyard" {
  shape: "polygon"
  points: [[0,0], [12m,0], [12m,8m], [3m,8m], [0,5m]]   // irregular plot, not a rectangle

  area patio "Patio" {                // an area nested inside another area
    size: [4m, 3m]
    position: [1m, 1m]
    surface: "concrete"
  }

  object tree {
    type: "tree_large"
    position: [9m, 6m]
  }

  object walkway {
    shape: "polyline"
    points: [[2m,4m], [6m,4m], [6m,7m]]
    width: 0.9m
  }
}
```

## What's shared across all three

- Every one of these is a **bounded region with a shape** (rect, rounded-rect, polygon)
  that can **contain children** — either nested areas (patio inside garden) or objects
  (furniture/fixtures/trees) placed within it, positioned in the parent's local coordinate space.
- Every placed thing has a **position expression that can reference the parent's own
  properties** (`size.x`, `size.y`) — this is the local/scoped-reference pattern from
  [decisions.md](../planning/decisions.md#d-010-expression-scope).
- "Walls with doors/windows" only showed up in the room example — the van and garden don't
  have that concept at all (a van's boundary is just its shape; the garden's plot boundary
  has no openings). So `boundary`/`edge`/`opening` look like they should NOT be a core
  primitive — they look like an indoor-specific specialization, which fits the module system
  (core aim #3): an "architectural boundary" module would add wall/door/window semantics on
  top of a generic area shape, rather than the core language building it in.
- A "path" (walkway) looks like it's just an **object with a polyline shape**, not a
  separate primitive.

This suggests the core language may need as few as **two primitives**: a container
("area", can nest, has a shape/boundary) and a leaf ("object", placed within a container,
has a shape/size/position). Possibly even just **one**: a generic node that can optionally
contain children — see open question raised back to the user.

---

**Update:** resolved in [planning/decisions.md](../planning/decisions.md#d-013-core-primitives) (D-013).
The sketch above is superseded on two points: `boundary`/`edge`/`opening` and `type` are
NOT part of the core language after all — they were too specific to the room example. The
actual core is just **Node** (coordinates + plain shape/style properties + optional
children) and **Connection** (an attachment/relationship link between two nodes). A wall
with a door would now be user-composed from nodes + connections rather than written with
dedicated keywords, e.g. roughly:

```
node wall_a { shape: "line", points: [[0,0], [1.2m,0]] }
node door   { shape: "line", points: [[1.2m,0], [2.1m,0]], style: "opening" }
node wall_b { shape: "line", points: [[2.1m,0], [4m,0]] }
connection { from: wall_a, to: door }
connection { from: door, to: wall_b }
```

Still just illustrative — connection semantics (D-014) are resolved: dragging `door` does
drag `wall_b` along. What's still open is how far the constraint-solving goes when
connections conflict — see [planning/open-questions.md](../planning/open-questions.md#f-001-constraint-solving-scope) (F-001).
