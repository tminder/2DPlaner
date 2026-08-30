// External module (D-020): fetched at runtime via a <script src="interactivity-module.js">
// tag the core page creates, exactly like any shape-rendering module. Copied byte-for-byte
// from 14-interactivity-module/ — genuinely domain-agnostic, so a completely different plan
// (a property/house/utility-line site plan instead of a studio apartment) needed zero
// changes here. If this file HAD needed changes for a new domain, that would itself be a
// sign the core/module boundary was drawn wrong somewhere.
(function () {
  const core = window.PlanCore;
  if (!core) {
    console.error("interactivity-module.js: window.PlanCore not found — must load after the core script.");
    return;
  }

  // ---------- Interactivity's own presentation layer. Core's stylesheet only covers the
  // base object look and D-026's label hover-reveal (a rendering feature, not an
  // interactivity one) — everything state-driven by drag/select/hover/connect lives here. ----------
  function injectStyles(styleEl) {
    styleEl.textContent = `
      #plan-root svg [data-id] { cursor: grab; }
      #plan-root svg [data-id]:active { cursor: grabbing; }
      #plan-root:not(.dragging) svg .obj:hover { filter: drop-shadow(0 0 2px #37f) drop-shadow(0 0 2px #37f); }
      /* Core's own label hover-reveal rule (svg .obj:hover + .annotation[...]) has no idea
         a drag can be in progress — it's a plain rendering feature. This overrides it with
         higher specificity while #plan-root carries "dragging", rather than asking core to
         know about interactivity state. A real seam in the split, not a clean cut — see the
         page notes. */
      #plan-root.dragging svg .obj:hover + .annotation[data-show="hover"] { opacity: 0 !important; }
      svg .obj.connected-highlight { filter: drop-shadow(0 0 3px #e80) drop-shadow(0 0 3px #e80); }
      svg .obj.selected { stroke-width: 3px !important; }
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
    `;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  }

  // Belt-and-braces: if a previous instance's DOM somehow survived (shouldn't happen — core
  // evicts this module from its loaded-cache on cleanup, see registerModuleCleanup below —
  // but a stale leftover would be confusing to debug), start from a clean slate rather than
  // creating a duplicate.
  document.getElementById("interactivity-context-menu")?.remove();
  document.getElementById("interactivity-module-style")?.remove();

  const styleEl = document.createElement("style");
  styleEl.id = "interactivity-module-style";
  document.head.appendChild(styleEl);
  injectStyles(styleEl);

  const contextMenuEl = document.createElement("ul");
  contextMenuEl.id = "interactivity-context-menu";
  contextMenuEl.className = "context-menu";
  contextMenuEl.hidden = true;
  document.body.appendChild(contextMenuEl);

  // ---------- Module-owned state — none of this exists in core at all. ----------
  let program = null;
  let lastBboxes = {};
  let selectedId = null;
  let drag = null;
  let contextMenuItems = [];

  // ---------- Adjacency/contact-point/icon math — moved out of core entirely (see the page
  // notes: this is interactivity-only geometry, core just returns bboxes as a byproduct of
  // rendering rects). Unchanged from 13-unified otherwise. ----------
  const TOUCH_TOLERANCE = 0.05;

  // A bare position-only node (e.g. haus_anschluss — no shape) gets a degenerate,
  // zero-size "box" here rather than being excluded — otherwise it can never appear in the
  // connect/disconnect icon system at all, since that system only ever knew about rects.
  // Found missing when asked to make exactly this kind of point detachable/reattachable
  // from the rect it's connected to.
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
    const xGap = Math.max(a.left, b.left) - Math.min(a.right, b.right);
    const yGap = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
    const xTouch = Math.abs(xGap) <= TOUCH_TOLERANCE;
    const yTouch = Math.abs(yGap) <= TOUCH_TOLERANCE;
    if (xTouch && yGap < 0) return true;
    if (yTouch && xGap < 0) return true;
    return false;
  }

  // How far to push a connect/disconnect icon away from a point node's own exact position —
  // not zero. An icon sitting exactly on a point's anchor-hit circle wins every pointerdown
  // there (painted after anchors, see the page notes), so a click meant to grab and drag the
  // point instead re-fires the icon's action and nothing ever starts dragging — a real bug,
  // not just a visual nitpick: 0.35m (21px at M=60) clears the anchor's 10px hit radius plus
  // the icon's own 9px radius with a couple of pixels to spare.
  const ICON_POINT_OFFSET = 0.35;

  // Which edge of `rect` a point is nearest to, and whether it's actually within that
  // edge's span (not just closest to the line the edge sits on, off to one side of it) —
  // shared by icon placement, connect-snap, and constrained-slide-along-the-wall below, all
  // of which need to answer "which wall is this point resting against".
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

  function contactPoint(a, b) {
    // Not exercised by this plan (no point-to-point connection exists here), but given the
    // same offset treatment for the same reason — an un-offset icon would have the identical
    // "swallows every click meant for the point" bug the point-vs-rect case above was fixed for.
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

  // Rect bboxes as before, plus a degenerate box for any bare position-only node (no
  // shape) — needed so a point like haus_anschluss can participate in connect/disconnect
  // at all. Used both for the connect-snap check and (via handleRendered below) for the
  // icon overlay itself, replacing core's own rect-only bboxes for that purpose.
  function computeBboxesForSnap(node, positions, bboxes) {
    const abs = positions[node.id];
    if (node.props.shape === "rect" && node.props.size) {
      const w = core.numOf(node.props.size[0]), h = core.numOf(node.props.size[1]);
      bboxes[node.id] = { left: abs[0], top: abs[1], right: abs[0] + w, bottom: abs[1] + h };
    } else if (node.props.position && !node.props.shape) {
      bboxes[node.id] = { left: abs[0], top: abs[1], right: abs[0], bottom: abs[1] };
    }
    for (const child of node.children) computeBboxesForSnap(child, positions, bboxes);
  }

  // Where exactly a point should land on a rect it's snapping onto: the nearest edge it's
  // already aligned with (within tolerance), correcting only the perpendicular coordinate —
  // a point has no "extent" to slide flush the way two rects do, just one offset to zero out.
  function pointRectSnapDelta(point, rect) {
    const nearest = nearestRectEdge(point, rect);
    if (!nearest || nearest.dist > TOUCH_TOLERANCE) return null;
    if (nearest.edge === "left") return { dx: rect.left - point.left, dy: 0 };
    if (nearest.edge === "right") return { dx: rect.right - point.left, dy: 0 };
    if (nearest.edge === "top") return { dx: 0, dy: rect.top - point.top };
    return { dx: 0, dy: rect.bottom - point.top };
  }

  // D-032's "outside, attached" placement mode, first real slice of it: while a point stays
  // rigidly connected to a rect it's actually resting against, dragging the point slides it
  // along that one edge instead of the old behavior (drag the point -> drag the whole rect
  // along with it, D-014's undifferentiated rigid propagation). Motion perpendicular to the
  // wall is ignored entirely; motion along it is clamped to the wall's own span, i.e. the
  // point can't slide past the corner onto a different wall. Returns null (not applicable —
  // caller should fall back to ordinary rigid dragging), [] (applicable, no motion this
  // frame), or a real edits array.
  function trySlideAlongConnectedRect(node, base, dx, dy, cornerUsers, warnings) {
    const positions = {};
    core.computePositions(base.root, null, [0, 0], positions);
    const bboxes = {};
    computeBboxesForSnap(base.root, positions, bboxes);
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

  // ---------- Generic text-splice helpers (own copy — not parser-internal, so not worth
  // core exposing just for this). ----------
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

    // A connected point resting on a rect's edge slides along that edge instead of dragging
    // the rect (D-032) — but only for the node being *directly* dragged; Shift (singleOnly)
    // still means "ignore all of this, move just me" as it always has. Dragging the rect
    // itself is untouched below: a connected point still follows it rigidly, unchanged.
    let edits = !dragState.singleOnly && !node.props.shape && node.props.position
      ? trySlideAlongConnectedRect(node, base, dx, dy, cornerUsers, warnings)
      : null;

    if (!edits) {
      edits = [...core.nodeDragEdits(node, parent, dx, dy, base, cornerUsers, warnings)];
      if (!dragState.singleOnly) {
        for (const otherId of core.connectedNodeIds(dragState.id, base.connections)) {
          const otherNode = base.nodesById[otherId];
          const otherParent = otherNode.parentId ? base.nodesById[otherNode.parentId] : null;
          edits.push(...core.nodeDragEdits(otherNode, otherParent, dx, dy, base, cornerUsers, warnings));
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

  // ---------- Connect / disconnect (with snap) / delete ----------
  // `toId` moved before regardless of what it was — fine when both sides are rects, but
  // snapping a whole rect onto a small attachment point (or vice versa, if the point
  // happened to be selected second) is the wrong side to move. Now: if exactly one side is
  // a bare point, that's always the mover, whichever of fromId/toId it happens to be.
  function snapEdits(base, fromId, toId) {
    const positions = {};
    core.computePositions(base.root, null, [0, 0], positions);
    const bboxes = {};
    computeBboxesForSnap(base.root, positions, bboxes);
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
      // A point snapping onto a rect's boundary: correct whichever single coordinate is
      // off, along the nearest edge it's already aligned with — see pointRectSnapDelta.
      const delta = pointRectSnapDelta(mover, anchor);
      if (!delta) return [];
      dx = delta.dx; dy = delta.dy;
    } else if (anchorIsPoint) {
      // Shouldn't normally happen given the moverId choice above (a point is always
      // preferred as the mover), but handled for completeness rather than assumed away.
      const delta = pointRectSnapDelta(anchor, mover);
      if (!delta) return [];
      dx = -delta.dx; dy = -delta.dy;
    } else {
      // Both rects — unchanged original logic.
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
      core.dragmsgEl.textContent = `${nodeId}: can't delete the plan's root node.`;
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

  // ---------- After every render (however it was triggered — typing in the editor, or one
  // of this module's own actions), reapply the selection class and lay the connect/
  // disconnect icons on top. Full DOM replacement each render (core's rootEl.innerHTML)
  // means there's never stale overlay state to clean up first. ----------
  function handleRendered(prog, result) {
    program = prog;
    // Not core's own result.bboxes (rects only) — recomputed here to also include bare
    // position-only nodes as degenerate boxes, so a point like haus_anschluss can show up
    // in the connect/disconnect icon overlay below at all. Cheap to redo at this scale.
    const positions = {};
    core.computePositions(prog.root, null, [0, 0], positions);
    lastBboxes = {};
    computeBboxesForSnap(prog.root, positions, lastBboxes);

    const svgEl = core.rootEl.querySelector("svg");
    if (!svgEl) return;

    if (selectedId) {
      core.rootEl.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)?.classList.add("selected");
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
    // Appended after core's own output — including its anchors, painted last within that
    // output for D-018's reasons — so icons end up on top of anchors here, a reversal of
    // 13-unified's ordering (icons before anchors there). A real, minor consequence of icons
    // no longer being something core renders at all; harmless for this example (icons and
    // anchors never coincide in it) but worth being honest about, not hidden.
    if (icons.length) svgEl.insertAdjacentHTML("beforeend", icons.join("\n"));
  }
  const unregisterOnRendered = core.onRendered(handleRendered);

  // ---------- Event wiring — every handler is a named function (not an inline arrow) so
  // registerModuleCleanup below can remove exactly what was added, nothing more, nothing
  // left behind. ----------
  function handlePointerDown(e) {
    if (e.button !== 0) return; // right-click only opens the context menu, see contextmenu below
    if (!program) return;

    const iconEl = e.target.closest("[data-action]");
    if (iconEl) {
      const { action, a, b } = iconEl.dataset;
      if (action === "connect") createConnection(a, b);
      else removeConnection(a, b);
      return;
    }

    const el = e.target.closest("[data-id]");
    if (!el) { selectedId = null; core.rerender({ preserveViewBox: true }); return; }
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

  function handlePointerMove(e) {
    if (!drag) return;
    const dx = (e.clientX - drag.clientX) / core.M;
    const dy = (e.clientY - drag.clientY) / core.M;
    applyDrag(drag, dx, dy);
  }

  function handlePointerUp() {
    core.rootEl.classList.remove("dragging");
    if (drag) {
      selectedId = drag.id; // click or drag-and-release both select the object
      drag = null;
      core.rerender({ preserveViewBox: true });
    }
  }

  function handlePointerOver(e) {
    if (drag) return;
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

  core.rootEl.addEventListener("pointerdown", handlePointerDown);
  core.rootEl.addEventListener("contextmenu", handleContextMenu);
  contextMenuEl.addEventListener("click", handleMenuClick);
  window.addEventListener("pointerdown", handleWindowPointerDown);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  core.rootEl.addEventListener("pointerover", handlePointerOver);
  core.rootEl.addEventListener("pointerout", handlePointerOut);

  // ---------- Teardown: undoes exactly what setup above did, so removing `module
  // "interactivity-module.js"` from the plan actually turns interactivity off instead of it
  // silently staying wired up forever. Registered under the exact string used in the plan's
  // own `module "..."` declaration, which is how core knows which cleanup to run when that
  // declaration disappears. ----------
  core.registerModuleCleanup("interactivity-module.js", () => {
    unregisterOnRendered();
    core.rootEl.removeEventListener("pointerdown", handlePointerDown);
    core.rootEl.removeEventListener("contextmenu", handleContextMenu);
    contextMenuEl.removeEventListener("click", handleMenuClick);
    window.removeEventListener("pointerdown", handleWindowPointerDown);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    core.rootEl.removeEventListener("pointerover", handlePointerOver);
    core.rootEl.removeEventListener("pointerout", handlePointerOut);
    core.rootEl.classList.remove("dragging");
    contextMenuEl.remove();
    styleEl.remove();
    drag = null;
    selectedId = null;
    if (core.modlogEl) core.modlogEl.textContent += "[module] 'interactivity-module.js' removed — interactivity deactivated\n";
  });

  if (core.modlogEl) core.modlogEl.textContent += "[module] 'interactivity-module.js' (external) wired up drag/select/connect/delete\n";
})();
