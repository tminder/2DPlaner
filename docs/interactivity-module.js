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
      /* F-021's remaining half: discovering a hidden element exists at all, not just
         reaching it (D-077's click-cycling already covers reaching it). Fading the topmost
         shape partway on hover — only when handlePointerOver has actually confirmed
         something else is stacked there, never unconditionally — gives an immediate,
         literal glimpse of what's underneath, which is more informative than a plain badge
         alone would be; the badge (below) then names how many and hints at the gesture. */
      #plan-root:not(.dragging) svg .obj.stacked-hint:hover { opacity: 0.55; }
      #interactivity-stack-badge { position: fixed; z-index: 1001; pointer-events: none;
        transform: translate(14px, 14px); background: rgba(30,68,87,0.94); color: #fff;
        font-family: system-ui, sans-serif; font-size: 12px; font-weight: 600;
        padding: 0.35rem 0.55rem; border-radius: 8px;
        box-shadow: 0 3px 10px rgba(0,0,0,0.25); white-space: nowrap; }
      #interactivity-stack-badge[hidden] { display: none; }
      #interactivity-stack-badge .stack-line { display: flex; gap: 0.5em; opacity: 0.55; padding: 0.05rem 0; }
      #interactivity-stack-badge .stack-line.current { opacity: 1; }
      #interactivity-stack-badge .stack-marker { width: 0.9em; flex: none; }
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

      #interactivity-validation-panel { position: absolute; left: 10px; top: 10px; z-index: 1;
        max-width: min(280px, calc(100% - 20px)); max-height: calc(100% - 20px);
        overflow-y: auto; font-family: system-ui, sans-serif;
        font-size: 12px; line-height: 1.4; background: rgba(255,248,230,0.95);
        border: 1px solid #e0b84a; border-radius: 6px; padding: 6px 10px 7px; color: #6b4e00; }
      #interactivity-validation-panel[hidden] { display: none; }
      #interactivity-validation-panel .validation-title { font-weight: 600; margin-bottom: 2px;
        position: sticky; top: -6px; background: inherit; padding-top: 6px; margin-top: -6px; }
      #interactivity-validation-panel ul { margin: 0; padding-left: 16px; }
      #interactivity-validation-panel li { margin: 2px 0; }
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
  document.getElementById("interactivity-validation-panel")?.remove();
  document.getElementById("interactivity-stack-badge")?.remove();

  const styleEl = document.createElement("style");
  styleEl.id = "interactivity-module-style";
  document.head.appendChild(styleEl);
  injectStyles(styleEl);

  const contextMenuEl = document.createElement("ul");
  contextMenuEl.id = "interactivity-context-menu";
  contextMenuEl.className = "context-menu";
  contextMenuEl.hidden = true;
  document.body.appendChild(contextMenuEl);

  // F-021: fixed-position like contextMenuEl above, for the same reason — it needs to
  // track the real cursor in screen space, not be constrained by #plan-root's own layout.
  const stackBadgeEl = document.createElement("div");
  stackBadgeEl.id = "interactivity-stack-badge";
  stackBadgeEl.hidden = true;
  document.body.appendChild(stackBadgeEl);

  // The badge's own candidate order, frozen at hover-entry (handlePointerOver only ever
  // fires once on entering an element, not continuously) — a small, stable list rather than
  // one that reshuffles on every click, since D-086's bringToFront changes live paint order
  // on every selection. Only the ">" marker moves; re-rendered from handleRendered (below)
  // on every render so a stationary click-cycle click, which never re-fires pointerover,
  // still shows the newly-selected line correctly.
  let stackHintCandidates = null;
  function stackHintMarkup(ids) {
    const currentId = selectedId && ids.includes(selectedId) ? selectedId : ids[0];
    return ids.map((id) => {
      const label = program.nodesById[id]?.props.label ?? id;
      const isCurrent = id === currentId;
      return `<div class="stack-line${isCurrent ? " current" : ""}"><span class="stack-marker">${isCurrent ? "❯" : ""}</span><span>${escapeHtml(label)}</span></div>`;
    }).join("");
  }

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

  const validationPanelEl = document.createElement("div");
  validationPanelEl.id = "interactivity-validation-panel";
  validationPanelEl.hidden = true;
  core.rootEl.appendChild(validationPanelEl);

  // ---------- Module-owned state — core has none of this. ----------
  let program = null;
  let lastBboxes = {};
  let selectedId = null;
  let drag = null;
  let contextMenuItems = [];
  // F-019/F-021: the point and chosen id of the last plain click (not a drag) that landed
  // on more than one stacked element — lets a *repeated* click at the same spot step to the
  // next thing underneath, rather than always re-grabbing whatever's on top. Set in
  // handlePointerUp, read in handlePointerDown; see candidateIdsAtPoint below.
  let clickCycle = null;
  const CLICK_CYCLE_TOLERANCE_PX = 4;

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

  // F-020: an inherited `childPlacement` used to only ever check a node's *immediate*
  // parent — "keep everything inside the van" (set once, on the outermost container) never
  // actually applied to anything nested two levels deep, since a `kitchen` sitting between
  // `van` and `stove` never set `childPlacement` itself. Walks upward from `parent` for the
  // nearest ancestor that actually made a claim about its descendants' containment, rather
  // than assuming "no claim on the immediate parent" means "no claim at all".
  function nearestChildPlacementAncestor(parent, base) {
    let cur = parent;
    while (cur) {
      if (typeof cur.props.childPlacement === "string") return cur;
      cur = cur.parentId ? base.nodesById[cur.parentId] : null;
    }
    return null;
  }

  // A child's own explicit `placement` always names its *own* immediate parent as the
  // container (unchanged from before — D-032's own scope, a node stating its own
  // relationship to whatever textually contains it). Only the *inherited* case (no
  // explicit override) now searches upward via nearestChildPlacementAncestor above, so
  // "container" and "immediate parent" are no longer assumed to be the same node.
  function resolveContainer(node, parent, base) {
    if (typeof node.props.placement === "string") return { container: parent, placement: node.props.placement };
    const ancestor = parent ? nearestChildPlacementAncestor(parent, base) : null;
    return ancestor ? { container: ancestor, placement: ancestor.props.childPlacement } : { container: null, placement: null };
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

  // A corner exactly on the parent boundary (the ordinary, intended state for a `flush`
  // child — D-071) is genuinely ambiguous for plain ray-casting: ((yi > pt[1]) !== (yj >
  // pt[1])) never counts a horizontal edge lying exactly at pt[1] as a crossing at all, so
  // a point sitting precisely on that edge can come out classified as outside depending on
  // the polygon's other edges — found by checkContainment (F-022) flagging a legitimately
  // flush wardrobe as a false-positive violation. Same tolerance-for-flush-touching
  // principle the collision check above already applies deliberately (a shape resting
  // exactly flush against another already reads as non-colliding); this is that same
  // principle's containment counterpart, not a new one.
  const CONTAINMENT_EPS = 0.001;
  function isContained(childCorners, parentPoly) {
    return childCorners.every((p) => {
      if (pointInPolygon(p, parentPoly)) return true;
      for (let i = 0; i < parentPoly.length; i++) {
        const a = parentPoly[i], b = parentPoly[(i + 1) % parentPoly.length];
        if (pointToSegmentDistance(p, a, b) <= CONTAINMENT_EPS) return true;
      }
      return false;
    });
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

  // Which of the parent rect's four edges a contained child is currently nearest —
  // "nearest" rather than "touching", since flush is judged from wherever the child
  // already sits (its own declared position), not only once it happens to be flush.
  function nearestParentRectEdge(childBox, parentAbs, parentSize) {
    const [pw, ph] = parentSize;
    const distances = {
      left: childBox.left - parentAbs[0],
      right: (parentAbs[0] + pw) - childBox.right,
      top: childBox.top - parentAbs[1],
      bottom: (parentAbs[1] + ph) - childBox.bottom,
    };
    return Object.keys(distances).reduce((a, b) => (distances[a] <= distances[b] ? a : b));
  }

  // D-032's other, previously-unbuilt half of mode 3: `flush: true` layered on top of
  // `placement: "inside"` — contained *and* pinned against whichever edge of the parent
  // it's nearest to (a door built into a wall, as opposed to a sofa merely kept inside a
  // room). Same shape as trySlideAlongConnectedRect's "outside, attached" mechanic
  // (D-032 mode 2) but measured against the *inside* of the parent's own boundary instead
  // of an externally connected rect: motion perpendicular to the locked edge is ignored
  // (this doesn't let a flush child peel off and re-attach to a different edge — a bigger
  // gesture than this version supports, matching how narrowly every other placement mode
  // is scoped); motion along the edge slides within its own span, clamped by the same
  // exact per-axis math clampRectToStayInsideRect already uses, just pinned on one axis
  // rather than free on both.
  function clampFlushInsideRect(nodeId, dx, dy, positions, parentAbs, parentSize, childSize, warnings) {
    const [x, y] = positions[nodeId];
    const [pw, ph] = parentSize, [cw, ch] = childSize;
    const currentBox = { left: x, top: y, right: x + cw, bottom: y + ch };
    const edge = nearestParentRectEdge(currentBox, parentAbs, parentSize);

    let newX = x, newY = y;
    if (edge === "left" || edge === "right") {
      newX = edge === "left" ? parentAbs[0] : parentAbs[0] + pw - cw;
      const targetY = y + dy;
      newY = Math.min(parentAbs[1] + ph - ch, Math.max(parentAbs[1], targetY));
      if (targetY !== newY) warnings.push(`${nodeId}: reached the end of the wall`);
    } else {
      newY = edge === "top" ? parentAbs[1] : parentAbs[1] + ph - ch;
      const targetX = x + dx;
      newX = Math.min(parentAbs[0] + pw - cw, Math.max(parentAbs[0], targetX));
      if (targetX !== newX) warnings.push(`${nodeId}: reached the end of the wall`);
    }
    return [newX - x, newY - y];
  }

  // Entry point, mirroring clampToNoCollision's shape. `container` (F-020) is whichever
  // ancestor's boundary actually applies — the immediate parent for an explicit `placement`,
  // or the nearest ancestor up the chain that set `childPlacement`, which may be several
  // levels up. Silently no-ops (no warning) for a node that merely *inherited* "inside" but
  // isn't a rect — e.g. a corner-ref wall or a circle side table sitting somewhere under a
  // childPlacement: "inside" ancestor — since that default was never a specific promise
  // about every descendant. An *explicit* placement: "inside" on an unsupported shape does
  // warn, since that one was a direct, unmet request.
  function clampToContainment(node, parent, dx, dy, positions, warnings, base) {
    const { container, placement } = resolveContainer(node, parent, base);
    if (placement !== "inside") {
      // Anything explicitly declared but not one of this language's two recognized
      // placement values (D-032: "inside", "outside" — "outside" isn't checked here at
      // all, it's mode 2's own connected-point mechanic, see trySlideAlongConnectedRect)
      // is silently unrecognized elsewhere in this language (D-044's own status note), so
      // flagging it here — where an author would actually be looking, mid-drag — beats
      // leaving a typo silently doing nothing forever.
      if (typeof node.props.placement === "string" && placement !== "outside") {
        warnings.push(`${node.id}: placement "${placement}" isn't recognized (expected "inside" or "outside") — ignored`);
      }
      return [dx, dy];
    }
    const flush = node.props.flush === true;
    if (node.props.shape !== "rect" || !node.props.size) {
      if (typeof node.props.placement === "string") {
        warnings.push(`${node.id}: containment only checked for rect children (D-032 scope), not enforced here`);
      }
      return [dx, dy];
    }
    if (container.props.shape === "rect" && container.props.size) {
      const containerAbs = positions[container.id];
      const containerSize = [core.numOf(container.props.size[0]), core.numOf(container.props.size[1])];
      const childSize = [core.numOf(node.props.size[0]), core.numOf(node.props.size[1])];
      const [newDx, newDy] = flush
        ? clampFlushInsideRect(node.id, dx, dy, positions, containerAbs, containerSize, childSize, warnings)
        : clampRectToStayInsideRect(node.id, dx, dy, positions, containerAbs, containerSize, childSize);
      if (newDx !== dx || newDy !== dy) warnings.push(`${node.id}: stays inside '${container.id}'`);
      return [newDx, newDy];
    }
    if (flush) {
      warnings.push(`${node.id}: flush only checked for a rect parent (D-032 scope), not enforced here`);
    }
    const containerPoly = parentBoundaryPolygon(container, positions);
    if (!containerPoly) {
      warnings.push(`${container.id}: not a rect/polygon, containment not checked (D-032 scope)`);
      return [dx, dy];
    }
    return clampToStayInside(node, containerPoly, dx, dy, positions, warnings);
  }

  // ---------- Load-time / static validation (F-022, F-028) ----------
  // Everything above (clampToNoCollision, clampToContainment) only ever runs mid-drag,
  // against an attempted delta — nothing has ever checked a plan's own initial, as-authored
  // layout, which is exactly how a real comparison plan (F-022's own finding: an
  // independently-AI-generated campervan plan with `allowCollisions: false` set) shipped an
  // unflagged overlapping rug and two identically-positioned doors. This walks the whole
  // tree once per render and reports what it finds, reusing the same geometry/permission
  // primitives the drag-time checks already use rather than duplicating their logic —
  // this is a second call site for known-correct code, not a new mechanism.
  function collectAllNodes(node, out) {
    out.push(node);
    for (const child of node.children) collectAllNodes(child, out);
    return out;
  }

  // Same pairwise rule clampToNoCollision/firstCollidingSibling already apply mid-drag:
  // either shape opting itself out via its own allowCollisions is enough to suppress the
  // pair — a node's own allowCollisions means "I don't mind being overlapped", not "only
  // *my own* moves ignore it" — so a violation is only reported when neither side opted
  // out, matching drag-time behavior exactly rather than approximating it.
  function checkCollisions(base, positions, violations) {
    for (const parent of collectAllNodes(base.root, [])) {
      const kids = parent.children;
      for (let i = 0; i < kids.length; i++) {
        const a = kids[i];
        if (collisionsAllowedFor(a, base.settings)) continue;
        const geomA = solidGeometryFor(a, positions);
        if (!geomA) continue;
        for (let j = i + 1; j < kids.length; j++) {
          const b = kids[j];
          if (collisionsAllowedFor(b, base.settings)) continue;
          const geomB = solidGeometryFor(b, positions);
          if (geomB && shapesOverlap(geomA, geomB)) {
            violations.push({ type: "collision", message: `'${a.id}' and '${b.id}' overlap` });
          }
        }
      }
    }
  }

  // Reuses clampToContainment's own scope exactly (rect child, D-032) rather than a looser
  // check — an element this narrow can't clamp doesn't get flagged as "wrong" either,
  // since it was never actually enforced for it in the first place (same "not enforced
  // here" reasoning as clampToContainment's own warnings).
  function checkContainment(base, positions, violations) {
    for (const node of collectAllNodes(base.root, [])) {
      if (!node.parentId) continue;
      const parent = base.nodesById[node.parentId];
      // F-020: resolveContainer, not the immediate parent alone — an inherited
      // childPlacement may name an ancestor several levels up as the actual container.
      const { container, placement } = resolveContainer(node, parent, base);
      if (placement !== "inside" || !container) continue;
      if (node.props.shape !== "rect" || !node.props.size) continue;
      const containerPoly = parentBoundaryPolygon(container, positions);
      if (!containerPoly) continue;
      const childCorners = childRectCornersAt(node, 0, 0, positions);
      if (!isContained(childCorners, containerPoly)) {
        violations.push({ type: "containment", message: `'${node.id}' is placed "inside" '${container.id}' but isn't actually inside it` });
      }
    }
  }

  // F-028: two elements sharing an id doesn't error anywhere today, but silently corrupts
  // drag targeting (nodesById[id] = node last-writer-wins during parsing) — reported once
  // per duplicated id, not once per extra occurrence, since the fix is the same either way
  // (rename one of them).
  function checkDuplicateIds(base, violations) {
    const counts = new Map();
    for (const node of collectAllNodes(base.root, [])) {
      if (!node.id) continue;
      counts.set(node.id, (counts.get(node.id) || 0) + 1);
    }
    for (const [id, count] of counts) {
      if (count > 1) {
        violations.push({ type: "duplicate-id", message: `id '${id}' is declared ${count} times — dragging one may silently move a different one instead` });
      }
    }
  }

  // F-023: nothing anywhere validates that a declared `shape` or property is one the
  // parser/renderer actually knows about — parseElementDecl accepts any `key: value` pair
  // with no allow-list at all. Verified against actual `.props` reads across index.html /
  // interactivity-module.js / annotations-module.js, and against language.md's own stated
  // per-shape restrictions (edge lengths / dimensions sections), not invented from scratch.
  const CORE_SHAPES = ["rect", "polygon", "polyline", "circle"];
  const SHARED_PROPS = ["position", "style", "placement", "childPlacement", "flush", "show", "allowCollisions", "label"];
  const SHAPE_PROPS = {
    rect: [...SHARED_PROPS, "size", "dimensions", "edgeLengths"],
    circle: [...SHARED_PROPS, "radius", "dimensions"],
    polygon: [...SHARED_PROPS, "points", "edgeLengths"],
    polyline: [...SHARED_PROPS, "points", "edgeLengths"],
  };
  const SHAPELESS_PROPS = ["position"];

  function checkUnrecognizedShapes(base, violations) {
    for (const node of collectAllNodes(base.root, [])) {
      const shape = node.props.shape;
      if (shape === undefined) continue; // a shapeless node is a documented, legitimate pattern (D-018's corner elements)
      if (CORE_SHAPES.includes(shape)) continue;
      if (window.PlanModules && window.PlanModules[shape]) continue;
      violations.push({ type: "unrecognized-shape", message: `'${node.id}': shape "${shape}" isn't recognized — rendering as an invisible point` });
    }
  }

  // A composite element (`compose: "wallWithDoor"`, D-046/D-072) has no `shape` of its own
  // and its props (`from`/`to`/`doorAt`/...) are module-specific — this language has no
  // declared schema for a module's own composition inputs, so it's skipped entirely rather
  // than flagged.
  function checkUnsupportedProperties(base, violations) {
    for (const node of collectAllNodes(base.root, [])) {
      if (node.props.compose !== undefined) continue;
      const shape = node.props.shape;
      if (shape !== undefined && !CORE_SHAPES.includes(shape)) continue; // already reported by checkUnrecognizedShapes
      const allowed = shape === undefined ? SHAPELESS_PROPS : SHAPE_PROPS[shape];
      for (const key of Object.keys(node.props)) {
        if (key === "shape" || allowed.includes(key)) continue;
        violations.push({ type: "unsupported-property", message: `'${node.id}': "${key}" isn't used by ${shape === undefined ? "a shapeless element" : `shape "${shape}"`} — ignored` });
      }
    }
  }

  // Two co-requirement checks living together since both read the same resolveContainer
  // result. `flush: true` without a resolved "inside" placement does nothing anywhere today
  // — not even the ephemeral drag-time warning below catches this exact combination, since
  // that one bails out before ever looking at `flush` when placement isn't "inside" (see
  // clampToContainment). An unrecognized `placement` value already warns, but only as a
  // one-off drag-time toast (line below) — promoted here into the permanent static panel so
  // it's visible on load, not only the first time someone happens to drag that element.
  function checkFlushPlacement(base, violations) {
    for (const node of collectAllNodes(base.root, [])) {
      if (!node.parentId) continue;
      const parent = base.nodesById[node.parentId];
      const { placement } = resolveContainer(node, parent, base);
      if (node.props.flush === true && placement !== "inside") {
        violations.push({ type: "flush-without-inside", message: `'${node.id}': flush: true has no effect unless placement resolves to "inside" (currently: ${placement ?? "none"})` });
      }
      if (typeof node.props.placement === "string" && placement !== "inside" && placement !== "outside") {
        violations.push({ type: "unrecognized-placement", message: `'${node.id}': placement "${node.props.placement}" isn't recognized (expected "inside" or "outside") — ignored` });
      }
    }
  }

  function checkPlanValidity(base, positions) {
    const violations = [];
    checkDuplicateIds(base, violations);
    checkCollisions(base, positions, violations);
    checkContainment(base, positions, violations);
    checkUnrecognizedShapes(base, violations);
    checkUnsupportedProperties(base, violations);
    checkFlushPlacement(base, violations);
    return violations;
  }

  function renderValidationPanel(violations) {
    if (!violations.length) {
      validationPanelEl.hidden = true;
      validationPanelEl.innerHTML = "";
      return;
    }
    validationPanelEl.hidden = false;
    validationPanelEl.innerHTML =
      `<div class="validation-title">${violations.length} issue${violations.length === 1 ? "" : "s"} found</div>` +
      `<ul>${violations.map((v) => `<li>${escapeHtml(v.message)}</li>`).join("")}</ul>`;
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
      // parseExpanded, not the bare parse — this drag frame's own throwaway tree needs
      // any synthesized composite children (docs/wall-with-door-module.js, D-046) in it
      // too, or resolving one by id (exactly what's about to happen for the very node
      // being dragged, if it's one of them) throws instead of finding nothing.
      base = core.parseExpanded(dragState.baseText);
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
      [dx, dy] = clampToContainment(node, parent, dx, dy, positionsForConstraints, warnings, base);
    }

    // A connected point resting on a rect's edge slides along that edge instead of
    // dragging the rect (D-032) — only for the directly-dragged element; Shift
    // (singleOnly) still means "ignore everything, move just me". Dragging the rect
    // itself is unaffected: a connected point still follows it rigidly. This has always
    // applied automatically, purely from the geometry (a connected point actually resting
    // on a rect) — `placement: "outside"` doesn't gate it, only confirms it: declaring it
    // explicitly is a way to state intent (and get warned below if that intent isn't
    // actually met), not a requirement to make the mechanic work at all.
    let edits = !dragState.singleOnly && !node.props.shape && node.props.position
      ? trySlideAlongConnectedRect(node, base, dx, dy, cornerUsers, warnings)
      : null;
    if (!edits && node.props.placement === "outside") {
      warnings.push(`${node.id}: placement "outside" expects a connection to a rect it's actually resting against — not met here, dragging normally instead`);
    }

    if (!edits) {
      const composite = composeParentOf(node, base);
      if (composite) edits = composeDragEdits(node, composite, dx, dy, warnings);
    }

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

  // ---------- Compose drag-editability (F-002's other, previously-unattempted half,
  // D-046) — a synthesized child (docs/wall-with-door-module.js's own _wall_a/_door/
  // _wall_b, pushed into the tree by core.registerBeforeRender before this module ever
  // sees it) has no source-text span of its own: it was computed, never typed, so
  // core.nodeDragEdits finds nothing editable in its points and produces no edits at all
  // — exactly the "nothing solvable to drag" gap D-046 flagged and deliberately left open
  // rather than guessed at. Solved backward into the *composite's own* from/to/doorAt
  // instead, genuinely more than D-012's generic "invert a linear expression" covers, so
  // handled as its own explicit, per-composition-type mechanism rather than a general one
  // — D-046's own framing, not a scope-cut made here. ----------

  // Only wallWithDoor exists right now (docs/wall-with-door-module.js) — this returns the
  // owning composite node only for that specific composition, not a general "is this
  // node's parent a composite" check, since there's nothing else yet to generalize from.
  function composeParentOf(node, base) {
    if (!node.parentId) return null;
    const parent = base.nodesById[node.parentId];
    return parent && parent.props.compose === "wallWithDoor" ? parent : null;
  }

  function composeDragEdits(node, composite, dx, dy, warnings) {
    const suffix = node.id.slice(composite.id.length);
    if (suffix !== "_wall_a" && suffix !== "_door" && suffix !== "_wall_b") return null;

    const from = composite.props.from, to = composite.props.to;
    if (!core.isEditable(from[0]) || !core.isEditable(from[1]) ||
        !core.isEditable(to[0]) || !core.isEditable(to[1])) {
      return null; // from/to aren't plain literals (e.g. an expression) — nothing to solve backward into
    }

    // Dragging either wall segment moves the whole wall: from and to shift together, the
    // same rigid-translate a hand-authored shape's literal points already get.
    if (suffix === "_wall_a" || suffix === "_wall_b") {
      return [
        { start: from[0].start, end: from[0].end, text: core.formatNumber(from[0].value + dx, from[0].unit) },
        { start: from[1].start, end: from[1].end, text: core.formatNumber(from[1].value + dy, from[1].unit) },
        { start: to[0].start, end: to[0].end, text: core.formatNumber(to[0].value + dx, to[0].unit) },
        { start: to[1].start, end: to[1].end, text: core.formatNumber(to[1].value + dy, to[1].unit) },
      ];
    }

    // Dragging the door itself slides it along the wall instead — only the component of
    // the drag along the wall's own direction matters, the same "off-axis motion does
    // nothing" shape D-032's outside-attached/flush mechanics already use elsewhere in
    // this file, just projected onto an arbitrary wall angle instead of an axis-aligned
    // rect edge.
    if (!core.isEditable(composite.props.doorAt)) return null;
    const fx = from[0].value, fy = from[1].value, tx = to[0].value, ty = to[1].value;
    const wallDx = tx - fx, wallDy = ty - fy;
    const wallLen = Math.hypot(wallDx, wallDy) || 1;
    const ux = wallDx / wallLen, uy = wallDy / wallLen;
    const slide = dx * ux + dy * uy;

    const doorWidth = core.numOf(composite.props.doorWidth);
    const doorAtProp = composite.props.doorAt;
    const proposed = doorAtProp.value + slide;
    const clamped = Math.min(Math.max(proposed, 0), Math.max(0, wallLen - doorWidth));
    if (clamped !== proposed) warnings.push(`${node.id}: reached the end of the wall`);
    if (clamped === doorAtProp.value) return [];

    return [{ start: doorAtProp.start, end: doorAtProp.end, text: core.formatNumber(clamped, doorAtProp.unit) }];
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
    try { base = core.parseExpanded(text); } catch (e) { base = null; }
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
    core.commitUndoStep();
  }

  function removeConnection(fromId, toId) {
    const text = core.sourceEl.value;
    let base;
    try { base = core.parseExpanded(text); } catch (e) { return; }
    const conn = base.connections.find((c) =>
      (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId));
    if (!conn) return;
    core.sourceEl.value = deleteSpans(text, [conn]);
    core.dragmsgEl.textContent = `Disconnected '${fromId}' and '${toId}'.`;
    core.rerender({ preserveViewBox: true });
    core.commitUndoStep();
  }

  // ---------- Duplicate (F-016) ----------
  // Locates the identifier token immediately following the `element` keyword at a known
  // declaration start — node.start already points there (D-030), but only covers the
  // *whole* `element id { ... }` span, never the bare id's own start/end.
  function findElementIdSpan(text, elementStart, id) {
    const m = /^element\s+(\w+)/.exec(text.slice(elementStart));
    if (!m || m[1] !== id) return null; // malformed/unexpected — caller skips this rename rather than corrupt the text
    const idStart = elementStart + m[0].length - m[1].length;
    return { start: idStart, end: idStart + m[1].length };
  }

  function uniqueId(base, usedIds) {
    if (!usedIds.has(base)) return base;
    let n = 2;
    while (usedIds.has(`${base}${n}`)) n++;
    return `${base}${n}`;
  }

  function collectSubtreeIds(node, out) {
    out.push(node.id);
    for (const child of node.children) collectSubtreeIds(child, out);
  }

  // Every corner-ref anywhere in the subtree (the node's own points, and every
  // descendant's) — returns the underlying AST node each one carries (D-018's
  // `fn.ast`/`fn.cornerRef`), which is what actually has a source span to rewrite.
  function collectCornerRefAsts(node, out) {
    if (node.props.points) {
      for (const pt of node.props.points) {
        if (typeof pt === "function" && pt.cornerRef) out.push(pt.ast);
      }
    }
    for (const child of node.children) collectCornerRefAsts(child, out);
  }

  // Clones an element and its whole subtree (F-016) as a new sibling, with a fresh id for
  // every node in it (checked against the *entire* plan, not just this subtree, so the
  // clone can't collide with something unrelated either) — retried with a numeric suffix
  // on collision, the same pattern this project already uses for a fresh id elsewhere
  // (e.g. the registration service's own username-collision retry).
  //
  // A corner-ref *inside* the subtree gets rewritten to its new counterpart; one pointing
  // *outside* it is left exactly as it was — a duplicated wall segment anchored to an
  // existing shared corner should still touch that exact corner, the same way the
  // original does. A `connection` where both ends are inside the subtree is duplicated
  // too (both ids rewritten); one where only one end is inside is deliberately left
  // alone — duplicating it would silently connect the new copy to whatever the original
  // was connected to, which is a relationship nobody asked for.
  function duplicateElement(nodeId) {
    const text = core.sourceEl.value;
    let base;
    try { base = core.parseExpanded(text); } catch (e) { return; }
    const node = base.nodesById[nodeId];
    if (!node) return;
    if (!node.parentId) {
      core.dragmsgEl.textContent = `${nodeId}: can't duplicate the plan's root element.`;
      return;
    }

    const subtreeIds = [];
    collectSubtreeIds(node, subtreeIds);
    const subtreeIdSet = new Set(subtreeIds);
    const usedIds = new Set(Object.keys(base.nodesById));
    const idMap = new Map();
    for (const id of subtreeIds) {
      const fresh = uniqueId(`${id}_copy`, usedIds);
      usedIds.add(fresh);
      idMap.set(id, fresh);
    }

    // Every edit below is computed against absolute source positions, then converted to
    // be relative to node.start once collected — the splice itself runs against the
    // *extracted* subtree text, not the full source, so descendant declarations' own
    // start/end (also absolute) need the same conversion.
    const edits = [];
    (function walkDecls(n) {
      const idSpan = findElementIdSpan(text, n.start, n.id);
      if (idSpan) edits.push({ start: idSpan.start - node.start, end: idSpan.end - node.start, text: idMap.get(n.id) });
      for (const child of n.children) walkDecls(child);
    })(node);

    const cornerRefAsts = [];
    collectCornerRefAsts(node, cornerRefAsts);
    for (const ast of cornerRefAsts) {
      if (typeof ast.start !== "number") continue; // defensive; always set now (parser change alongside this feature)
      const refId = ast.segments[0];
      if (subtreeIdSet.has(refId)) {
        edits.push({ start: ast.start - node.start, end: ast.end - node.start, text: idMap.get(refId) });
      }
    }

    // The clone gets a small position offset so it doesn't land exactly on top of the
    // original — only for plain literals; an expression-backed position is left
    // untouched rather than guessed at (same judgment call D-012's own solve-backward
    // machinery makes elsewhere: don't be clever about what isn't a simple literal).
    const OFFSET = 0.3;
    if (node.props.position && core.isEditable(node.props.position[0]) && core.isEditable(node.props.position[1])) {
      const [x, y] = node.props.position;
      edits.push({ start: x.start - node.start, end: x.end - node.start, text: core.formatNumber(x.value + OFFSET, x.unit) });
      edits.push({ start: y.start - node.start, end: y.end - node.start, text: core.formatNumber(y.value + OFFSET, y.unit) });
    } else if (node.props.points) {
      for (const pt of node.props.points) {
        if (!Array.isArray(pt)) continue;
        const [x, y] = pt;
        if (core.isEditable(x)) edits.push({ start: x.start - node.start, end: x.end - node.start, text: core.formatNumber(x.value + OFFSET, x.unit) });
        if (core.isEditable(y)) edits.push({ start: y.start - node.start, end: y.end - node.start, text: core.formatNumber(y.value + OFFSET, y.unit) });
      }
    }

    let clone = text.slice(node.start, node.end);
    edits.sort((a, b) => b.start - a.start);
    for (const ed of edits) clone = clone.slice(0, ed.start) + ed.text + clone.slice(ed.end);

    const newConnections = base.connections
      .filter((c) => subtreeIdSet.has(c.from) && subtreeIdSet.has(c.to))
      .map((c) => `connection ${idMap.get(c.from)} ${idMap.get(c.to)}\n`)
      .join("");

    let newText = text.slice(0, node.end) + "\n" + clone + text.slice(node.end);
    if (newConnections) newText = newText.trimEnd() + "\n" + newConnections;

    core.sourceEl.value = newText;
    core.dragmsgEl.textContent = `Duplicated '${nodeId}' as '${idMap.get(nodeId)}'.`;
    core.rerender();
    core.commitUndoStep();
  }

  function deleteElement(nodeId) {
    const text = core.sourceEl.value;
    let base;
    try { base = core.parseExpanded(text); } catch (e) { return; }
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
    core.commitUndoStep();
  }

  // ---------- Context menu ----------
  function openContextMenu(nodeId, x, y) {
    contextMenuItems = [
      { label: "Duplicate", action: () => duplicateElement(nodeId) },
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

  // Selecting a stacked/covered element (D-077's click-cycling) puts it in the *logical*
  // foreground (it's now the thing further clicks/drags target) but does nothing to its
  // *visual* stacking — render order alone still decides paint order, so a selected element
  // can stay hidden under whatever already covered it. This raises the whole selected
  // subtree (the node and every descendant, reusing collectAllNodes — same walk F-022's
  // validation pass already uses) to the end of the SVG, preserving their existing relative
  // order so a container's own children still paint on top of it, not the other way
  // around. Also moves each shape's immediately-following annotation `<g>` (if any) along
  // with it, so a re-ordered element's label/dimensions stay attached rather than being
  // left behind at the old position — preserves the exact sibling adjacency
  // annotations-module.js's own hover CSS rule depends on.
  function bringToFront(svgEl, prog) {
    const node = prog.nodesById[selectedId];
    if (!node) return;
    for (const n of collectAllNodes(node, [])) {
      const el = svgEl.querySelector(`[data-id="${CSS.escape(n.id)}"]`);
      if (!el) continue;
      const next = el.nextElementSibling;
      const annotation = next && next.tagName === "g" && next.classList.contains("annotation") ? next : null;
      svgEl.appendChild(el);
      if (annotation) svgEl.appendChild(annotation);
    }
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
    core.rootEl.appendChild(validationPanelEl);
    renderValidationPanel(checkPlanValidity(prog, positions));

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
      bringToFront(svgEl, prog);
    } else {
      delete core.rootEl.dataset.selectedId;
    }

    // A stationary click-cycle click never re-fires pointerover (the hovered DOM node gets
    // destroyed and replaced by this same rerender, but the pointer itself never moves), so
    // the stack-hint badge's ">" marker would otherwise stay stuck on whichever line was
    // current when the mouse first entered. Re-render just the marker against the frozen
    // candidate list on every render instead, so it reflects selectedId's latest value.
    if (stackHintCandidates && !stackBadgeEl.hidden) {
      stackBadgeEl.innerHTML = stackHintMarkup(stackHintCandidates);
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

  // ---------- Click-cycling through stacked elements (F-019, F-021) ----------
  // Every element actually painted at (clientX, clientY), nearest-first — deliberately not
  // reasoning about the tree (parent/child) at all, unlike an ancestor-walking approach
  // would: elementsFromPoint reflects real paint order, so it uniformly covers a container
  // fully hidden by its own children (F-019's own finding) *and* two unrelated siblings
  // that merely happen to overlap (F-021's broader case) with the same one mechanism,
  // rather than needing a second, different one later for the case this doesn't reach.
  function candidateIdsAtPoint(clientX, clientY) {
    const ids = [];
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const id = el.closest?.("[data-id]")?.dataset.id;
      if (id && program.nodesById[id] && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  // An "outside"-attached element (D-032's connected-point mode: touching its container
  // from the outside, e.g. a door sliding along a wall) legitimately shares a boundary
  // pixel with that container without being "stacked" with it in any meaningful sense —
  // nothing is hidden, nothing needs reaching. Filters any candidate out of a stacked-hint
  // list if its only reason for being there is exactly that relationship to another
  // candidate in the same list; requested directly as the fix for a real false positive.
  function excludeOutsideAttachedPairs(ids, base) {
    return ids.filter((id) => {
      const node = base.nodesById[id];
      const parent = node.parentId ? base.nodesById[node.parentId] : null;
      const { container, placement } = resolveContainer(node, parent, base);
      return !(placement === "outside" && container && ids.includes(container.id));
    });
  }

  // The badge's list and click-cycling's own stepping both need one **stable** ordering per
  // group of stacked ids — computed once, then reused for as long as that exact set of ids
  // keeps appearing together, regardless of how many times a hover/click retriggers this.
  // Without this, D-086's own bringToFront (raising whatever gets selected) changes live
  // elementsFromPoint order after every click, and either a stray pointerover retrigger or
  // simply re-hovering the same spot later would show the list in a different order each
  // time — confusing for something whose whole point is letting someone track "which one am
  // I on now." Keyed by the sorted id set (order-independent) so membership, not order,
  // decides whether this is "the same group" as before.
  const stackOrderCache = new Map();
  function resolvedCandidatesAtPoint(clientX, clientY) {
    const filtered = excludeOutsideAttachedPairs(candidateIdsAtPoint(clientX, clientY), program);
    const key = [...filtered].sort().join("|");
    if (!stackOrderCache.has(key)) stackOrderCache.set(key, filtered);
    return stackOrderCache.get(key);
  }

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
    // Which element a click actually targets: normally whatever's topmost at this pixel
    // (el.dataset.id, same as before) — unless this click lands within tolerance of the
    // *previous* plain click's own point, in which case it steps to whatever was one layer
    // further down that same stack last time, wrapping back to the top once exhausted.
    let chosenId = el.dataset.id;
    let cycleCandidates;
    if (clickCycle && Math.hypot(e.clientX - clickCycle.x, e.clientY - clickCycle.y) <= CLICK_CYCLE_TOLERANCE_PX) {
      // Frozen from when this cycle started (see handlePointerUp), not recomputed on every
      // click: bringToFront (below) reorders the DOM on every selection change, which would
      // otherwise scramble elementsFromPoint's own live order mid-cycle and get this stuck
      // bouncing between only the two most recently selected elements instead of ever
      // reaching the rest of the stack — a real bug, found while designing this, not
      // observed after the fact.
      cycleCandidates = clickCycle.candidates;
      const idx = cycleCandidates.indexOf(clickCycle.lastId);
      if (idx !== -1 && cycleCandidates.length > 1) chosenId = cycleCandidates[(idx + 1) % cycleCandidates.length];
    } else {
      cycleCandidates = resolvedCandidatesAtPoint(e.clientX, e.clientY);
    }

    const node = program.nodesById[chosenId];
    if (!node.props.position && !node.props.points) {
      core.dragmsgEl.textContent = `${node.id}: has no explicit position/points in source, nothing to drag`;
      return;
    }
    drag = { id: node.id, baseText: core.sourceEl.value, clientX: e.clientX, clientY: e.clientY, moved: false, singleOnly: e.shiftKey, cycleCandidates };
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
    if (!drag) {
      // Keeps the F-021 stack badge glued to the actual cursor while it's showing —
      // handlePointerOver only ever fires once on entering an element, not continuously.
      if (!stackBadgeEl.hidden) {
        stackBadgeEl.style.left = `${e.clientX}px`;
        stackBadgeEl.style.top = `${e.clientY}px`;
      }
      return;
    }
    // Same 3px-of-slop threshold canvasDrag already uses to tell a pan from a plain click —
    // reused here so a click-cycle (see candidateIdsAtPoint) only ever advances on a genuine
    // click-in-place, never gets reset by the sub-pixel jitter of a real drag's first frame.
    if (!drag.moved && Math.hypot(e.clientX - drag.clientX, e.clientY - drag.clientY) > 3) drag.moved = true;
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
      // A plain click (never moved) remembers its own point + chosen id, so a repeated
      // click right there can step to the next thing underneath next time; an actual drag
      // invalidates it — dragging is a deliberate move, not "try again at this spot".
      clickCycle = drag.moved ? null : { x: drag.clientX, y: drag.clientY, lastId: drag.id, candidates: drag.cycleCandidates };
      drag = null;
      core.rerender({ preserveViewBox: true });
      // Once per gesture, not once per pointermove frame (applyDrag runs on every one of
      // those) — commitUndoStep is a no-op if the text didn't actually change, so a plain
      // click-to-select (drag set, nothing moved) never clutters history either.
      core.commitUndoStep();
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
    // F-021's remaining half: nothing before this ever told a viewer that a point has more
    // than one element stacked at it at all — only D-077's click-cycling let someone who
    // already suspected it *reach* the rest. A one-point sample at hover-entry (the same
    // sampling tradeoff click-cycling itself already makes, not a new one) is enough to
    // answer "is there more here", even though it can't promise every pixel of a large
    // shape agrees on the same answer.
    //
    // The plan's own root is excluded from the count — found by testing, not assumed safe:
    // a first version flagged *every* nested element, since a child's own parent is always
    // geometrically "underneath" it by definition, and the root is always underneath
    // literally everything in the plan. That's true but never a surprise — the root is
    // already visible everywhere else on screen as the outer boundary, unlike a genuinely
    // hidden container (F-019's own case: a mid-tree container fully covered by its own
    // children, never visible *anywhere*). Excluding it turns this back into a signal for
    // the second, unexpected case rather than ambient noise on every single element.
    const allCandidates = resolvedCandidatesAtPoint(e.clientX, e.clientY);
    const nonRootCandidates = allCandidates.filter((id) => id !== program.root.id);
    if (nonRootCandidates.length > 1) {
      el.classList.add("stacked-hint");
      // The badge's own list shows every reachable candidate, root included — unlike the
      // trigger check just above, which stays root-excluded (so hovering an ordinary
      // element still doesn't fire the hint on every element in the plan). Excluding root
      // from the list too would let click-cycling (which never excludes it) land on
      // something this list doesn't even mention, leaving the ">" marker with nothing to
      // point at — a real bug, found by testing selecting the root via a full cycle, not
      // assumed safe.
      stackHintCandidates = allCandidates;
      stackBadgeEl.innerHTML = stackHintMarkup(allCandidates);
      stackBadgeEl.style.left = `${e.clientX}px`;
      stackBadgeEl.style.top = `${e.clientY}px`;
      stackBadgeEl.hidden = false;
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
    el.classList.remove("stacked-hint");
    stackHintCandidates = null;
    stackBadgeEl.hidden = true;
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
