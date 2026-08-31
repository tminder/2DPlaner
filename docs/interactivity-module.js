// Interactivity module (D-020/D-031): loaded like any other external module, declared in
// the plan's own preamble. Core only parses and renders; every interactive behavior —
// drag-to-move, selection, connect/disconnect, hover previews, the right-click menu — lives
// here, built entirely against window.PlanCore.
(function () {
  const core = window.PlanCore;
  if (!core) {
    console.error("interactivity-module.js: window.PlanCore not found — must load after the core script.");
    return;
  }

  function injectStyles(styleEl) {
    styleEl.textContent = `
      #plan-root { position: relative; user-select: none; -webkit-user-select: none; }
        /* also anchors the scale bar / fit button overlays; user-select is defense-in-depth
           alongside handlePointerDown's preventDefault against a mousedown-drag starting a
           native text selection instead of (or alongside) our own drag/pan. */
      #plan-root svg { cursor: grab; } /* empty canvas: click-drag pans */
      #plan-root.dragging svg { cursor: grabbing; }
      #plan-root svg [data-id] { cursor: grab; }
      #plan-root svg [data-id]:active { cursor: grabbing; }
      #plan-root:not(.dragging) svg .obj:hover { filter: drop-shadow(0 0 2px rgba(51,119,255,0.55)); }
      /* Core's label hover-reveal rule is a plain rendering feature with no idea a drag can
         be in progress; this overrides it with higher specificity while #plan-root carries
         "dragging", rather than making core aware of interactivity state. */
      #plan-root.dragging svg .obj:hover + .annotation[data-show="hover"] { opacity: 0 !important; }
      svg .obj.connected-highlight { filter: drop-shadow(0 0 3px #e80) drop-shadow(0 0 3px #e80); }
      /* A fixed stroke-width doesn't scale with the shape's own — a wall already stroked
         thicker than 3px actually looked *thinner* once selected, backwards from what a
         selection indicator should do. A glow (matching hover's own pattern above, same
         2px size for consistency, a distinct color to stay tell-apart-able from it) never
         touches stroke-width at all, so it reads consistently regardless of how thick or
         thin the shape's own stroke already is. */
      svg .obj.selected { filter: drop-shadow(0 0 2px rgba(124,58,237,0.55)); }
      svg .icon-btn { cursor: pointer; }
      svg .icon-btn circle { transition: r 0.1s; }
      #plan-root:not(.dragging) svg .icon-btn:hover circle { r: 11; }
      #plan-root:not(.dragging) .anchor-hit:hover { fill: #e33; opacity: 0.7; }
      svg .obj.corner-preview { stroke: #e33 !important; filter: drop-shadow(0 0 2px #e33); }
      .context-menu { position: fixed; z-index: 1000; margin: 0; padding: 4px 0; min-width: 170px;
        list-style: none; background: #fff; border: 1px solid #ccc; border-radius: 6px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.18); font-family: system-ui, sans-serif; font-size: 13px; }
      .context-menu[hidden] { display: none; }
      .context-menu li { padding: 6px 16px; cursor: pointer; }
      .context-menu li:hover { background: #eef2ff; }
      .context-menu li.danger { color: #a11; }

      #interactivity-scale-bar { position: absolute; right: 10px; bottom: 10px;
        display: flex; flex-direction: column; align-items: center; pointer-events: none;
        font-family: system-ui, sans-serif; font-size: 11px; color: #333; }
      #interactivity-scale-bar .bar { height: 6px; border-left: 1.5px solid #333;
        border-right: 1.5px solid #333; border-bottom: 1.5px solid #333; }
      #interactivity-scale-bar .label { margin-top: 2px; background: rgba(255,255,255,0.85);
        padding: 0 4px; border-radius: 2px; }
      #interactivity-fit-btn { position: absolute; right: 10px; top: 10px; z-index: 1;
        font: inherit; font-size: 0.8rem; padding: 0.3rem 0.6rem; border: 1px solid #ccc;
        border-radius: 5px; background: rgba(255,255,255,0.9); cursor: pointer; }
      #interactivity-fit-btn:hover { background: #fff; }
    `;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  }

  // Belt-and-braces: core evicts this module from its loaded-cache on cleanup (see
  // registerModuleCleanup below), so no stale DOM should ever survive a reload — but start
  // from a clean slate rather than risk a duplicate if one somehow did.
  document.getElementById("interactivity-context-menu")?.remove();
  document.getElementById("interactivity-module-style")?.remove();
  document.getElementById("interactivity-scale-bar")?.remove();
  document.getElementById("interactivity-fit-btn")?.remove();

  const styleEl = document.createElement("style");
  styleEl.id = "interactivity-module-style";
  document.head.appendChild(styleEl);
  injectStyles(styleEl);

  const contextMenuEl = document.createElement("ul");
  contextMenuEl.id = "interactivity-context-menu";
  contextMenuEl.className = "context-menu";
  contextMenuEl.hidden = true;
  document.body.appendChild(contextMenuEl);

  const scaleBarEl = document.createElement("div");
  scaleBarEl.id = "interactivity-scale-bar";
  scaleBarEl.innerHTML = `<div class="bar"></div><div class="label"></div>`;
  core.rootEl.appendChild(scaleBarEl);
  const scaleBarBarEl = scaleBarEl.querySelector(".bar");
  const scaleBarLabelEl = scaleBarEl.querySelector(".label");

  const fitBtnEl = document.createElement("button");
  fitBtnEl.id = "interactivity-fit-btn";
  fitBtnEl.type = "button";
  fitBtnEl.textContent = "Fit";
  fitBtnEl.title = "Reset zoom and pan";
  core.rootEl.appendChild(fitBtnEl);

  // ---------- Module-owned state — core has none of this. ----------
  let program = null;
  let lastBboxes = {};
  let selectedId = null;
  let drag = null;
  let contextMenuItems = [];

  // ---------- Pan/zoom state ----------
  // viewState: the viewBox {x,y,width,height} currently applied on top of whatever core
  // just rendered, or null to mean "use core's own fit as-is". lastCoreFit: core's fit box
  // as of the most recent render, captured *before* viewState is applied over it — needed
  // both to detect "core just re-fit the content" (compared against the previous value, see
  // handleRendered) and as the stable reference to clamp zoom range against.
  let viewState = null;
  let lastCoreFit = null;
  let canvasDrag = null; // pointerdown on empty space: pending pan-or-click, see handlePointerDown

  // ---------- Adjacency / contact-point / snap geometry ----------
  const TOUCH_TOLERANCE = 0.05;

  // A bare position-only element (no shape) gets a degenerate, zero-size box rather than
  // being excluded from connect/disconnect entirely.
  function isPointBox(b) { return b.left === b.right && b.top === b.bottom; }

  function isAdjacent(a, b) {
    if (isPointBox(a) || isPointBox(b)) {
      if (isPointBox(a) && isPointBox(b)) {
        return Math.abs(a.left - b.left) <= TOUCH_TOLERANCE && Math.abs(a.top - b.top) <= TOUCH_TOLERANCE;
      }
      const point = isPointBox(a) ? a : b, rect = isPointBox(a) ? b : a;
      const onVerticalEdge = (Math.abs(point.left - rect.left) <= TOUCH_TOLERANCE || Math.abs(point.left - rect.right) <= TOUCH_TOLERANCE)
        && point.top >= rect.top - TOUCH_TOLERANCE && point.top <= rect.bottom + TOUCH_TOLERANCE;
      const onHorizontalEdge = (Math.abs(point.top - rect.top) <= TOUCH_TOLERANCE || Math.abs(point.top - rect.bottom) <= TOUCH_TOLERANCE)
        && point.left >= rect.left - TOUCH_TOLERANCE && point.left <= rect.right + TOUCH_TOLERANCE;
      return onVerticalEdge || onHorizontalEdge;
    }
    // Two rects: adjacent means genuine edge contact — one axis's gap near zero while the
    // other axis's ranges actually overlap — not just any bounding-box overlap (which would
    // also match one rect containing another) and not corner-only touching.
    const xGap = Math.max(a.left, b.left) - Math.min(a.right, b.right);
    const yGap = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
    const xTouch = Math.abs(xGap) <= TOUCH_TOLERANCE;
    const yTouch = Math.abs(yGap) <= TOUCH_TOLERANCE;
    if (xTouch && yGap < 0) return true;
    if (yTouch && xGap < 0) return true;
    return false;
  }

  // Which edge of `rect` a point is nearest to, and within that edge's span — shared by
  // icon placement, connect-snap, and constrained-slide-along-the-wall.
  function nearestRectEdge(point, rect) {
    const withinYSpan = point.top >= rect.top - TOUCH_TOLERANCE && point.top <= rect.bottom + TOUCH_TOLERANCE;
    const withinXSpan = point.left >= rect.left - TOUCH_TOLERANCE && point.left <= rect.right + TOUCH_TOLERANCE;
    const candidates = [];
    if (withinYSpan) {
      candidates.push({ dist: Math.abs(point.left - rect.left), edge: "left" });
      candidates.push({ dist: Math.abs(point.left - rect.right), edge: "right" });
    }
    if (withinXSpan) {
      candidates.push({ dist: Math.abs(point.top - rect.top), edge: "top" });
      candidates.push({ dist: Math.abs(point.top - rect.bottom), edge: "bottom" });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0];
  }

  // How far to place a connect/disconnect icon from a point element's own position. Not
  // zero: an icon rendered exactly on a point's anchor-hit circle would win every
  // pointerdown there (painted after anchors), so a click meant to drag the point would
  // instead re-fire the icon's action. 0.35m (21px at M=60) clears both hit radii.
  const ICON_POINT_OFFSET = 0.35;

  function contactPoint(a, b) {
    if (isPointBox(a) && isPointBox(b)) return [a.left, a.top - ICON_POINT_OFFSET];
    if (isPointBox(a) || isPointBox(b)) {
      const point = isPointBox(a) ? a : b, rect = isPointBox(a) ? b : a;
      const nearest = nearestRectEdge(point, rect) ?? { edge: "top" };
      const ox = nearest.edge === "left" ? -1 : nearest.edge === "right" ? 1 : 0;
      const oy = nearest.edge === "top" ? -1 : nearest.edge === "bottom" ? 1 : 0;
      return [point.left + ox * ICON_POINT_OFFSET, point.top + oy * ICON_POINT_OFFSET];
    }
    const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (xOverlap < yOverlap) {
      const cx = a.right <= b.left ? (a.right + b.left) / 2 : (b.right + a.left) / 2;
      const cy = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
      return [cx, cy];
    }
    const cy = a.bottom <= b.top ? (a.bottom + b.top) / 2 : (b.bottom + a.top) / 2;
    const cx = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
    return [cx, cy];
  }

  function iconMarkup(action, cx, cy, aId, bId) {
    const color = action === "connect" ? "#2a8a3e" : "#c0392b";
    const symbol = action === "connect"
      ? `<line x1="${cx-4}" y1="${cy}" x2="${cx+4}" y2="${cy}" stroke="white" stroke-width="2" stroke-linecap="round" />
         <line x1="${cx}" y1="${cy-4}" x2="${cx}" y2="${cy+4}" stroke="white" stroke-width="2" stroke-linecap="round" />`
      : `<line x1="${cx-4}" y1="${cy-4}" x2="${cx+4}" y2="${cy+4}" stroke="white" stroke-width="2" stroke-linecap="round" />
         <line x1="${cx-4}" y1="${cy+4}" x2="${cx+4}" y2="${cy-4}" stroke="white" stroke-width="2" stroke-linecap="round" />`;
    return `<g class="icon-btn" data-action="${action}" data-a="${aId}" data-b="${bId}" pointer-events="all">
      <circle cx="${cx}" cy="${cy}" r="9" fill="${color}" stroke="white" stroke-width="1.5" />
      ${symbol}
    </g>`;
  }

  // Rect bboxes plus a degenerate box for any bare position-only element — used for the
  // connect-snap check and (via handleRendered) the icon overlay itself.
  function computeBboxes(node, positions, bboxes) {
    const abs = positions[node.id];
    if (node.props.shape === "rect" && node.props.size) {
      const w = core.numOf(node.props.size[0]), h = core.numOf(node.props.size[1]);
      bboxes[node.id] = { left: abs[0], top: abs[1], right: abs[0] + w, bottom: abs[1] + h };
    } else if (node.props.position && !node.props.shape) {
      bboxes[node.id] = { left: abs[0], top: abs[1], right: abs[0], bottom: abs[1] };
    }
    for (const child of node.children) computeBboxes(child, positions, bboxes);
  }

  // Where a point should land when snapping onto a rect: the nearest edge it's already
  // aligned with, correcting only the perpendicular coordinate.
  function pointRectSnapDelta(point, rect) {
    const nearest = nearestRectEdge(point, rect);
    if (!nearest || nearest.dist > TOUCH_TOLERANCE) return null;
    if (nearest.edge === "left") return { dx: rect.left - point.left, dy: 0 };
    if (nearest.edge === "right") return { dx: rect.right - point.left, dy: 0 };
    if (nearest.edge === "top") return { dx: 0, dy: rect.top - point.top };
    return { dx: 0, dy: rect.bottom - point.top };
  }

  // ---------- Collision checking (D-041) ----------
  // Only rect/circle/polygon participate — a polyline (wall) and a bare/shapeless element
  // are meant to touch/connect by design (D-014/D-018), not something to police for
  // overlap. Scoped to siblings (same parent) only: a chair inside a room isn't
  // "colliding" with the room, that's containment, a different relationship (D-032) this
  // doesn't touch. Zero-tolerance geometric tests (proper edge crossings, or one shape's
  // point strictly inside the other) rather than an epsilon-inflated buffer — two shapes
  // resting exactly flush already read as non-colliding without needing one, since D-014's
  // whole adjacency/connection system already depends on exact touching being legitimate,
  // not just tolerated.
  const COLLISION_EPS = 0.01;

  function pointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      const crosses = (yi > pt[1]) !== (yj > pt[1]) &&
        pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function pointToSegmentDistance(p, a, b) {
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    let t = len2 === 0 ? 0 : ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
  }

  // Same cross-product proper-crossing test as core's own polygonSelfIntersects — a
  // module-local copy (not exposed via PlanCore) since it's a generic segment primitive,
  // not something specific to the self-intersection check core built it for.
  function segmentsProperlyIntersect(p1, p2, p3, p4) {
    const d = (a, b, c) => (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
    const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  function rectCorners(r) {
    return [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]];
  }

  // No edge of A crosses an edge of B, and neither polygon starts inside the other =>
  // genuinely separate (or only touching, which isn't a crossing). Works for non-convex
  // polygons too, matching this language's own polygons (D-018's shared-corner deformation
  // has never been restricted to convex shapes).
  function polygonsOverlap(polyA, polyB) {
    for (let i = 0; i < polyA.length; i++) {
      const a1 = polyA[i], a2 = polyA[(i + 1) % polyA.length];
      for (let j = 0; j < polyB.length; j++) {
        const b1 = polyB[j], b2 = polyB[(j + 1) % polyB.length];
        if (segmentsProperlyIntersect(a1, a2, b1, b2)) return true;
      }
    }
    if (polyA.length && pointInPolygon(polyA[0], polyB)) return true;
    if (polyB.length && pointInPolygon(polyB[0], polyA)) return true;
    return false;
  }

  function circlePolygonOverlap(center, radius, poly) {
    if (pointInPolygon(center, poly)) return true;
    for (let i = 0; i < poly.length; i++) {
      if (pointToSegmentDistance(center, poly[i], poly[(i + 1) % poly.length]) < radius - COLLISION_EPS) return true;
    }
    return false;
  }

  function shapesOverlap(a, b) {
    if (a.kind === "rect" && b.kind === "rect") {
      const xGap = Math.max(a.left, b.left) - Math.min(a.right, b.right);
      const yGap = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
      return xGap < -COLLISION_EPS && yGap < -COLLISION_EPS;
    }
    if (a.kind === "circle" && b.kind === "circle") {
      return Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r - COLLISION_EPS;
    }
    if (a.kind === "circle" || b.kind === "circle") {
      const circle = a.kind === "circle" ? a : b;
      const other = a.kind === "circle" ? b : a;
      return circlePolygonOverlap([circle.cx, circle.cy], circle.r, other.kind === "rect" ? rectCorners(other) : other.points);
    }
    const polyA = a.kind === "rect" ? rectCorners(a) : a.points;
    const polyB = b.kind === "rect" ? rectCorners(b) : b.points;
    return polygonsOverlap(polyA, polyB);
  }

  // allowCollisions on the element itself always overrides the plan-wide settings default
  // (unset means "inherit the plan default") — same override pattern as D-038's edgeLengths.
  // Defaults to allowed (checking off), unlike its settings-block neighbors
  // (allowSelfIntersectingPolygons/collision checking's own original default): a common,
  // legitimate pattern — a rug under a table, say — geometrically overlaps on purpose, so
  // this has to be opt-in per plan rather than silently blocking drags nothing asked for.
  function collisionsAllowedFor(node, settings) {
    if (typeof node.props.allowCollisions === "boolean") return node.props.allowCollisions;
    return settings.allowCollisions !== false;
  }

  // A rect/circle/polygon's own collision geometry at its *current* (unmoved) position.
  function solidGeometryFor(node, positions) {
    const ownAbs = positions[node.id];
    if (!ownAbs) return null;
    if (node.props.shape === "rect" && node.props.size) {
      const w = core.numOf(node.props.size[0]), h = core.numOf(node.props.size[1]);
      return { kind: "rect", left: ownAbs[0], top: ownAbs[1], right: ownAbs[0] + w, bottom: ownAbs[1] + h };
    }
    if (node.props.shape === "circle" && node.props.radius !== undefined) {
      return { kind: "circle", cx: ownAbs[0], cy: ownAbs[1], r: core.numOf(node.props.radius) };
    }
    if (node.props.shape === "polygon" && node.props.points) {
      return { kind: "polygon", points: node.props.points.map((pt) => core.resolvePointAbs(pt, ownAbs, positions)) };
    }
    return null; // polyline and shapeless elements don't participate in collision checking
  }

  // Same geometry as solidGeometryFor, but shifted by the drag's own (dx, dy) — every point
  // of a polygon (literal or corner-reference alike) moves by the same delta in a
  // whole-shape drag, so resolving each one at its current position and then shifting it is
  // correct for both kinds, and for any mix of the two on one shape.
  function proposedGeometryFor(node, dx, dy, positions) {
    if (node.props.shape === "rect" && node.props.position) {
      const [x, y] = positions[node.id];
      const w = core.numOf(node.props.size[0]), h = core.numOf(node.props.size[1]);
      return { kind: "rect", left: x + dx, top: y + dy, right: x + dx + w, bottom: y + dy + h };
    }
    if (node.props.shape === "circle" && node.props.position) {
      const [x, y] = positions[node.id];
      return { kind: "circle", cx: x + dx, cy: y + dy, r: core.numOf(node.props.radius) };
    }
    if (node.props.shape === "polygon" && node.props.points) {
      const ownAbs = positions[node.id];
      const points = node.props.points.map((pt) => {
        const [x, y] = core.resolvePointAbs(pt, ownAbs, positions);
        return [x + dx, y + dy];
      });
      return { kind: "polygon", points };
    }
    return null;
  }

  // Checked against siblings only (see the section note above) — not elements dragged
  // along via a connection (F-004 scope note: a first, common-case implementation, not
  // exhaustive over every way a drag can move more than one element at once). Returns the
  // first overlapping sibling's own geometry (or null) rather than a bare boolean — a
  // tangent-slide version of clampToNoCollision once needed to know *what* it was sliding
  // against; the current axis-separated version only needs the boolean, but there's no
  // other caller to simplify this for.
  function firstCollidingSibling(node, parent, geometry, base, positions) {
    if (!geometry || !parent) return null;
    for (const sibling of parent.children) {
      if (sibling.id === node.id) continue;
      if (collisionsAllowedFor(sibling, base.settings)) continue;
      const siblingGeometry = solidGeometryFor(sibling, positions);
      if (siblingGeometry && shapesOverlap(geometry, siblingGeometry)) return siblingGeometry;
    }
    return null;
  }

  // Binary-searches the largest t in [0,1] such that check(t) doesn't collide, given
  // check(0) is known safe and check(1) is known not — returns delta scaled by that t
  // (preserves delta's own sign, since t only ever shrinks toward 0).
  function clampAxisDelta(check, delta) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (check(mid)) hi = mid; else lo = mid;
    }
    return delta * lo;
  }

  // A hard accept/reject on the full attempted (dx, dy) sounds right but isn't: dx/dy are
  // cumulative from the drag's original mousedown point (not incremental), so rejecting the
  // whole move freezes the shape wherever it last fit while the cursor keeps drifting —
  // every direction then feels "blocked" until the user retraces the entire drifted
  // distance back to a delta that fits again.
  //
  // Resolved by clamping each axis independently: X is only reduced if moving in X *alone*
  // (Y held at zero) would itself collide, binary-searched to the largest safe fraction; Y
  // is then resolved the same way, holding X at whatever it ended up at. This is exact for
  // any number of colliding siblings at once — collides() already checks all of them
  // together, not one blocker at a time — and for two axis-aligned rects specifically, X/Y
  // decomposition *is* sliding along the wall, not an approximation of it, since a rect's
  // own boundary is never anything but horizontal or vertical.
  //
  // A tangent-slide version was tried and reverted back to this: projecting the remaining
  // move onto the blocking shape's own local edge/tangent direction generalizes past
  // axis-aligned walls in principle, but the tangent is only well-defined relative to a
  // single blocker (whichever sibling the geometry check happens to return first), and
  // could flip discontinuously near a corner or between two nearby obstacles — reported
  // still not fully working after several correction rounds, never validated as actually
  // correct for a circle or polygon blocker either. This version is exact for the common
  // case (rect furniture against rect furniture) and merely safe, if not perfectly smooth,
  // against a circle or polygon — never lets an overlap through, just may not track a
  // curved boundary as fluidly — an accepted limitation rather than an unvalidated attempt
  // at solving it.
  function clampToNoCollision(node, parent, dx, dy, base, positions, warnings) {
    if (collisionsAllowedFor(node, base.settings)) return [dx, dy];
    const collides = (tx, ty) => !!firstCollidingSibling(node, parent, proposedGeometryFor(node, tx, ty, positions), base, positions);
    if (!collides(dx, dy)) return [dx, dy];

    let resolvedDx = dx;
    if (collides(dx, 0)) {
      resolvedDx = collides(0, 0) ? 0 : clampAxisDelta((t) => collides(dx * t, 0), dx);
    }
    let resolvedDy = dy;
    if (collides(resolvedDx, dy)) {
      resolvedDy = collides(resolvedDx, 0) ? 0 : clampAxisDelta((t) => collides(resolvedDx, dy * t), dy);
    }

    if (resolvedDx !== dx || resolvedDy !== dy) {
      warnings.push(`${node.id}: stopped by a collision. Set allowCollisions: true to allow this.`);
    }
    return [resolvedDx, resolvedDy];
  }

  // ---------- Containment (D-032 mode 3, "inside") ----------
  // Promoted from Prototypes/16-parent-child-placement/ once validated there — reuses
  // this section's own pointInPolygon/pointToSegmentDistance/rectCorners/solidGeometryFor
  // rather than duplicating them, the one thing the standalone prototype couldn't do.
  // Deliberately as narrow as what was actually validated: a rect child (literal size)
  // against a rect or polygon parent. Same reasoning as D-041's own collision fallback: a
  // rect-in-rect parent gets clampRectToStayInsideRect's exact, non-iterative clamp; a
  // polygon parent falls back to clampToStayInside's tangent-slide, accepted as safe-but-
  // not-perfectly-smooth rather than fully validated (D-032's prototype note: found unreliable
  // right at a corner when built against a shape *center*, not the escaping corner itself —
  // this version fixes that by tracking the child's own corners, but the tangent-slide part
  // of the algorithm carries the same unproven-generality caveat D-041's fallback does).

  // A child's own `placement` overrides its parent's `childPlacement` default — same
  // override shape as D-038/D-041's element-vs-settings pattern (D-032).
  function placementFor(node, parent) {
    if (typeof node.props.placement === "string") return node.props.placement;
    if (parent && typeof parent.props.childPlacement === "string") return parent.props.childPlacement;
    return null;
  }

  // The parent's own boundary as a corner list — scoped to rect/polygon, the only shapes
  // with an unambiguous "inside" (D-032). A circle/polyline/shapeless parent returns null.
  function parentBoundaryPolygon(parentNode, positions) {
    const geom = solidGeometryFor(parentNode, positions);
    if (!geom) return null;
    if (geom.kind === "rect") return rectCorners(geom);
    if (geom.kind === "polygon") return geom.points;
    return null;
  }

  function childRectCornersAt(node, dx, dy, positions) {
    const [x, y] = positions[node.id];
    const w = core.numOf(node.props.size[0]), h = core.numOf(node.props.size[1]);
    return rectCorners({ left: x + dx, top: y + dy, right: x + dx + w, bottom: y + dy + h });
  }

  function isContained(childCorners, parentPoly) {
    return childCorners.every((p) => pointInPolygon(p, parentPoly));
  }

  // Nearest-edge normal of the parent boundary, used only to build the sliding tangent
  // below — its sign (in vs. out) doesn't matter here, unlike clampToNoCollision's use of
  // a normal-like direction where the push-back direction has to be right.
  function nearestEdgeNormal(point, poly) {
    let best = null;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const dist = pointToSegmentDistance(point, a, b);
      if (best && dist >= best.dist) continue;
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const elen = Math.hypot(ex, ey) || 1;
      best = { dist, normal: [-ey / elen, ex / elen] };
    }
    return best ? best.normal : null;
  }

  // Binary-search the boundary point along the attempted move where the child would first
  // leave the parent (reusing clampAxisDelta above), then slide the remaining distance
  // along the parent boundary's tangent at that point — fallback for a polygon parent only;
  // a rect parent uses the exact clampRectToStayInsideRect below instead.
  function clampToStayInside(node, parentPoly, dx, dy, positions, warnings) {
    const escapes = (tx, ty) => !isContained(childRectCornersAt(node, tx, ty, positions), parentPoly);
    if (!escapes(dx, dy)) return [dx, dy];
    if (escapes(0, 0)) return [0, 0]; // already outside even at the drag's own start
    warnings.push(`${node.id}: stays inside '${node.parentId}'`);

    let curDx = dx, curDy = dy;
    for (let pass = 0; pass < 4 && escapes(curDx, curDy); pass++) {
      const t = clampAxisDelta((tt) => escapes(curDx * tt, curDy * tt), 1);
      const boundaryDx = curDx * t, boundaryDy = curDy * t;

      const boundaryCorners = childRectCornersAt(node, boundaryDx, boundaryDy, positions);
      const center = [(boundaryCorners[0][0] + boundaryCorners[2][0]) / 2, (boundaryCorners[0][1] + boundaryCorners[2][1]) / 2];
      const normal = nearestEdgeNormal(center, parentPoly);
      if (!normal) { curDx = boundaryDx; curDy = boundaryDy; break; }

      const remDx = curDx - boundaryDx, remDy = curDy - boundaryDy;
      const tangent = [-normal[1], normal[0]];
      const slide = remDx * tangent[0] + remDy * tangent[1];
      curDx = boundaryDx + tangent[0] * slide;
      curDy = boundaryDy + tangent[1] * slide;
    }
    return [curDx, curDy];
  }

  // Exact, non-iterative containment for a rect child in a rect parent: each axis clamps
  // completely independently against the parent's own bounds — no binary search, no
  // tangent, nothing that can misfire at a corner (a corner is simply "both axes clamped
  // at once," not a special case this needs to detect).
  function clampRectToStayInsideRect(childId, dx, dy, positions, parentAbs, parentSize, childSize) {
    const [x, y] = positions[childId];
    const [pw, ph] = parentSize, [cw, ch] = childSize;
    const targetX = x + dx, targetY = y + dy;
    const clampedX = Math.min(Math.max(targetX, parentAbs[0]), parentAbs[0] + pw - cw);
    const clampedY = Math.min(Math.max(targetY, parentAbs[1]), parentAbs[1] + ph - ch);
    return [clampedX - x, clampedY - y];
  }

  // Entry point, mirroring clampToNoCollision's shape. Silently no-ops (no warning) for a
  // node that merely *inherited* "inside" from its parent's childPlacement default but
  // isn't a rect — e.g. a corner-ref wall or a circle side table sitting in a room with
  // childPlacement: "inside" set for its furniture — since that default was never a
  // specific promise about every child. An *explicit* placement: "inside" on an
  // unsupported shape does warn, since that one was a direct, unmet request.
  function clampToContainment(node, parent, dx, dy, positions, warnings) {
    if (placementFor(node, parent) !== "inside") return [dx, dy];
    if (node.props.shape !== "rect" || !node.props.size) {
      if (typeof node.props.placement === "string") {
        warnings.push(`${node.id}: containment only checked for rect children (D-032 scope), not enforced here`);
      }
      return [dx, dy];
    }
    if (parent.props.shape === "rect" && parent.props.size) {
      const [newDx, newDy] = clampRectToStayInsideRect(
        node.id, dx, dy, positions, positions[parent.id],
        [core.numOf(parent.props.size[0]), core.numOf(parent.props.size[1])],
        [core.numOf(node.props.size[0]), core.numOf(node.props.size[1])]
      );
      if (newDx !== dx || newDy !== dy) warnings.push(`${node.id}: stays inside '${parent.id}'`);
      return [newDx, newDy];
    }
    const parentPoly = parentBoundaryPolygon(parent, positions);
    if (!parentPoly) {
      warnings.push(`${parent.id}: not a rect/polygon, containment not checked (D-032 scope)`);
      return [dx, dy];
    }
    return clampToStayInside(node, parentPoly, dx, dy, positions, warnings);
  }

  // ---------- Text-splice helpers ----------
  function toLineSpan(text, start, end) {
    while (start > 0 && text[start - 1] !== "\n") start--;
    while (end < text.length && text[end] !== "\n") end++;
    if (text[end] === "\n") end++;
    return { start, end };
  }

  function deleteSpans(text, spans) {
    const lineSpans = spans.map(({ start, end }) => toLineSpan(text, start, end))
      .sort((a, b) => b.start - a.start);
    let out = text;
    for (const { start, end } of lineSpans) out = out.slice(0, start) + out.slice(end);
    return out;
  }

  // ---------- Drag ----------

  // A polyline/polygon whose points reference sibling corner elements (the pattern both
  // shipped examples use throughout — walls, the plot outline, the rug) has no position of
  // its own for core.nodeDragEdits to edit; it only warns "drag that corner directly"
  // instead. Dragging the *shape* has to mean dragging every corner it references by the
  // same delta — any literal [x,y] points mixed in still move too, via core's own handling.
  function cornerRefIdsOf(node) {
    const ids = [];
    for (const pt of node.props.points ?? []) {
      if (typeof pt === "function" && pt.cornerRef && !ids.includes(pt.cornerRef)) ids.push(pt.cornerRef);
    }
    return ids;
  }

  // Moving every corner a shape references by the same delta is a rigid translation of the
  // shape itself — which by definition can never change its own self-intersection status,
  // since translation preserves every pairwise distance and angle. But core's ordinary
  // realism check (inside nodeDragEdits, run once per corner) has no idea a whole group is
  // moving together: it only ever sees *one* corner move while the others still sit at
  // their old spot, which reads as the shape deforming even though it's actually just
  // sliding — and, with both shipped examples setting allowSelfIntersectingPolygons: false,
  // reliably rejected the very first corner of almost any real drag. Checked here instead,
  // once, against the fully-translated result — any *other* shape that shares one of these
  // corners without moving along with the rest of it (a real deformation, not a rigid
  // slide) is still correctly checked against what actually happens to it.
  function wouldSelfIntersect(cornerIds, dx, dy, base, cornerUsers, warnings, movedId) {
    if (base.settings.allowSelfIntersectingPolygons) return false;
    const positions = {};
    core.computePositions(base.root, null, [0, 0], positions);
    for (const cid of cornerIds) {
      const p = positions[cid];
      positions[cid] = [p[0] + dx, p[1] + dy];
    }
    const affectedShapeIds = new Set();
    for (const cid of cornerIds) for (const uid of cornerUsers[cid] ?? []) affectedShapeIds.add(uid);
    for (const shapeId of affectedShapeIds) {
      const shapeNode = base.nodesById[shapeId];
      if (shapeNode.props.shape !== "polygon") continue;
      const pts = shapeNode.props.points.map((pt) => core.resolvePointAbs(pt, positions[shapeId], positions));
      if (core.polygonSelfIntersects(pts)) {
        warnings.push(`${movedId}: this would make '${shapeId}' self-intersecting. Set allowSelfIntersectingPolygons: true to allow this.`);
        return true;
      }
    }
    return false;
  }

  function dragEditsFor(node, parent, dx, dy, base, cornerUsers, warnings) {
    const cornerIds = cornerRefIdsOf(node);
    if (!cornerIds.length) return core.nodeDragEdits(node, parent, dx, dy, base, cornerUsers, warnings);
    if (wouldSelfIntersect(cornerIds, dx, dy, base, cornerUsers, warnings, node.id)) return [];

    const edits = [];
    for (const pt of node.props.points) {
      if (!Array.isArray(pt)) continue;
      const [x, y] = pt;
      if (core.isEditable(x)) edits.push({ start: x.start, end: x.end, text: core.formatNumber(x.value + dx, x.unit) });
      if (core.isEditable(y)) edits.push({ start: y.start, end: y.end, text: core.formatNumber(y.value + dy, y.unit) });
    }
    // Already validated as a whole above — relax the setting for these per-corner calls so
    // core's own one-at-a-time check (which would otherwise re-reject the same rigid slide
    // it can't see as one) stays out of the way; `base` is this drag frame's own throwaway
    // parse, so mutating it here has no effect beyond this function call.
    const relaxedBase = { ...base, settings: { ...base.settings, allowSelfIntersectingPolygons: true } };
    for (const cid of cornerIds) {
      const cornerNode = relaxedBase.nodesById[cid];
      const cornerParent = cornerNode.parentId ? relaxedBase.nodesById[cornerNode.parentId] : null;
      edits.push(...core.nodeDragEdits(cornerNode, cornerParent, dx, dy, relaxedBase, cornerUsers, warnings));
    }
    return edits;
  }

  // Structural nesting already carries a moved parent's shift to every descendant for free
  // (computePositions resolves a child's position relative to its parent's, recursively) —
  // an explicit `connection` is exactly how this language also lets a child stay attached to
  // its own parent (D-013/014), so the two can easily both apply to the same pair. Also
  // applying the connection's own rigid shift on top would double it (or, dragging a child
  // connected to its own ancestor, drag the whole ancestor subtree an extra time) — this
  // finds that case so the caller can skip it.
  function isAncestorOf(maybeAncestorId, nodeId, base) {
    let cur = base.nodesById[nodeId];
    while (cur && cur.parentId) {
      if (cur.parentId === maybeAncestorId) return true;
      cur = base.nodesById[cur.parentId];
    }
    return false;
  }

  function applyDrag(dragState, dx, dy) {
    let base;
    try {
      base = core.parse(dragState.baseText);
    } catch (e) {
      core.dragmsgEl.textContent = `Can't continue this drag: the source text is currently invalid (${e.message}). Fix it in the editor or reload to reset.`;
      return;
    }
    const cornerUsers = {};
    core.computeCornerUsers(base.root, cornerUsers);
    const warnings = [];
    const node = base.nodesById[dragState.id];
    const parent = node.parentId ? base.nodesById[node.parentId] : null;

    // Checked first, against siblings and the parent's own boundary, before any edits are
    // computed — a bare point (the only thing trySlideAlongConnectedRect below handles)
    // never has a shape, so this never conflicts with the wall-slide mechanic; the two are
    // mutually exclusive by what kind of node they apply to. Both clamp dx/dy in place
    // rather than rejecting outright, so everything below sees an already-safe delta.
    // Containment runs on whatever delta collision already allowed — a heuristic, not a
    // jointly-solved optimum (F-004's "multiple simultaneous constraints on one element are
    // unhandled" gap now covers this pairing too), but each clamp only ever shrinks the
    // move further, so running both still lands somewhere both agree is safe.
    if (parent) {
      const positionsForConstraints = {};
      core.computePositions(base.root, null, [0, 0], positionsForConstraints);
      [dx, dy] = clampToNoCollision(node, parent, dx, dy, base, positionsForConstraints, warnings);
      [dx, dy] = clampToContainment(node, parent, dx, dy, positionsForConstraints, warnings);
    }

    // A connected point resting on a rect's edge slides along that edge instead of
    // dragging the rect (D-032) — only for the directly-dragged element; Shift
    // (singleOnly) still means "ignore everything, move just me". Dragging the rect
    // itself is unaffected: a connected point still follows it rigidly.
    let edits = !dragState.singleOnly && !node.props.shape && node.props.position
      ? trySlideAlongConnectedRect(node, base, dx, dy, cornerUsers, warnings)
      : null;

    if (!edits) {
      edits = [...dragEditsFor(node, parent, dx, dy, base, cornerUsers, warnings)];
      if (!dragState.singleOnly) {
        for (const otherId of core.connectedNodeIds(dragState.id, base.connections)) {
          if (isAncestorOf(otherId, dragState.id, base) || isAncestorOf(dragState.id, otherId, base)) continue;
          const otherNode = base.nodesById[otherId];
          const otherParent = otherNode.parentId ? base.nodesById[otherNode.parentId] : null;
          edits.push(...dragEditsFor(otherNode, otherParent, dx, dy, base, cornerUsers, warnings));
        }
      }
    }

    if (edits.length === 0) {
      core.dragmsgEl.textContent = warnings.length ? warnings.join("\n") : `${dragState.id}: nothing solvable to drag`;
      return;
    }

    edits.sort((a, b) => b.start - a.start);
    let text = dragState.baseText;
    for (const ed of edits) text = text.slice(0, ed.start) + ed.text + text.slice(ed.end);

    core.sourceEl.value = text;
    core.dragmsgEl.textContent = (dragState.singleOnly ? `${dragState.id}: moved alone (Shift held)\n` : "") + warnings.join("\n");
    core.rerender({ preserveViewBox: true });
  }

  // D-032's "outside, attached" placement mode: while a point stays rigidly connected to a
  // rect it's actually resting against, dragging it slides along that edge instead of
  // dragging the rect. Motion perpendicular to the edge is ignored; motion along it is
  // clamped to the edge's own span. Returns null (not applicable, caller falls back to
  // ordinary rigid dragging), [] (applicable, no motion this frame), or an edits array.
  function trySlideAlongConnectedRect(node, base, dx, dy, cornerUsers, warnings) {
    const positions = {};
    core.computePositions(base.root, null, [0, 0], positions);
    const bboxes = {};
    computeBboxes(base.root, positions, bboxes);
    const myBox = bboxes[node.id];
    if (!myBox || !isPointBox(myBox)) return null;

    let rect = null;
    for (const otherId of core.connectedNodeIds(node.id, base.connections)) {
      const otherBox = bboxes[otherId];
      if (otherBox && !isPointBox(otherBox)) { rect = otherBox; break; }
    }
    if (!rect) return null;

    const nearest = nearestRectEdge(myBox, rect);
    if (!nearest || nearest.dist > TOUCH_TOLERANCE) return null;

    let newX = myBox.left, newY = myBox.top;
    if (nearest.edge === "left" || nearest.edge === "right") {
      const target = myBox.top + dy;
      newY = Math.min(rect.bottom, Math.max(rect.top, target));
      if (target !== newY) warnings.push(`${node.id}: reached the end of the wall`);
    } else {
      const target = myBox.left + dx;
      newX = Math.min(rect.right, Math.max(rect.left, target));
      if (target !== newX) warnings.push(`${node.id}: reached the end of the wall`);
    }
    const slideDx = newX - myBox.left, slideDy = newY - myBox.top;
    if (!slideDx && !slideDy) return [];

    const parent = node.parentId ? base.nodesById[node.parentId] : null;
    return core.nodeDragEdits(node, parent, slideDx, slideDy, base, cornerUsers, warnings);
  }

  // ---------- Connect / disconnect (with snap) / delete ----------
  // If exactly one side of a connection is a bare point, that side is always the mover on
  // reconnect, whichever of fromId/toId it happens to be — snapping a whole rect onto a
  // small attachment point would be the wrong side to move.
  function snapEdits(base, fromId, toId) {
    const positions = {};
    core.computePositions(base.root, null, [0, 0], positions);
    const bboxes = {};
    computeBboxes(base.root, positions, bboxes);
    const bboxFrom = bboxes[fromId], bboxTo = bboxes[toId];
    if (!bboxFrom || !bboxTo) return [];

    const fromIsPoint = isPointBox(bboxFrom), toIsPoint = isPointBox(bboxTo);
    const moverId = (fromIsPoint && !toIsPoint) ? fromId : toId;
    const anchorId = moverId === fromId ? toId : fromId;
    const anchor = bboxes[anchorId], mover = bboxes[moverId];
    const moverIsPoint = isPointBox(mover), anchorIsPoint = isPointBox(anchor);

    let dx = 0, dy = 0;
    if (moverIsPoint && anchorIsPoint) {
      dx = anchor.left - mover.left;
      dy = anchor.top - mover.top;
    } else if (moverIsPoint) {
      const delta = pointRectSnapDelta(mover, anchor);
      if (!delta) return [];
      dx = delta.dx; dy = delta.dy;
    } else if (anchorIsPoint) {
      const delta = pointRectSnapDelta(anchor, mover);
      if (!delta) return [];
      dx = -delta.dx; dy = -delta.dy;
    } else {
      const xGap = Math.max(anchor.left, mover.left) - Math.min(anchor.right, mover.right);
      const yGap = Math.max(anchor.top, mover.top) - Math.min(anchor.bottom, mover.bottom);
      if (Math.abs(xGap) <= TOUCH_TOLERANCE && yGap < 0) {
        const moverIsRight = (mover.left + mover.right) >= (anchor.left + anchor.right);
        dx = moverIsRight ? -xGap : xGap;
      } else if (Math.abs(yGap) <= TOUCH_TOLERANCE && xGap < 0) {
        const moverIsBelow = (mover.top + mover.bottom) >= (anchor.top + anchor.bottom);
        dy = moverIsBelow ? -yGap : yGap;
      }
    }
    if (!dx && !dy) return [];

    const moverNode = base.nodesById[moverId];
    const moverParent = moverNode.parentId ? base.nodesById[moverNode.parentId] : null;
    const cornerUsers = {};
    core.computeCornerUsers(base.root, cornerUsers);
    return core.nodeDragEdits(moverNode, moverParent, dx, dy, base, cornerUsers, []);
  }

  function createConnection(fromId, toId) {
    let text = core.sourceEl.value;
    let base;
    try { base = core.parse(text); } catch (e) { base = null; }
    if (base) {
      const edits = snapEdits(base, fromId, toId);
      if (edits.length) {
        edits.sort((a, b) => b.start - a.start);
        for (const ed of edits) text = text.slice(0, ed.start) + ed.text + text.slice(ed.end);
      }
    }
    core.sourceEl.value = text.trimEnd() + `\nconnection ${fromId} ${toId}\n`;
    core.dragmsgEl.textContent = `Connected: ${fromId} – ${toId}`;
    core.rerender({ preserveViewBox: true });
  }

  function removeConnection(fromId, toId) {
    const text = core.sourceEl.value;
    let base;
    try { base = core.parse(text); } catch (e) { return; }
    const conn = base.connections.find((c) =>
      (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId));
    if (!conn) return;
    core.sourceEl.value = deleteSpans(text, [conn]);
    core.dragmsgEl.textContent = `Disconnected '${fromId}' and '${toId}'.`;
    core.rerender({ preserveViewBox: true });
  }

  function deleteElement(nodeId) {
    const text = core.sourceEl.value;
    let base;
    try { base = core.parse(text); } catch (e) { return; }
    const node = base.nodesById[nodeId];
    if (!node) return;
    if (!node.parentId) {
      core.dragmsgEl.textContent = `${nodeId}: can't delete the plan's root element.`;
      return;
    }
    const cornerUsers = {};
    core.computeCornerUsers(base.root, cornerUsers);
    const users = cornerUsers[nodeId];
    if (users && users.length) {
      core.dragmsgEl.textContent = `${nodeId}: still referenced as a corner by ${users.join(", ")} — remove those references first.`;
      return;
    }

    const spans = [node, ...base.connections.filter((c) => c.from === nodeId || c.to === nodeId)];
    core.sourceEl.value = deleteSpans(text, spans);
    if (selectedId === nodeId) selectedId = null;
    core.dragmsgEl.textContent = `Deleted '${nodeId}'.`;
    core.rerender();
  }

  // ---------- Context menu ----------
  function openContextMenu(nodeId, x, y) {
    contextMenuItems = [
      { label: "Delete Element", danger: true, action: () => deleteElement(nodeId) },
    ];
    contextMenuEl.innerHTML = contextMenuItems.map((item, i) =>
      `<li data-i="${i}"${item.danger ? ' class="danger"' : ""}>${escapeHtml(item.label)}</li>`
    ).join("");
    contextMenuEl.style.left = `${x}px`;
    contextMenuEl.style.top = `${y}px`;
    contextMenuEl.hidden = false;
  }

  function closeContextMenu() {
    contextMenuEl.hidden = true;
    contextMenuItems = [];
  }

  // ---------- After every render, reapply the selection class and lay the connect/
  // disconnect icons on top. Full DOM replacement each render means there's never stale
  // overlay state to clean up first. ----------
  function handleRendered(prog, result) {
    program = prog;
    const positions = {};
    core.computePositions(prog.root, null, [0, 0], positions);
    lastBboxes = {};
    computeBboxes(prog.root, positions, lastBboxes);

    const svgEl = core.rootEl.querySelector("svg");
    if (!svgEl) return;

    // core's rerender() just replaced #plan-root's *entire* innerHTML with the fresh SVG,
    // which silently destroys these two overlay elements too, not just old shape markup —
    // they're plain children of the same container, appended once at module load, so they
    // need re-adding after every single render, not just the first. appendChild moves an
    // already-existing node rather than erroring, so this is safe to call unconditionally.
    core.rootEl.appendChild(scaleBarEl);
    core.rootEl.appendChild(fitBtnEl);

    // core just replaced #plan-root's innerHTML, so svgEl's viewBox is core's own fresh
    // fit-to-content box, not yet touched by any zoom/pan — capture it before applying
    // viewState over it. If it differs from last time, core actually re-fit the content
    // (see D-034's fixedViewBox reset), so any existing zoom/pan is relative to a "home"
    // that no longer exists — drop it and start fresh from the new fit, same as it would
    // for a first render. If it's unchanged (e.g. a drag's preserveViewBox:true, or an edit
    // that happened not to change the bounding box), keep whatever view the user had.
    const vb = svgEl.viewBox.baseVal;
    const freshFit = { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
    if (!lastCoreFit || freshFit.x !== lastCoreFit.x || freshFit.y !== lastCoreFit.y ||
        freshFit.width !== lastCoreFit.width || freshFit.height !== lastCoreFit.height) {
      viewState = null;
    }
    lastCoreFit = freshFit;
    if (viewState) {
      svgEl.setAttribute("viewBox", `${viewState.x} ${viewState.y} ${viewState.width} ${viewState.height}`);
    }
    updateScaleBar();

    // A loose, optional signal for any other module that wants to react to selection —
    // e.g. highlighting the selected element's own source span — without this module
    // needing to know such a thing exists. Set here (already recomputed every render)
    // rather than exposed as new PlanCore API, since selection itself stays this module's
    // own private state.
    if (selectedId) {
      core.rootEl.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)?.classList.add("selected");
      core.rootEl.dataset.selectedId = selectedId;
    } else {
      delete core.rootEl.dataset.selectedId;
    }

    const icons = [];
    for (const c of prog.connections) {
      if (c.from !== selectedId && c.to !== selectedId) continue;
      const a = lastBboxes[c.from], b = lastBboxes[c.to];
      if (!a || !b) continue;
      const [cx, cy] = contactPoint(a, b);
      icons.push(iconMarkup("disconnect", cx * core.M, cy * core.M, c.from, c.to));
    }
    if (selectedId && lastBboxes[selectedId]) {
      const sel = lastBboxes[selectedId];
      for (const [otherId, b] of Object.entries(lastBboxes)) {
        if (otherId === selectedId || !isAdjacent(sel, b)) continue;
        const already = prog.connections.some((c) =>
          (c.from === selectedId && c.to === otherId) || (c.from === otherId && c.to === selectedId));
        if (already) continue;
        const [cx, cy] = contactPoint(sel, b);
        icons.push(iconMarkup("connect", cx * core.M, cy * core.M, selectedId, otherId));
      }
    }
    // Appended after core's own output (including its anchors, painted last) — icons end
    // up on top of anchors, a known ordering tradeoff of icons living entirely outside core.
    if (icons.length) svgEl.insertAdjacentHTML("beforeend", icons.join("\n"));
  }
  const unregisterOnRendered = core.onRendered(handleRendered);

  // ---------- Event wiring — named functions so registerModuleCleanup can remove exactly
  // what was added. ----------
  function handlePointerDown(e) {
    if (e.button !== 0) return; // right-click only opens the context menu
    // The Fit button (and any future plain HTML control appended over the viewer, like
    // the scale bar) is a child of core.rootEl too, so its own pointerdown bubbles up to
    // this same listener — a real bug, not a hypothetical, found by actually clicking
    // Fit after panning and seeing nothing happen: preventDefault() below suppressed the
    // browser's own click-event synthesis for the button before handleFitClick ever got a
    // chance to run. Bail out before touching it at all, so a plain button always gets to
    // handle its own click natively, the same as it would anywhere else on the page.
    if (e.target.closest("button")) return;
    // Without this, a mousedown-and-move over the SVG is indistinguishable from starting a
    // native text selection to the browser — every drag/pan gesture would leave a stray
    // selection highlight (and, on some browsers, try to start a native element drag) on
    // top of whatever this module does with the gesture itself.
    e.preventDefault();
    if (!program) return;

    const iconEl = e.target.closest("[data-action]");
    if (iconEl) {
      const { action, a, b } = iconEl.dataset;
      if (action === "connect") createConnection(a, b);
      else removeConnection(a, b);
      return;
    }

    const el = e.target.closest("[data-id]");
    if (!el) {
      // Empty canvas: could be a plain click (deselect) or the start of a pan — decided by
      // whether the pointer actually moves before release, see handlePointerMove/Up.
      canvasDrag = { startClientX: e.clientX, startClientY: e.clientY, moved: false,
        startView: viewState || lastCoreFit };
      return;
    }
    const node = program.nodesById[el.dataset.id];
    if (!node.props.position && !node.props.points) {
      core.dragmsgEl.textContent = `${node.id}: has no explicit position/points in source, nothing to drag`;
      return;
    }
    drag = { id: node.id, baseText: core.sourceEl.value, clientX: e.clientX, clientY: e.clientY, singleOnly: e.shiftKey };
    core.rootEl.classList.add("dragging");
  }

  function handleContextMenu(e) {
    const el = e.target.closest("[data-id]");
    if (!el || !program) return;
    e.preventDefault();
    openContextMenu(el.dataset.id, e.clientX, e.clientY);
  }

  function handleMenuClick(e) {
    const li = e.target.closest("li[data-i]");
    if (!li) return;
    const item = contextMenuItems[Number(li.dataset.i)];
    closeContextMenu();
    item?.action();
  }

  function handleWindowPointerDown(e) {
    if (!contextMenuEl.hidden && !contextMenuEl.contains(e.target)) closeContextMenu();
  }

  function handleKeyDown(e) { if (e.key === "Escape") closeContextMenu(); }

  // core.M (meters -> SVG viewBox units) is only the right divisor for a mouse-pixel delta
  // when the SVG happens to render at its native, unscaled size. The app's own CSS now
  // stretches the SVG to fill its container (width/height: 100%) instead of using the
  // element's own width/height attributes, so a screen pixel of mouse movement and a
  // viewBox unit are no longer the same thing — this reads the SVG's actual on-screen size
  // against its viewBox to find the real current scale. Falls back to core.M (assume
  // native/no CSS scaling) if the SVG isn't in the DOM yet or has a zero-size viewBox.
  function currentPxPerMeter() {
    const svg = core.rootEl.querySelector("svg");
    const vb = svg?.viewBox?.baseVal;
    if (!vb || !vb.width || !vb.height) return core.M;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return core.M;
    // preserveAspectRatio defaults to "meet": the viewBox is scaled uniformly by whichever
    // axis is more constraining, then centered — so the *effective* scale is the smaller
    // of the two per-axis ratios, not an average or either one alone.
    return core.M * Math.min(rect.width / vb.width, rect.height / vb.height);
  }

  // "Nice" round distances (in meters) to offer on the scale bar, same idea as a map's —
  // pick the largest one whose on-screen length still fits comfortably, rather than
  // labelling an arbitrary, hard-to-read number of meters.
  const SCALE_BAR_STEPS_M = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  const SCALE_BAR_MAX_PX = 140;

  function updateScaleBar() {
    const pxPerMeter = currentPxPerMeter();
    if (!pxPerMeter) return;
    let meters = SCALE_BAR_STEPS_M[0];
    for (const step of SCALE_BAR_STEPS_M) {
      if (step * pxPerMeter <= SCALE_BAR_MAX_PX) meters = step; else break;
    }
    scaleBarBarEl.style.width = `${meters * pxPerMeter}px`;
    scaleBarLabelEl.textContent = meters < 1 ? `${Math.round(meters * 100)} cm` : `${meters} m`;
  }

  // Zoom relative to the cursor: the viewBox point currently under the pointer stays under
  // the pointer after the zoom, matching the zoom-to-cursor behavior any map/canvas tool
  // has trained people to expect (zooming shouldn't fling the thing you're looking at
  // somewhere else on screen).
  function handleWheel(e) {
    const svg = core.rootEl.querySelector("svg");
    if (!svg || !lastCoreFit) return;
    e.preventDefault();
    const current = viewState || lastCoreFit;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(rect.width / current.width, rect.height / current.height);
    const cursorVbX = current.x + (e.clientX - rect.left) / scale;
    const cursorVbY = current.y + (e.clientY - rect.top) / scale;

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const minWidth = lastCoreFit.width / 8; // ~8x zoomed in, relative to the original fit
    const maxWidth = lastCoreFit.width * 2; // ~2x zoomed out
    const newWidth = Math.min(maxWidth, Math.max(minWidth, current.width / factor));
    if (newWidth === current.width) return; // already at a zoom limit
    const ratio = newWidth / current.width;
    const newHeight = current.height * ratio;
    const newScale = Math.min(rect.width / newWidth, rect.height / newHeight);
    const newX = cursorVbX - (e.clientX - rect.left) / newScale;
    const newY = cursorVbY - (e.clientY - rect.top) / newScale;

    viewState = { x: newX, y: newY, width: newWidth, height: newHeight };
    svg.setAttribute("viewBox", `${newX} ${newY} ${newWidth} ${newHeight}`);
    updateScaleBar();
  }

  function handlePointerMove(e) {
    if (canvasDrag) {
      const svg = core.rootEl.querySelector("svg");
      if (!svg) return;
      const dxScreen = e.clientX - canvasDrag.startClientX;
      const dyScreen = e.clientY - canvasDrag.startClientY;
      if (!canvasDrag.moved && Math.hypot(dxScreen, dyScreen) > 3) {
        canvasDrag.moved = true;
        core.rootEl.classList.add("dragging");
      }
      if (!canvasDrag.moved) return;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const base = canvasDrag.startView;
      const scale = Math.min(rect.width / base.width, rect.height / base.height);
      const newX = base.x - dxScreen / scale;
      const newY = base.y - dyScreen / scale;
      viewState = { x: newX, y: newY, width: base.width, height: base.height };
      svg.setAttribute("viewBox", `${newX} ${newY} ${base.width} ${base.height}`);
      return;
    }
    if (!drag) return;
    const pxPerMeter = currentPxPerMeter();
    const dx = (e.clientX - drag.clientX) / pxPerMeter;
    const dy = (e.clientY - drag.clientY) / pxPerMeter;
    applyDrag(drag, dx, dy);
  }

  function handlePointerUp() {
    core.rootEl.classList.remove("dragging");
    if (canvasDrag) {
      const wasClick = !canvasDrag.moved;
      canvasDrag = null;
      if (wasClick) { selectedId = null; core.rerender({ preserveViewBox: true }); }
      return;
    }
    if (drag) {
      selectedId = drag.id; // click or drag-and-release both select the element
      drag = null;
      core.rerender({ preserveViewBox: true });
    }
  }

  // Suppressed during either kind of drag: without setPointerCapture, the cursor still
  // fires over/out for whatever it happens to pass across mid-gesture, not just what's
  // actually being interacted with (same reasoning as the object-drag case).
  function handlePointerOver(e) {
    if (drag || canvasDrag) return;
    const el = e.target.closest("[data-id]");
    if (!el || !program) return;
    const users = el.dataset.cornerUsers;
    if (users) {
      for (const uid of users.split(",").filter(Boolean)) {
        core.rootEl.querySelector(`[data-id="${CSS.escape(uid)}"]`)?.classList.add("corner-preview");
      }
    }
    for (const c of program.connections) {
      const partnerId = c.from === el.dataset.id ? c.to : c.to === el.dataset.id ? c.from : null;
      if (!partnerId) continue;
      el.classList.add("connected-highlight");
      core.rootEl.querySelector(`[data-id="${CSS.escape(partnerId)}"]`)?.classList.add("connected-highlight");
    }
  }

  function handlePointerOut(e) {
    const el = e.target.closest("[data-id]");
    if (!el || !program) return;
    const users = el.dataset.cornerUsers;
    if (users) {
      for (const uid of users.split(",").filter(Boolean)) {
        core.rootEl.querySelector(`[data-id="${CSS.escape(uid)}"]`)?.classList.remove("corner-preview");
      }
    }
    for (const c of program.connections) {
      const partnerId = c.from === el.dataset.id ? c.to : c.to === el.dataset.id ? c.from : null;
      if (!partnerId) continue;
      el.classList.remove("connected-highlight");
      core.rootEl.querySelector(`[data-id="${CSS.escape(partnerId)}"]`)?.classList.remove("connected-highlight");
    }
  }

  // Not just "reapply the last computed fit box" (that was the whole first bug: dragging
  // an element outside the original content bounds never touched that cached box at all,
  // since every drag rerenders with preserveViewBox:true specifically so the camera
  // doesn't jump mid-drag — so Fit kept resetting to a stale box that could crop out
  // exactly what was just dragged there). core.rerender() with no opts is what an
  // ordinary text edit already does on every keystroke: drop core's own cached
  // fixedViewBox and recompute a fresh one from wherever every element actually sits now.
  //
  // Clearing viewState here too, not left to handleRendered's own "only if the box
  // actually changed" check below — a second real bug, found by testing the plain
  // pan-with-nothing-dragged case right after fixing the one above: if nothing moved,
  // the freshly recomputed box is identical to the last one, that check sees no
  // difference and leaves viewState alone, and the *old* pan/zoom gets reapplied right
  // back onto the newly rendered SVG — Fit silently doing nothing whenever there was
  // nothing to actually refit. Clicking Fit means "discard my zoom/pan," unconditionally,
  // whether or not the underlying content also happens to need a bigger box this time.
  function handleFitClick() {
    viewState = null;
    core.rerender();
  }

  // Resize can change the SVG's on-screen size without any render or zoom/pan action of
  // ours (window resize, or the code pane being resized) — the scale bar (and the drag
  // scale currentPxPerMeter reads elsewhere) both depend on that size, so both need to stay
  // current when it changes for reasons neither of us triggered.
  const resizeObserver = new ResizeObserver(() => updateScaleBar());
  resizeObserver.observe(core.rootEl);

  core.rootEl.addEventListener("pointerdown", handlePointerDown);
  core.rootEl.addEventListener("contextmenu", handleContextMenu);
  contextMenuEl.addEventListener("click", handleMenuClick);
  window.addEventListener("pointerdown", handleWindowPointerDown);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  core.rootEl.addEventListener("pointerover", handlePointerOver);
  core.rootEl.addEventListener("pointerout", handlePointerOut);
  core.rootEl.addEventListener("wheel", handleWheel, { passive: false });
  fitBtnEl.addEventListener("click", handleFitClick);

  // ---------- Teardown: undoes exactly what setup above did, so removing this module's
  // declaration from a plan actually turns interactivity off. ----------
  core.registerModuleCleanup("interactivity-module.js", () => {
    unregisterOnRendered();
    resizeObserver.disconnect();
    core.rootEl.removeEventListener("pointerdown", handlePointerDown);
    core.rootEl.removeEventListener("contextmenu", handleContextMenu);
    contextMenuEl.removeEventListener("click", handleMenuClick);
    window.removeEventListener("pointerdown", handleWindowPointerDown);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    core.rootEl.removeEventListener("pointerover", handlePointerOver);
    core.rootEl.removeEventListener("pointerout", handlePointerOut);
    core.rootEl.removeEventListener("wheel", handleWheel);
    fitBtnEl.removeEventListener("click", handleFitClick);
    core.rootEl.classList.remove("dragging");
    delete core.rootEl.dataset.selectedId;
    contextMenuEl.remove();
    scaleBarEl.remove();
    fitBtnEl.remove();
    styleEl.remove();
    drag = null;
    canvasDrag = null;
    selectedId = null;
    viewState = null;
    lastCoreFit = null;
  });
})();
