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
      /* D-144: right-click's own "Connect to…" pick-a-target mode — a crosshair over the
         whole viewer, not just [data-id] shapes, since empty canvas is a valid (if inert)
         click during picking too, same as Ctrl/Cmd-drag's own gesture. */
      #plan-root.picking svg, #plan-root.picking svg [data-id] { cursor: crosshair; }
      /* D-138: bumped from 2px/0.55 -- reported as too subtle, alongside the ask that hover
         and selected share the same glow treatment (this rule and .selected below now
         differ only in color, both single soft drop-shadows at the same blur/alpha). */
      #plan-root:not(.dragging) svg .obj:hover { filter: drop-shadow(0 0 4px rgba(51,119,255,0.85)); }
      /* Core's label hover-reveal rule is a plain rendering feature with no idea a drag can
         be in progress; this overrides it with higher specificity while #plan-root carries
         "dragging", rather than making core aware of interactivity state. */
      #plan-root.dragging svg .obj:hover + .annotation[data-show="hover"] { opacity: 0 !important; }
      /* Reported directly: hovering an element showed it in hover's own blue (:hover, above,
         wins on specificity there) while its connected partner — lit up via this class alone,
         since the pointer isn't actually over it — showed a different, orange glow. The two
         are the same interaction (hovering either one highlights the pair together) and read
         as unrelated features while they didn't match; same color/size as hover now, so a
         connected partner reads as "also part of what's being hovered," not a separate thing. */
      svg .obj.connected-highlight { filter: drop-shadow(0 0 4px rgba(51,119,255,0.85)); }
      /* D-138: D-137's hard-edged shadow (before that, D-136's bbox outline; before that,
         D-134's original soft-but-too-subtle glow) is gone again -- reported directly: stay
         with a glow after all, but more visible, and make hover and selected look like the
         same *kind* of effect (they'd drifted apart -- hover a plain soft glow, selected a
         two-layer hard offset shadow -- reading as two unrelated treatments). Same shape as
         :hover above now, just purple instead of blue: a single, symmetric, un-offset
         drop-shadow, same boosted 4px/0.85 strength. Automatically shape-accurate for every
         kind (rect/circle/polygon/polyline) the same way every filter-based version here
         has been -- no per-shape-kind geometry needed. */
      svg .obj.selected { filter: drop-shadow(0 0 4px rgba(124,58,237,0.85)); }
      /* F-047: a live preview during an in-progress marquee drag -- same purple hue as
         .selected above (it's a preview of exactly that state), lower alpha so a genuinely
         selected element and a merely-about-to-be-selected one stay visually distinct. */
      svg .obj.marquee-candidate { filter: drop-shadow(0 0 4px rgba(124,58,237,0.4)); }
      /* F-016: matches .selected's own purple accent above, so a handle reads as part of
         the same selection affordance rather than a separate, unrelated control. */
      svg .resize-handle { fill: #fff; stroke: #7c3aed; stroke-width: 1.5px; cursor: pointer; }
      svg .resize-handle:hover { fill: #7c3aed; }
      #plan-root:not(.dragging) .anchor-hit:hover { fill: #e33; opacity: 0.7; }
      /* Live feedback for the Ctrl/Cmd-drag relate gesture: whichever other element is
         currently under the cursor while the source itself stays put — a distinct color
         (green, matching the old connect icon's own color) so it doesn't read as plain hover
         or as the purple selection glow. */
      svg .obj.relate-candidate { filter: drop-shadow(0 0 3px rgba(42,138,62,0.85)); }
      /* D-150 (F-012): Shift-held drag-driven reparenting's own live target highlight -- a
         third distinct hue (amber/orange) alongside relate's green and selected/marquee's
         purple, so it never reads as either of those instead. */
      svg .obj.reparent-candidate { filter: drop-shadow(0 0 3px rgba(230,126,34,0.9)); }
      svg .obj.corner-preview { stroke: #e33 !important; filter: drop-shadow(0 0 2px #e33); }
      /* F-021's remaining half: discovering a hidden element exists at all, not just
         reaching it (D-077's click-cycling already covers reaching it). Dimming *every*
         element in the stack together — not just the one literally under the cursor — only
         when handlePointerOver has actually confirmed something else is stacked there, never
         unconditionally — gives an immediate, literal glimpse of the whole layering at once,
         which is more informative than dimming one layer at a time would be; the badge
         (below) then names each one and marks which is currently selected. Applied directly
         via a JS-toggled class, not a :hover selector, since the mouse is only ever literally
         over one of these elements even though every one of them needs to dim together. */
      #plan-root:not(.dragging) svg .obj.stacked-dim { opacity: 0.55; }
      #interactivity-stack-badge { position: fixed; z-index: 1001; pointer-events: none;
        transform: translate(14px, 14px); background: rgba(30,68,87,0.94); color: #fff;
        font-family: system-ui, sans-serif; font-size: 12px; font-weight: 600;
        padding: 0.35rem 0.55rem; border-radius: 8px;
        box-shadow: 0 3px 10px rgba(0,0,0,0.25); white-space: nowrap; }
      #interactivity-stack-badge[hidden] { display: none; }
      #interactivity-stack-badge .stack-line { display: flex; gap: 0.5em; opacity: 0.55; padding: 0.05rem 0; }
      #interactivity-stack-badge .stack-line.current { opacity: 1; }
      #interactivity-stack-badge .stack-marker { width: 0.9em; flex: none; }
      /* D-145/D-146: round buttons arranged in a ring around the click point, replacing
         D-144's list-style dropdown -- kept as a single fixed-position 0x0 anchor box at the
         click point itself, with every button absolutely positioned off of it via its own
         inline --tx/--ty custom properties (see renderRadialMenu/radialButtonHtml). */
      .radial-menu { position: fixed; z-index: 1002; font-family: system-ui, sans-serif; }
      .radial-menu[hidden] { display: none; }
      /* D-146: bumped from 42px -- reported as too small a target. --tx/--ty (rather than
         baking translate directly into the animated transform) let radial-pop below
         animate scale+position together without needing a keyframe per button. */
      .radial-btn { position: absolute; left: 0; top: 0; width: 50px; height: 50px;
        margin: -25px 0 0 -25px; padding: 0; border-radius: 50%; border: 1px solid #ccc;
        background: #fff; color: #333; cursor: pointer; display: flex; align-items: center;
        justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.18);
        transform: translate(var(--tx), var(--ty));
        animation: radial-pop 110ms ease-out backwards; }
      @keyframes radial-pop {
        from { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0.4); }
        to { opacity: 1; transform: translate(var(--tx), var(--ty)) scale(1); }
      }
      .radial-btn:not(.disabled):hover { background: #eef2ff; }
      .radial-btn svg { width: 23px; height: 23px; }
      .radial-btn.danger { color: #a11; }
      .radial-btn.disabled { opacity: 0.4; cursor: default; }
      /* Placement's own radio-style Inside/Snapped/Free -- no room for a checkmark glyph on
         a round button, so "currently active" is a tinted fill instead. */
      .radial-btn.checked { background: #dbe7ff; border-color: #7c9fe0; }
      /* D-146: the button's own full label, shown centered above it on hover/focus instead
         of the browser's native title tooltip box (dropped in favor of aria-label,
         which still names the button for assistive tech, just without that native popup) --
         plain text with a soft light halo for legibility over whatever's underneath, not a
         bordered/filled box. ::before (not ::after, already used by --group's own "has
         more" dot below) so a group button can show both at once. */
      .radial-btn::before { content: attr(aria-label); position: absolute; left: 50%;
        bottom: calc(100% + 8px); transform: translateX(-50%); white-space: nowrap;
        font-size: 11px; font-weight: 600; color: #333; pointer-events: none;
        text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 1px 2px #fff; opacity: 0;
        transition: opacity 100ms ease-out; }
      .radial-btn:hover::before, .radial-btn:focus-visible::before { opacity: 1; }
      /* A group button (e.g. "Placement") isn't itself an action -- clicking it toggles a
         second ring of its own children blooming from this same button's own angle, instead
         of a side flyout (D-144's own hover-based one never worked reliably on touch to
         begin with). The dot marks "has more"; .expanded restyles the button once its own
         ring is showing, so the anchor stays visually obvious while open. */
      .radial-btn--group::after { content: ""; position: absolute; right: -1px; bottom: -1px;
        width: 10px; height: 10px; border-radius: 50%; background: #7c9fe0; border: 1.5px solid #fff; }
      .radial-btn--group.expanded { background: #eef2ff; border-color: #7c9fe0; }
      /* Always rendered (never created on demand) so a test can locate a nested action
         directly by its own button -- exactly like D-144's own always-in-DOM, CSS-hidden
         submenu <ul>. No edge-of-viewport handling beyond the anchor's own clamped
         placement (see showRadialMenu) -- a ring's own extent is accounted for there.
         D-146: scales in from its own group button's own angle (transform-origin 0 0, the
         ring's own anchor point == the click point, same origin every button already
         measures its own --tx/--ty from) rather than just fading, so a bloom reads as
         *coming from* the button that was clicked. */
      .radial-ring { position: absolute; left: 0; top: 0; opacity: 0; pointer-events: none;
        transform: scale(0.6); transform-origin: 0 0;
        transition: opacity 130ms ease-out, transform 130ms ease-out; }
      .radial-ring.expanded { opacity: 1; pointer-events: auto; transform: scale(1); }

      #interactivity-scale-bar { position: absolute; right: 10px; bottom: 10px;
        display: flex; flex-direction: column; align-items: center; pointer-events: none;
        font-family: system-ui, sans-serif; font-size: 11px; color: #333; }
      #interactivity-scale-bar .bar { height: 6px; border-left: 1.5px solid #333;
        border-right: 1.5px solid #333; border-bottom: 1.5px solid #333; }
      #interactivity-scale-bar .label { margin-top: 2px; background: rgba(255,255,255,0.85);
        padding: 0 4px; border-radius: 2px; }
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
  document.getElementById("interactivity-validation-panel")?.remove();
  document.getElementById("interactivity-stack-badge")?.remove();

  const styleEl = document.createElement("style");
  styleEl.id = "interactivity-module-style";
  document.head.appendChild(styleEl);
  injectStyles(styleEl);

  const contextMenuEl = document.createElement("div");
  contextMenuEl.id = "interactivity-context-menu";
  contextMenuEl.className = "radial-menu";
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

  // D-156: moved into the header (View tab), reported directly -- #header-fit-btn is a
  // stable slot core always provides (see its own comment in docs/index.html), unhidden
  // here rather than created fresh the way this module's other floating UI still is.
  const fitBtnEl = document.getElementById("header-fit-btn");
  if (fitBtnEl) fitBtnEl.hidden = false;

  const validationPanelEl = document.createElement("div");
  validationPanelEl.id = "interactivity-validation-panel";
  validationPanelEl.hidden = true;
  core.rootEl.appendChild(validationPanelEl);

  // ---------- Module-owned state — core has none of this. ----------
  let program = null;
  let lastBboxes = {};
  let lastPositions = {};
  let selectedId = null;
  // F-029: the full multi-selection, including selectedId itself whenever it's non-empty
  // (both are empty/null together) — selectedId stays the "primary" member, still driving
  // everything that's deliberately single-element-only (resize handles, keyboard
  // nudge/resize, the dataset.selectedId DOM signal code-highlight-module.js's own
  // selection-range reading depends on). Alt+click toggles membership; Shift and Ctrl/Cmd
  // are both already taken (drag-alone, connect), so Alt is the only unused modifier.
  let selectedIds = new Set();
  let drag = null;
  // F-016: dragging one of the visible resize handles shown on the selected rect/circle.
  // kind "corner" (rect): anchorAbs is that handle's own diagonally-opposite corner, fixed
  // for the gesture's duration; startAbs is the rect's original top-left, used to turn an
  // absolute delta into a local position edit (see applyResizeDrag). kind "radius" (circle):
  // startAbs is just the circle's own center, anchorAbs unused. baseText, like drag's own,
  // is reparsed fresh on every move rather than the live evolving source — see
  // applyResizeDrag for why.
  let resizeDrag = null;
  // D-139: dragging one of the per-vertex handles shown on a selected polygon/polyline for
  // a literal [x,y] point (a corner-reference point has no state of its own here -- its own
  // handle just starts an ordinary `drag` on the referenced sibling node instead, see
  // handlePointerDown). startAbs is that point's own absolute position at gesture start,
  // used the same way resizeDrag's own startAbs is; baseText reparsed fresh every move, same
  // reasoning as resizeDrag/drag — see applyVertexDrag.
  let vertexDrag = null;
  // D-143: dragging one of a polygon/polyline's 4 bounding-box scale handles. pivotAbs is
  // the diagonally-opposite bbox corner (fixed for the gesture, exactly like resizeDrag's
  // own anchorAbs); originalCornerAbs is the dragged corner's own starting position, used
  // to derive the live sx/sy scale factors; originalPoints snapshots every point's own
  // absolute position (and, for a literal point, its own start/end/unit spans) so each
  // move recomputes from the same fixed starting geometry, never accumulated.
  let scaleDrag = null;
  // Ctrl/Cmd+drag on an element (replacing the old +/- icons): fromId never moves for the
  // gesture's duration, candidateId tracks whichever other element is currently under the
  // cursor (null when there's no valid target there) so it can get a live highlight.
  let relateDrag = null;
  // D-144: the right-click "Connect to…" menu action's own way of picking a target —
  // relateDrag's own candidate-highlight/validity logic, just triggered by hover-with-no-
  // button-down (started from a menu click, not a mousedown) instead of hover-during-drag.
  // The next click resolves it: a valid candidate opens the exact same openRelateMenu
  // confirmation the drag gesture's own drop already does; anything else just cancels.
  let connectPick = null; // { fromId }
  let contextMenuItems = [];
  // D-145: which group's own ring (by index, matching renderRadialMenu's own numbering
  // order) is currently blooming open, if any -- reset on every fresh menu open, toggled by
  // handleMenuClick's own group-button branch via setExpandedGroup, which only ever flips
  // .expanded on the specific button/ring elements involved (D-146: never re-renders the
  // menu's own innerHTML for a toggle -- that used to replace every button's DOM node,
  // including the untouched first ring's own, silently replaying its opening animation on
  // every single group click).
  let expandedGroup = null;
  // F-019/F-021: the point and last-chosen id of the last plain click (not a drag) that
  // landed on more than one stacked element — lets a *repeated* click at the same spot step
  // to the next thing underneath, rather than always re-grabbing whatever's on top. Set in
  // handlePointerUp, read in handlePointerDown; see candidateIdsAtPoint below. No longer
  // freezes its own candidates list (S-005) — resolvedCandidatesAtPoint is now always
  // correct, so it's recomputed fresh on every click instead.
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
  // F-047: Alt+pointerdown on empty space instead starts a marquee, not a pan -- see
  // handlePointerDown. bboxes: a one-time Map<id, DOMRect> snapshot (Element.getBBox(),
  // already in viewBox units) taken at gesture start, since nothing moves during this
  // gesture -- re-querying on every pointermove would be pure waste.
  let marqueeDrag = null;

  // F-036: pinch-to-zoom. activeTouches tracks every currently-down touch pointer
  // (pointerId -> {x,y}) regardless of what other gesture, if any, is in progress — purely
  // so a second finger landing can be detected and take over. pinch itself is only set once
  // there are two.
  const activeTouches = new Map();
  let pinch = null; // {startDist, startMid: {x,y}, startView: {x,y,width,height}}
  let longPressTimer = null;
  const LONG_PRESS_MS = 500; // the common mobile long-press default

  // S-011: one place for "is the pointer mid-gesture right now" — drag/canvasDrag/
  // relateDrag are kept as three separate variables (each has its own distinct shape, and
  // a full merge into one discriminated-union gesture object was considered and rejected:
  // the real payoff turned out to be just this one check, not worth the much larger diff
  // touching every read/write site across handlePointerDown/Move/Up/Over) — but the
  // three-way OR itself was already independently duplicated twice (F-043's own keyboard
  // guard, and handlePointerOver's), exactly the "remembering which handler runs in what
  // order" fragility this entry warns about. A future fourth gesture, or a third guard,
  // now has one place to update instead of a third copy to remember.
  function isGestureActive() {
    return !!(drag || canvasDrag || relateDrag || pinch || resizeDrag || marqueeDrag || vertexDrag || scaleDrag || connectPick);
  }

  // ---------- Snap geometry ----------
  const TOUCH_TOLERANCE = 0.05;

  // A bare position-only element (no shape) gets a degenerate, zero-size box rather than
  // being excluded from connect/disconnect entirely.
  function isPointBox(b) { return b.left === b.right && b.top === b.bottom; }

  // Which edge of `rect` a point is nearest to, and within that edge's span — shared by
  // connect-snap and constrained-slide-along-the-wall.
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

  // Rect bboxes plus a degenerate box for any bare position-only element — used for the
  // connect-snap check and the Ctrl-drag relate gesture's own "attach outside" snap.
  function computeBboxes(node, positions, bboxes) {
    const abs = positions[node.id];
    if (node.props.shape === "rect" && node.props.size) {
      const w = core.numOf(node.props.size[0]), h = core.numOf(node.props.size[1]);
      // D-141: connect-snap/relate-drag only need a "close enough to touch" box, not exact
      // geometry — core's own conservative AABB (superset of the true rotated footprint) is
      // a fine, simple fit here, unlike collision/containment below which use the exact
      // rotated corners instead (solidGeometryFor/childRectCornersAt).
      bboxes[node.id] = core.rotatedRectAABB(abs[0], abs[1], w, h, core.numOf(node.props.rotation ?? 0));
    } else if (node.props.position && !node.props.shape) {
      bboxes[node.id] = { left: abs[0], top: abs[1], right: abs[0], bottom: abs[1] };
    }
    for (const child of node.children) computeBboxes(child, positions, bboxes);
  }

  // A node's own "meaningful center" for drawing a connection line to/from it — a rect's or
  // circle's own center, a polygon/polyline's centroid, or a bare point's own position.
  // Mirrors annotations-module.js's own `nodeCenter` exactly (same per-shape branching, same
  // reason: D-039 keeps the two modules independent, so this is a small, deliberate parallel
  // rather than a shared import — the same tradeoff S-023 already names for this file).
  function nodeCenter(node, positions) {
    const ownAbs = positions[node.id];
    if (!ownAbs) return null;
    const { shape } = node.props;
    if (shape === "rect" && node.props.size) {
      const w = core.numOf(node.props.size[0]), h = core.numOf(node.props.size[1]);
      return [ownAbs[0] + w / 2, ownAbs[1] + h / 2];
    }
    if ((shape === "polyline" || shape === "polygon") && node.props.points) {
      const absPts = node.props.points.map((pt) => core.resolvePointAbs(pt, ownAbs, positions));
      return [absPts.reduce((s, p) => s + p[0], 0) / absPts.length, absPts.reduce((s, p) => s + p[1], 0) / absPts.length];
    }
    return ownAbs;
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

  // D-141: a rotated rect's own true 4 corners (rotatePoint is defined further down this
  // same file — hoisted, like every other function here, so the forward reference is fine).
  // Used wherever a rotated rect needs to participate in the *exact* polygon-vs-polygon
  // collision/containment machinery below, rather than reduced to a conservative bbox.
  function rotatedRectCorners(x, y, w, h, deg) {
    const cx = x + w / 2, cy = y + h / 2;
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => rotatePoint(px, py, cx, cy, deg));
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
      const rotationDeg = core.numOf(node.props.rotation ?? 0);
      // D-141: a rotated rect reports itself as a polygon (its own true rotated corners),
      // not a rect box — shapesOverlap/pointInPolygon/etc. below already handle an arbitrary
      // polygon exactly, so this alone gives correct (not merely conservative) collision and
      // containment for a rotated rect, for free, with no changes needed to either.
      if (rotationDeg) return { kind: "polygon", points: rotatedRectCorners(ownAbs[0], ownAbs[1], w, h, rotationDeg) };
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
      const rotationDeg = core.numOf(node.props.rotation ?? 0);
      if (rotationDeg) return { kind: "polygon", points: rotatedRectCorners(x + dx, y + dy, w, h, rotationDeg) };
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
    const rotationDeg = core.numOf(node.props.rotation ?? 0);
    if (rotationDeg) return rotatedRectCorners(x + dx, y + dy, w, h, rotationDeg);
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
  // at once," not a special case this needs to detect). Never needs to warn (it's exact,
  // there's no "reached the end" case) — `_warnings` exists only so this shares an
  // identical call signature with clampFlushInsideRect (S-004: snapPositionEdits calls
  // both through the same `clampFn` parameter, and a mismatched signature there used to
  // mean an 8th argument was silently dropped).
  function clampRectToStayInsideRect(childId, dx, dy, positions, parentAbs, parentSize, childSize, _warnings) {
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
  // S-001: the one piece genuinely duplicated (not just similarly-named) across
  // clampFlushInsideRect, trySlideAlongConnectedRect, and composeDragEdits's door-slide —
  // confirmed by reading all three, not assumed from the shared "clamp/slide" naming
  // pattern the rest of this section's functions only superficially share. Everything
  // else here (nearestRectEdge vs. nearestParentRectEdge, the four position-clamp
  // algorithms themselves) was checked and found to solve genuinely different problems,
  // not left unmerged for lack of time — see decisions.md for the full read.
  function clampSpanWithWarning(nodeId, value, min, max, warnings) {
    const clamped = Math.min(max, Math.max(min, value));
    if (clamped !== value) warnings.push(`${nodeId}: reached the end of the wall`);
    return clamped;
  }

  function clampFlushInsideRect(nodeId, dx, dy, positions, parentAbs, parentSize, childSize, warnings) {
    const [x, y] = positions[nodeId];
    const [pw, ph] = parentSize, [cw, ch] = childSize;
    const currentBox = { left: x, top: y, right: x + cw, bottom: y + ch };
    const edge = nearestParentRectEdge(currentBox, parentAbs, parentSize);

    let newX = x, newY = y;
    if (edge === "left" || edge === "right") {
      newX = edge === "left" ? parentAbs[0] : parentAbs[0] + pw - cw;
      newY = clampSpanWithWarning(nodeId, y + dy, parentAbs[1], parentAbs[1] + ph - ch, warnings);
    } else {
      newY = edge === "top" ? parentAbs[1] : parentAbs[1] + ph - ch;
      newX = clampSpanWithWarning(nodeId, x + dx, parentAbs[0], parentAbs[0] + pw - cw, warnings);
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
    // D-141: clampRectToStayInsideRect/clampFlushInsideRect are exact but genuinely
    // axis-aligned-only (each axis clamps independently against the parent's own bounds) --
    // can't handle a rotated child or parent. Diverted to the general polygon-boundary path
    // below instead whenever either is rotated: parentBoundaryPolygon/childRectCornersAt
    // already return real rotated corners there (same rotatedRectCorners/solidGeometryFor
    // this file's collision code also now uses), so containment itself stays correct --
    // only *flush*, which has no equivalent in that general path, has to be given up.
    const containerRotated = !!core.numOf(container.props.rotation ?? 0);
    const childRotated = !!core.numOf(node.props.rotation ?? 0);
    if (container.props.shape === "rect" && container.props.size && !containerRotated && !childRotated) {
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
      const reason = containerRotated || childRotated
        ? "flush against a rotated rect isn't supported yet — kept inside, not pinned to an edge"
        : "flush only checked for a rect parent (D-032 scope), not enforced here";
      warnings.push(`${node.id}: ${reason}`);
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

  // F-037: a violation's own `spans` — where to mark it inline in the code pane, in
  // addition to naming it in the message. Always the property *key* token or the
  // element's own *id* token (never a value span — most values don't carry one at all,
  // e.g. a bare STRING) — both are plain IDENT tokens parseElementDecl already keeps
  // (docs/index.html). A composite-synthesized node (wall-with-door-module.js, D-046)
  // won't have either field; these helpers just return no spans for it rather than
  // throwing, so the violation still shows in the panel with no inline mark.
  function idSpan(node) {
    return node.idStart !== undefined ? [{ start: node.idStart, end: node.idEnd }] : [];
  }
  function keySpan(node, key) {
    const span = node.propKeySpans?.[key];
    return span ? [{ start: span.start, end: span.end }] : [];
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
            // Marks both sides — a collision is never really just one element's fault.
            violations.push({ type: "collision", message: `'${a.id}' and '${b.id}' overlap`, spans: [...idSpan(a), ...idSpan(b)] });
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
        violations.push({ type: "containment", message: `'${node.id}' is placed "inside" '${container.id}' but isn't actually inside it`, spans: idSpan(node) });
      }
    }
  }

  // F-028: two elements sharing an id doesn't error anywhere today, but silently corrupts
  // drag targeting (nodesById[id] = node last-writer-wins during parsing) — reported once
  // per duplicated id, not once per extra occurrence, since the fix is the same either way
  // (rename one of them). Collects the actual node list per id, not just a count (F-037) —
  // every occurrence gets its own inline mark, not just a message naming the id once.
  function checkDuplicateIds(base, violations) {
    const byId = new Map();
    for (const node of collectAllNodes(base.root, [])) {
      if (!node.id) continue;
      if (!byId.has(node.id)) byId.set(node.id, []);
      byId.get(node.id).push(node);
    }
    for (const [id, nodes] of byId) {
      if (nodes.length > 1) {
        violations.push({
          type: "duplicate-id",
          message: `id '${id}' is declared ${nodes.length} times — dragging one may silently move a different one instead`,
          spans: nodes.flatMap(idSpan),
        });
      }
    }
  }

  // F-023: nothing anywhere validates that a declared `shape` or property is one the
  // parser/renderer actually knows about — parseElementDecl accepts any `key: value` pair
  // with no allow-list at all. Verified against actual `.props` reads across index.html /
  // interactivity-module.js / annotations-module.js, and against language.md's own stated
  // per-shape restrictions (edge lengths / dimensions sections), not invented from scratch.
  const CORE_SHAPES = ["rect", "polygon", "polyline", "circle"];
  const SHARED_PROPS = ["position", "style", "placement", "childPlacement", "flush", "show", "allowCollisions", "label", "hidden"];
  const SHAPE_PROPS = {
    rect: [...SHARED_PROPS, "size", "dimensions", "edgeLengths", "rotation"],
    circle: [...SHARED_PROPS, "radius", "dimensions"],
    polygon: [...SHARED_PROPS, "points", "edgeLengths"],
    polyline: [...SHARED_PROPS, "points", "edgeLengths"],
  };
  // "placement" (specifically "outside") is a real, legitimate value for a shapeless point
  // (D-032's connected-point mode) — found missing here by testing D-107's new "Attach
  // outside" gesture live: it correctly wrote `placement: "outside"` onto a bare point, and
  // this schema immediately flagged that exact property as unsupported right back. "hidden"
  // (D-112's layers panel) added proactively for the identical reason — a shapeless point
  // is just as legitimate a thing to hide as any shaped element. "label" found missing the
  // same way, building the campervan example: a bare group container (no shape, e.g.
  // "einrichtung" wrapping a van's furniture) is exactly what the hierarchy panel's own
  // displayName(node) — node.props.label ?? node.id, used for every node uniformly — needs
  // a friendly name for, not just a shaped element.
  const SHAPELESS_PROPS = ["position", "placement", "hidden", "label"];

  function checkUnrecognizedShapes(base, violations) {
    for (const node of collectAllNodes(base.root, [])) {
      const shape = node.props.shape;
      if (shape === undefined) continue; // a shapeless node is a documented, legitimate pattern (D-018's corner elements)
      if (CORE_SHAPES.includes(shape)) continue;
      if (window.PlanModules && window.PlanModules[shape]) continue;
      violations.push({ type: "unrecognized-shape", message: `'${node.id}': shape "${shape}" isn't recognized — rendering as an invisible point`, spans: keySpan(node, "shape") });
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
        violations.push({ type: "unsupported-property", message: `'${node.id}': "${key}" isn't used by ${shape === undefined ? "a shapeless element" : `shape "${shape}"`} — ignored`, spans: keySpan(node, key) });
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
        violations.push({ type: "flush-without-inside", message: `'${node.id}': flush: true has no effect unless placement resolves to "inside" (currently: ${placement ?? "none"})`, spans: keySpan(node, "flush") });
      }
      if (typeof node.props.placement === "string" && placement !== "inside" && placement !== "outside") {
        violations.push({ type: "unrecognized-placement", message: `'${node.id}': placement "${node.props.placement}" isn't recognized (expected "inside" or "outside") — ignored`, spans: keySpan(node, "placement") });
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
    // F-037: data-spans is a "loose DOM signal" for code-highlight-module.js to pick up,
    // the same pattern core.rootEl.dataset.selectedId already is for the selection mark —
    // no formal cross-module API, just an attribute the other module knows to look for.
    // "start:end" pairs, comma-joined; absent (or empty) when a violation has no span at
    // all (a composite-synthesized node, no idStart/propKeySpans) — the message still
    // shows here regardless.
    validationPanelEl.innerHTML =
      `<div class="validation-title">${violations.length} issue${violations.length === 1 ? "" : "s"} found</div>` +
      `<ul>${violations.map((v) => {
        const spansAttr = (v.spans || []).map((s) => `${s.start}:${s.end}`).join(",");
        return `<li title="${escapeHtml(v.message)}"${spansAttr ? ` data-spans="${spansAttr}"` : ""}>${escapeHtml(v.message)}</li>`;
      }).join("")}</ul>`;
  }

  // ---------- Text-splice helpers ----------
  function toLineSpan(text, start, end) {
    while (start > 0 && text[start - 1] !== "\n") start--;
    while (end < text.length && text[end] !== "\n") end++;
    if (text[end] === "\n") end++;
    return { start, end };
  }

  // S-003: the sole "apply edits to a string" primitive (applyEditsDescending, defined
  // later in this file — function declarations are hoisted, so the forward reference is
  // fine) — this used to have its own separate sort+splice loop, one of three coexisting
  // idioms doing the identical thing.
  function deleteSpans(text, spans) {
    const edits = spans.map(({ start, end }) => {
      const s = toLineSpan(text, start, end);
      return { start: s.start, end: s.end, text: "" };
    });
    return applyEditsDescending(text, edits);
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

  // D-143: a polygon/polyline is eligible for whole-shape proportional scale only when
  // every corner it references is exclusive to it — cornerUsers[cid] lists every shape
  // referencing a given corner (core.computeCornerUsers), so length <= 1 means "nobody
  // else." A literal-points-only shape (no corner refs at all) is always eligible.
  function canScale(node, cornerUsers) {
    return cornerRefIdsOf(node).every((cid) => (cornerUsers[cid]?.length ?? 0) <= 1);
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

  // F-029/F-047: coveredIds is the same set applyDrag threads through every "other node"
  // loop (connected, group) to avoid editing one top-level id's own span twice — but a
  // polygon/polyline referencing a sibling corner (cornerIds below) edits that corner's
  // own span too, from *inside* this function, invisibly to those loops. If the corner
  // node is itself also selected/connected/grouped alongside the shape referencing it
  // (trivial for a marquee to scoop up both at once, where one Alt+click at a time rarely
  // would), the old code produced two overlapping edits for the same span — silently
  // corrupting the source text once spliced in (this is what surfaced live as "Can't
  // continue this drag: the source text is currently invalid"). Consulting/updating the
  // very same coveredIds set here, not a separate one, closes that regardless of which
  // side (the shape or its corner) happens to get processed first.
  function dragEditsFor(node, parent, dx, dy, base, cornerUsers, warnings, coveredIds) {
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
      if (coveredIds.has(cid)) continue;
      coveredIds.add(cid);
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

  // S-038: the shared "valid reparent/relate candidate" check -- exists, isn't the gesture's
  // own source, isn't an ancestor/descendant of it either way. Was hand-duplicated identically
  // in four places (relateDrag's own hover tracking, connectPick's hover tracking, connectPick's
  // D-152 pointerup-resolution recompute, D-150's own reparent-drag candidate detection).
  // `alsoExcludeId` covers D-150's one extra exclusion (the dragged node's own current parent --
  // dropping back on it isn't a new one) without forking the check itself for that one caller.
  function isValidGestureTarget(hoveredId, fromId, program, alsoExcludeId) {
    return !!(hoveredId && hoveredId !== fromId && hoveredId !== alsoExcludeId && program.nodesById[hoveredId]
      && !isAncestorOf(hoveredId, fromId, program) && !isAncestorOf(fromId, hoveredId, program));
  }

  // D-141: rotates a plan-space point around a pivot by `deg` (clockwise, matching core's
  // own rotatedRectAABB / the rendered SVG rotate() transform) — used both to place resize
  // handles at a rotated rect's own visual corners and, with a negated angle, to rotate the
  // live cursor *back* into a rotated rect's own un-rotated local frame before the existing
  // (rotation-unaware) resize/drag math runs.
  function rotatePoint(px, py, cx, cy, deg) {
    if (!deg) return [px, py];
    const rad = deg * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = px - cx, dy = py - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  }

  // F-031: grid-snapped dragging/resizing — reads `size` off `settings.grid` so the snap
  // increment can never drift from the visible grid's own size. Hard snap, no modifier-key
  // exception. D-149 decoupled this from the grid's own *visibility*: an explicit
  // `snap: false` turns discrete snapping off while a grid is still declared (and possibly
  // still visible) — omitting `snap` entirely preserves the original "on whenever a grid is
  // declared" default exactly. The reverse (snap with no visible grid) was already possible
  // via grid-module.js's own `layer: "none"` (grid still *declared*, just not rendered) —
  // but that still required declaring a `grid` object at all, just to get snapping with
  // nothing shown.
  //
  // D-156: reported directly -- the grid's own visibility and snapping should be
  // switchable independently from two separate header buttons, not just via a hand-edited
  // `layer: "none"`. A standalone `settings.snap: true` (own header button, independent of
  // `grid` entirely) is now a *second*, independent way snapping turns on -- doesn't
  // require a `grid` object to exist at all. The original grid-declared-implies-snap
  // default above is untouched, so any plan already relying on `grid.snap: false` (F-031,
  // tested by tests/test_grid_snap.py) keeps behaving exactly as it did before; the two
  // enable-paths are simply OR'd together, each independently controllable from its own
  // button.
  function snapIncrement() {
    const grid = program?.settings?.grid;
    const gridDrivenOn = !!grid && grid.snap !== false;
    const standaloneOn = program?.settings?.snap === true;
    if (!gridDrivenOn && !standaloneOn) return null;
    const size = core.numOf(grid?.size ?? 1);
    return size > 0 ? size : null;
  }

  // Snaps a delta, not a position directly — computes the dragged node's own absolute
  // *target* (startAbs + dx/dy), rounds that to the nearest grid multiple, and returns
  // the delta that lands there instead. Letting applyDrag's own containment/collision
  // clamps run afterward on this already-snapped delta (unchanged, no special-casing)
  // means they can still shrink it further in a tight space — the same way they already
  // override plain dragging today, not a new exception.
  function snappedDragDelta(startAbs, dx, dy) {
    const size = snapIncrement();
    if (!size || !startAbs) return [dx, dy];
    const targetX = startAbs[0] + dx, targetY = startAbs[1] + dy;
    const snappedX = Math.round(targetX / size) * size;
    const snappedY = Math.round(targetY / size) * size;
    return [snappedX - startAbs[0], snappedY - startAbs[1]];
  }

  // For a resize handle's corner drag — snaps the cursor's own plan point to the nearest
  // grid *intersection*, so the dragged corner visibly lands on the grid; every dependent
  // value (position, width, height) is then derived from this one already-snapped point,
  // not re-snapped independently.
  function snappedGridPoint(x, y) {
    const size = snapIncrement();
    if (!size) return [x, y];
    return [Math.round(x / size) * size, Math.round(y / size) * size];
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
    // F-029: every node that already got its own edits below, so the group-drag step
    // further down never adds a second, duplicate edit for the same span.
    const coveredIds = new Set([dragState.id]);

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
      edits = [...dragEditsFor(node, parent, dx, dy, base, cornerUsers, warnings, coveredIds)];
      if (!dragState.singleOnly) {
        for (const otherId of core.connectedNodeIds(dragState.id, base.connections)) {
          if (coveredIds.has(otherId)) continue;
          if (isAncestorOf(otherId, dragState.id, base) || isAncestorOf(dragState.id, otherId, base)) continue;
          const otherNode = base.nodesById[otherId];
          const otherParent = otherNode.parentId ? base.nodesById[otherNode.parentId] : null;
          edits.push(...dragEditsFor(otherNode, otherParent, dx, dy, base, cornerUsers, warnings, coveredIds));
          coveredIds.add(otherId);
        }
      }
    }

    // F-029: group-drag — every other explicitly multi-selected member also rides the same
    // already-clamped/snapped delta, exactly like a connected "other" node above; the only
    // difference is the source of "who else moves" (the explicit selection, not the
    // connection graph). Skipped for anything already covered above (no duplicate edit on
    // the same span) and for an ancestor/descendant of the primary, same guard as above.
    if (!dragState.singleOnly && dragState.groupIds) {
      for (const otherId of dragState.groupIds) {
        if (coveredIds.has(otherId)) continue;
        if (isAncestorOf(otherId, dragState.id, base) || isAncestorOf(dragState.id, otherId, base)) continue;
        const otherNode = base.nodesById[otherId];
        if (!otherNode) continue;
        const otherParent = otherNode.parentId ? base.nodesById[otherNode.parentId] : null;
        edits.push(...dragEditsFor(otherNode, otherParent, dx, dy, base, cornerUsers, warnings, coveredIds));
        coveredIds.add(otherId);
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

    let rect = null, rectNodeId = null;
    for (const otherId of core.connectedNodeIds(node.id, base.connections)) {
      const otherBox = bboxes[otherId];
      if (otherBox && !isPointBox(otherBox)) { rect = otherBox; rectNodeId = otherId; break; }
    }
    if (!rect) return null;

    const nearest = nearestRectEdge(myBox, rect);
    if (!nearest || nearest.dist > TOUCH_TOLERANCE) return null;

    // D-141: `rect` here is computeBboxes' own conservative AABB — fine for the earlier
    // "is anything nearby at all" check above, but sliding along it would visibly not track
    // a rotated rect's true (rotated) edge. Unsupported for now, same "not met here, dragging
    // normally instead" shape every other unmet placement expectation in this file uses.
    const rectNode = base.nodesById[rectNodeId];
    if (rectNode && core.numOf(rectNode.props.rotation ?? 0)) {
      warnings.push(`${node.id}: sliding along a rotated rect isn't supported yet, dragging normally instead`);
      return null;
    }

    let newX = myBox.left, newY = myBox.top;
    if (nearest.edge === "left" || nearest.edge === "right") {
      newY = clampSpanWithWarning(node.id, myBox.top + dy, rect.top, rect.bottom, warnings);
    } else {
      newX = clampSpanWithWarning(node.id, myBox.left + dx, rect.left, rect.right, warnings);
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
    const clamped = clampSpanWithWarning(node.id, doorAtProp.value + slide, 0, Math.max(0, wallLen - doorWidth), warnings);
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

  // ---------- Ctrl/Cmd+drag to create a relationship — replaces the old +/- icons ----------
  // A screen point (client pixels) converted into raw viewBox units — mirrors handleWheel's
  // own viewBox-from-cursor math (current = viewState||lastCoreFit, scale from the SVG's
  // actual on-screen size). The live relate-drag line (handlePointerMove) draws directly in
  // these units; clientToPlanPoint below just divides out core.M on top for the few callers
  // that need meters instead (bboxes/positions are meters, not raw viewBox units).
  // Real bug found by testing the relate-drag line live: whenever the SVG's own on-screen
  // aspect ratio doesn't match its viewBox's (near-universal, since the viewer pane is
  // whatever size the layout gives it), the default `preserveAspectRatio="xMidYMid meet"`
  // centers the content within whichever axis has slack instead of anchoring it at the
  // element's own top-left corner — a plain `scale` conversion with no offset silently
  // assumes there's no letterboxing, and was off by exactly that slack (over 80px vertically
  // in one reproduction), which is why the line's end didn't track the actual cursor.
  function clientToViewBoxPoint(clientX, clientY) {
    const svg = core.rootEl.querySelector("svg");
    const current = viewState || lastCoreFit;
    if (!svg || !current) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scale = Math.min(rect.width / current.width, rect.height / current.height);
    const offsetX = (rect.width - current.width * scale) / 2;
    const offsetY = (rect.height - current.height * scale) / 2;
    return [current.x + (clientX - rect.left - offsetX) / scale, current.y + (clientY - rect.top - offsetY) / scale];
  }

  function clientToPlanPoint(clientX, clientY) {
    const vb = clientToViewBoxPoint(clientX, clientY);
    return vb ? vb.map((v) => v / core.M) : null;
  }

  // F-047: plain axis-aligned intersection (not full containment) between the live marquee
  // rectangle and a candidate element's own snapshotted getBBox() -- both {x,y,width,height}.
  function rectsIntersect(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  // The nearest point lying exactly on a rect's boundary to an arbitrary point — unlike
  // nearestRectEdge (which only ever answers for a point already within tolerance of one
  // edge's own span, the "already resting against it" case), this always has an answer:
  // outside the rect, clamping each axis into range already lands on the boundary itself
  // (an edge if only one axis was out of range, a corner if both were); inside it, the
  // nearest of the four edges by simple distance.
  function nearestBoundaryPoint([px, py], rect) {
    if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) {
      return [Math.min(Math.max(px, rect.left), rect.right), Math.min(Math.max(py, rect.top), rect.bottom)];
    }
    const candidates = [
      { d: px - rect.left, p: [rect.left, py] },
      { d: rect.right - px, p: [rect.right, py] },
      { d: py - rect.top, p: [px, rect.top] },
      { d: rect.bottom - py, p: [px, rect.bottom] },
    ];
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0].p;
  }

  // Sets `placement: "outside"` on the source and snaps it to wherever the drop point lands
  // on the target's boundary — the cold-start anchor D-032's own live outside-slide mechanic
  // never had (F-035): that mechanic only ever *continues* an existing "resting on an edge"
  // state, it never establishes one. Scoped to a bare-point source (no shape) attaching to a
  // rect target, matching exactly what the live slide mechanic itself can act on afterward —
  // offering this for a shaped source would set an inert property with no follow-on behavior.
  function attachOutside(fromId, toId, dropClientX, dropClientY) {
    withParsedSource((text, base) => {
      const node = base.nodesById[fromId];
      const target = base.nodesById[toId];
      if (!node || !target) return;

      const positions = {};
      core.computePositions(base.root, null, [0, 0], positions);
      const bboxes = {};
      computeBboxes(base.root, positions, bboxes);
      const fromBox = bboxes[fromId], toBox = bboxes[toId];
      if (!fromBox || !toBox || !isPointBox(fromBox)) return;

      const dropPoint = clientToPlanPoint(dropClientX, dropClientY)
        ?? [(fromBox.left + toBox.left) / 2, (fromBox.top + toBox.top) / 2];
      const [nx, ny] = nearestBoundaryPoint(dropPoint, toBox);
      const dx = nx - fromBox.left, dy = ny - fromBox.top;

      const cornerUsers = {};
      core.computeCornerUsers(base.root, cornerUsers);
      const parent = node.parentId ? base.nodesById[node.parentId] : null;
      const edits = [...core.nodeDragEdits(node, parent, dx, dy, base, cornerUsers, [])];

      const existing = findOwnPropertyLine(text, node, "placement");
      if (existing) edits.push({ start: existing.start, end: existing.end, text: `${existing.indent}placement: "outside"` });
      else edits.push({ start: afterHeaderLine(text, node), end: afterHeaderLine(text, node), text: `${lineIndentAt(text, node.start)}  placement: "outside"\n` });

      const newText = applyEditsDescending(text, edits).trimEnd() + `\nconnection ${fromId} ${toId}\n`;
      commitSourceEdit(newText, `'${fromId}': attached outside '${toId}'.`);
    });
  }

  // The Ctrl-drag gesture's own drop-point choice menu — a pair's actions, not one node's
  // own (unlike contextMenuItems/openContextMenu), so it's built by this separate function
  // reusing the exact same contextMenuEl/contextMenuItems/showRadialMenu/handleMenuClick/
  // closeContextMenu machinery rather than folded into openContextMenu itself.
  function openRelateMenu(fromId, toId, x, y) {
    contextMenuItems = [];
    const renderItems = [];
    const push = (item) => { contextMenuItems.push(item); return contextMenuItems.length - 1; };

    const fromNode = program.nodesById[fromId];
    const toNode = program.nodesById[toId];
    const alreadyConnected = program.connections.some((c) =>
      (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId));

    renderItems.push({ i: push({
      label: `Connect to ${displayName(toNode)}`,
      icon: "link",
      action: () => createConnection(fromId, toId),
      disabled: alreadyConnected,
    }) });

    if (!fromNode.props.shape && toNode.props.shape === "rect" && toNode.props.size) {
      renderItems.push({ i: push({
        label: `Attach outside ${displayName(toNode)}`,
        icon: "external-link",
        action: () => attachOutside(fromId, toId, x, y),
      }) });
    }

    showRadialMenu(renderItems, x, y);
  }

  // D-144: right-click's own way to start the same "pick a target" flow relateDrag's own
  // Ctrl/Cmd+drag already offers — closing the context menu already happens on any menu
  // click (handleMenuClick), so this only needs to arm connectPick itself. The live
  // candidate highlight (handlePointerMove) and the click that resolves it
  // (handlePointerDown) are handled where every other gesture-ish state already is.
  function startConnectPick(fromId) {
    connectPick = { fromId };
    core.rootEl.classList.add("picking");
    core.dragmsgEl.textContent = `'${fromId}': click another element to connect it to — Escape to cancel.`;
  }

  function cancelConnectPick() {
    if (!connectPick) return;
    if (connectPick.candidateId) core.rootEl.querySelector(`[data-id="${CSS.escape(connectPick.candidateId)}"]`)?.classList.remove("relate-candidate");
    connectPick = null;
    core.rootEl.classList.remove("picking");
    core.dragmsgEl.textContent = "";
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

  // S-002: the shared shell every menu action below repeats — re-parse fresh from source
  // (never trust the possibly-stale `program` closure for an edit), bail out silently on a
  // parse error, then apply/commit. Each action's own real logic (what to validate, what
  // edits to compute, what message to show) stays entirely its own; only this mechanical
  // wrapper was ever actually identical between them.
  function withParsedSource(action) {
    const text = core.sourceEl.value;
    let base;
    try { base = core.parseExpanded(text); } catch (e) { return; }
    action(text, base);
  }

  function commitSourceEdit(newText, message) {
    core.sourceEl.value = newText;
    if (message) core.dragmsgEl.textContent = message;
    core.rerender();
    core.commitUndoStep();
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
  // F-029: the actual "clone a subtree" computation, factored out of duplicateElement's
  // own former single-node body so duplicateElements (below) can call it once per selected
  // root against one *shared* usedIds/idMap scope — a fresh id picked for one root's own
  // clone can then never collide with another root's clone either, not just with whatever
  // already existed in the plan. Never mutates `text`; only computes where/what to insert.
  function computeDuplication(text, base, nodeId, usedIds, idMap) {
    const node = base.nodesById[nodeId];
    const subtreeIds = [];
    collectSubtreeIds(node, subtreeIds);
    const subtreeIdSet = new Set(subtreeIds);
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

    const clone = applyEditsDescending(text.slice(node.start, node.end), edits);
    const newConnections = base.connections
      .filter((c) => subtreeIdSet.has(c.from) && subtreeIdSet.has(c.to))
      .map((c) => `connection ${idMap.get(c.from)} ${idMap.get(c.to)}\n`)
      .join("");

    return { insertAt: node.end, cloneText: clone, connectionsText: newConnections, newId: idMap.get(nodeId) };
  }

  function duplicateElement(nodeId) {
    withParsedSource((text, base) => {
      const node = base.nodesById[nodeId];
      if (!node) return;
      if (!node.parentId) {
        core.dragmsgEl.textContent = `${nodeId}: can't duplicate the plan's root element.`;
        return;
      }
      const usedIds = new Set(Object.keys(base.nodesById));
      const idMap = new Map();
      const { insertAt, cloneText, connectionsText, newId } = computeDuplication(text, base, nodeId, usedIds, idMap);

      let newText = text.slice(0, insertAt) + "\n" + cloneText + text.slice(insertAt);
      if (connectionsText) newText = newText.trimEnd() + "\n" + connectionsText;

      commitSourceEdit(newText, `Duplicated '${nodeId}' as '${newId}'.`);
    });
  }

  // F-029: bulk duplicate for a multi-selection. Filtered to selection *roots* first —
  // any selected id that's a descendant of another selected id is dropped, since its
  // ancestor's own subtree clone (computeDuplication always clones the whole subtree)
  // already carries it along; cloning it a second time would double it. One
  // computeDuplication call per root against a single shared usedIds/idMap scope, then
  // combined into one edit list and one commit — one undo step for the whole group.
  function duplicateElements(ids) {
    withParsedSource((text, base) => {
      const roots = ids.filter((id) => base.nodesById[id]
        && !ids.some((other) => other !== id && isAncestorOf(other, id, base)));
      for (const id of roots) {
        if (!base.nodesById[id].parentId) {
          core.dragmsgEl.textContent = `${id}: can't duplicate the plan's root element.`;
          return;
        }
      }
      if (!roots.length) return;

      const usedIds = new Set(Object.keys(base.nodesById));
      const idMap = new Map();
      const results = roots.map((id) => computeDuplication(text, base, id, usedIds, idMap));

      let newText = text;
      for (const r of [...results].sort((a, b) => b.insertAt - a.insertAt)) {
        newText = newText.slice(0, r.insertAt) + "\n" + r.cloneText + newText.slice(r.insertAt);
      }
      const allConnections = results.map((r) => r.connectionsText).filter(Boolean).join("");
      if (allConnections) newText = newText.trimEnd() + "\n" + allConnections;

      commitSourceEdit(newText, `Duplicated ${roots.length} element${roots.length === 1 ? "" : "s"}.`);
    });
  }

  function deleteElement(nodeId) {
    withParsedSource((text, base) => {
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
      if (selectedId === nodeId) selectedId = null;
      selectedIds.delete(nodeId);
      commitSourceEdit(deleteSpans(text, spans), `Deleted '${nodeId}'.`);
    });
  }

  // F-029: bulk delete for a multi-selection. Same selection-roots filtering as
  // duplicateElements (a descendant's own span is already inside its ancestor's, deleting
  // the ancestor already removes it too), then deleteElement's own two existing guards
  // (root; still referenced as a corner) applied per root — a corner reference from
  // another element *also* in this same bulk delete doesn't block it (that reference is
  // going away too), only one from outside the selection does. Any guard failure aborts
  // the whole bulk action with one message naming which id and why, rather than silently
  // deleting only some of what was selected (matches this project's own established "loud
  // failures" preference, S-017). One combined deleteSpans + one commit either way.
  function deleteElements(ids) {
    withParsedSource((text, base) => {
      const idSet = new Set(ids);
      const roots = ids.filter((id) => base.nodesById[id]
        && !ids.some((other) => other !== id && isAncestorOf(other, id, base)));

      const cornerUsers = {};
      core.computeCornerUsers(base.root, cornerUsers);

      for (const id of roots) {
        if (!base.nodesById[id].parentId) {
          core.dragmsgEl.textContent = `${id}: can't delete the plan's root element.`;
          return;
        }
        const users = (cornerUsers[id] || []).filter((u) => !idSet.has(u));
        if (users.length) {
          core.dragmsgEl.textContent = `${id}: still referenced as a corner by ${users.join(", ")} — remove those references first.`;
          return;
        }
      }
      if (!roots.length) return;

      const spans = [];
      for (const id of roots) {
        const node = base.nodesById[id];
        spans.push(node, ...base.connections.filter((c) => c.from === id || c.to === id));
      }
      if (selectedId && idSet.has(selectedId)) selectedId = null;
      selectedIds = new Set();
      commitSourceEdit(deleteSpans(text, spans), `Deleted ${roots.length} element${roots.length === 1 ? "" : "s"}.`);
    });
  }

  // A real (source-persisted) front/back swap, unlike D-086's selection-driven, purely
  // visual raise — deliberately a separate, explicit menu action so ordinary click-cycling
  // never itself rewrites the plan's source (confirmed directly, D-088). Scoped to siblings
  // sharing one parent: `position` is always relative to a parent's own local origin, so
  // reordering against something under a *different* parent would mean reparenting, silently
  // changing what that position means — a real risk, not just an edge case, so this simply
  // isn't offered for a stack that only overlaps across different parents.
  function reorderSibling(nodeId, toFront) {
    withParsedSource((text, base) => {
      const node = base.nodesById[nodeId];
      const parent = node?.parentId ? base.nodesById[node.parentId] : null;
      if (!parent) return;
      const others = parent.children.filter((n) => n !== node);
      if (!others.length) return;
      const anchor = toFront ? others[others.length - 1] : others[0];

      // toLineSpan (not Duplicate's cruder raw node.start/end) so the cut consumes the
      // element's own trailing newline cleanly — no blank line left behind, matching
      // deleteElement's own established precedent for removing a whole element's text.
      const cut = toLineSpan(text, node.start, node.end);
      const cutText = text.slice(cut.start, cut.end);
      const anchorSpan = toLineSpan(text, anchor.start, anchor.end);
      const insertPos = toFront ? anchorSpan.end : anchorSpan.start;

      const edits = [{ start: cut.start, end: cut.end, text: "" }, { start: insertPos, end: insertPos, text: cutText }];
      commitSourceEdit(applyEditsDescending(text, edits), `'${nodeId}' moved to the ${toFront ? "front" : "back"} of its siblings.`);
    });
  }

  // ---------- F-035: setting placement/flush directly from the context menu ----------
  // No existing mechanism finds an element's own top-level `key: value` line by text
  // position — parseValue's STRING branch (docs/index.html) carries no span the way a
  // numeric literal does (confirmed directly, not assumed). Scans for the first `key:` line
  // inside the node's own text that ISN'T inside one of its children's own spans, rather
  // than a naive whole-slice regex — a nested child could have its own same-named property,
  // and a naive scan would silently rewrite the wrong one.
  function findOwnPropertyLine(text, node, key) {
    const re = new RegExp(`^([ \\t]*)${key}\\s*:.*$`, "gm");
    const slice = text.slice(node.start, node.end);
    let m;
    while ((m = re.exec(slice))) {
      const absStart = node.start + m.index;
      if (!node.children.some((c) => absStart >= c.start && absStart < c.end)) {
        return { start: absStart, end: absStart + m[0].length, indent: m[1] };
      }
    }
    return null;
  }

  function lineIndentAt(text, pos) {
    let start = pos;
    while (start > 0 && text[start - 1] !== "\n") start--;
    return text.slice(start, pos).match(/^[ \t]*/)[0];
  }

  // Right after the node's own opening `element id {` line — where every shipped example
  // already puts its first property. Assumes a fresh line exists to land on (true for
  // every multi-line-formatted element, which is every shipped example) -- falls back to
  // node.end for a single-line one, which is fine for *this* function's own callers
  // (inserting a fresh property on the node's own line is still textually valid there,
  // just cosmetically appended rather than landing on its own new line).
  function afterHeaderLine(text, node) {
    let i = node.start;
    while (i < node.end && text[i] !== "\n") i++;
    return i < node.end ? i + 1 : i;
  }

  // D-150 (F-012): the position right after a node's own opening `{`, regardless of
  // whether it's formatted multi-line or all on one line -- unlike afterHeaderLine above,
  // this is used to insert a whole *child element* inside another node's braces (drag-
  // driven reparenting's own new parent), where landing after node.end instead (as
  // afterHeaderLine would for a single-line target, found live as a real bug: the moved
  // block ended up as a sibling stuck after the target's own closing brace, not nested
  // inside it) would corrupt the intended nesting outright, not just look a little
  // untidy the way a misplaced property insert still would.
  function afterOpenBrace(text, node) {
    return text.indexOf("{", node.idEnd) + 1;
  }

  // Reuses the exact clamp math a drag already applies (dx=dy=0 against the *current*
  // position), so setting the property from the menu doesn't leave an element sitting
  // wherever it happened to be until the next drag finally corrects it — only meaningful
  // for the rect-in-rect case this project's own containment clamp actually supports
  // (clampToContainment's own established scope); anything else just gets the property.
  function snapPositionEdits(node, containerNode, positions, clampFn, warnings) {
    if (node.props.shape !== "rect" || !node.props.size) return [];
    if (containerNode.props.shape !== "rect" || !containerNode.props.size) return [];
    if (!node.props.position) return [];
    const containerAbs = positions[containerNode.id];
    const containerSize = [core.numOf(containerNode.props.size[0]), core.numOf(containerNode.props.size[1])];
    const childSize = [core.numOf(node.props.size[0]), core.numOf(node.props.size[1])];
    const [dx, dy] = clampFn(node.id, 0, 0, positions, containerAbs, containerSize, childSize, warnings);
    if (!dx && !dy) return [];
    const [x0, y0] = node.props.position;
    const edits = [];
    if (core.isEditable(x0)) edits.push({ start: x0.start, end: x0.end, text: core.formatNumber(x0.value + dx, x0.unit) });
    if (core.isEditable(y0)) edits.push({ start: y0.start, end: y0.end, text: core.formatNumber(y0.value + dy, y0.unit) });
    return edits;
  }

  function applyEditsDescending(text, edits) {
    let out = text;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    return out;
  }

  // "Place Inside" always means the node's own *immediate* parent, per F-020's own
  // confirmed rule (an explicit `placement` never consults an ancestor's `childPlacement`)
  // — never resolveContainer's ancestor search, which only applies to a node with no
  // explicit placement of its own.
  function setPlacementInside(nodeId) {
    withParsedSource((text, base) => {
      const node = base.nodesById[nodeId];
      const parent = node?.parentId ? base.nodesById[node.parentId] : null;
      if (!parent) return;

      const edits = [];
      const existing = findOwnPropertyLine(text, node, "placement");
      if (existing) edits.push({ start: existing.start, end: existing.end, text: `${existing.indent}placement: "inside"` });
      else edits.push({ start: afterHeaderLine(text, node), end: afterHeaderLine(text, node), text: `${lineIndentAt(text, node.start)}  placement: "inside"\n` });

      const positions = {};
      core.computePositions(base.root, null, [0, 0], positions);
      const warnings = [];
      const isRectPair = node.props.shape === "rect" && node.props.size && parent.props.shape === "rect" && parent.props.size;
      edits.push(...snapPositionEdits(node, parent, positions, clampRectToStayInsideRect, warnings));

      const message = isRectPair
        ? `'${nodeId}': placed inside '${parent.id}'.`
        : `'${nodeId}': placement set to "inside" (position unchanged — containment only checked for rect children).`;
      commitSourceEdit(applyEditsDescending(text, edits), message);
    });
  }

  // Flush can sit on top of an *inherited* "inside" (a distant ancestor's childPlacement),
  // not only an explicit one on this node — resolveContainer (F-020) finds the actual
  // container either way, unlike setPlacementInside's own always-immediate-parent rule.
  function toggleFlush(nodeId) {
    withParsedSource((text, base) => {
      const node = base.nodesById[nodeId];
      const parent = node?.parentId ? base.nodesById[node.parentId] : null;
      if (!parent) return;
      const { container, placement } = resolveContainer(node, parent, base);
      if (placement !== "inside" || !container) return;
      const turningOn = node.props.flush !== true;

      const edits = [];
      const existing = findOwnPropertyLine(text, node, "flush");
      if (turningOn) {
        if (existing) edits.push({ start: existing.start, end: existing.end, text: `${existing.indent}flush: true` });
        else edits.push({ start: afterHeaderLine(text, node), end: afterHeaderLine(text, node), text: `${lineIndentAt(text, node.start)}  flush: true\n` });
      } else if (existing) {
        const span = toLineSpan(text, existing.start, existing.end);
        edits.push({ start: span.start, end: span.end, text: "" });
      }

      const isRectPair = node.props.shape === "rect" && node.props.size && container.props.shape === "rect" && container.props.size;
      if (turningOn) {
        const positions = {};
        core.computePositions(base.root, null, [0, 0], positions);
        edits.push(...snapPositionEdits(node, container, positions, clampFlushInsideRect, []));
      }

      const message = !turningOn ? `'${nodeId}': flush removed.`
        : isRectPair ? `'${nodeId}': now flush against '${container.id}'.`
        : `'${nodeId}': flush set (position unchanged — flush only checked for a rect parent).`;
      commitSourceEdit(applyEditsDescending(text, edits), message);
    });
  }

  // D-148/D-150/S-039: the drag-driven reparent (arbitrary target) generalizes what "No
  // placement (moves freely)" needs (a target that's always specifically the grandparent) --
  // same two-pass strip-placement-then-reparse-then-splice mechanic, same editable/missing/
  // expression-position branching, same absolute-position-difference math, same cut-and-
  // reinsert splice. `placement`/`flush` are stripped unconditionally: a changed container
  // invalidates any placement relative to the *old* one, since `placement` always means "this
  // node's own current immediate parent" (setPlacementInside's own established rule) --
  // silently keeping it would mean it now applies to a parent the user never asked for that.
  // `opts.successMessage`/`opts.degradeMessage` (both `(nodeId, newParentId) => string`) let
  // clearPlacement below phrase its own two outcomes in its own terms ("placement cleared,
  // moved out of ...") while sharing this exact mechanic rather than duplicating it.
  function reparentElement(nodeId, newParentId, opts = {}) {
    withParsedSource((text, base) => {
      const node = base.nodesById[nodeId];
      const newParent = base.nodesById[newParentId];
      if (!node || !newParent || !node.parentId) return;
      if (newParentId === node.parentId) return; // already there -- not a real reparent
      if (nodeId === newParentId || isAncestorOf(nodeId, newParentId, base)) return; // no cycles

      const propSpans = ["placement", "flush"].map((key) => findOwnPropertyLine(text, node, key)).filter(Boolean);

      // Two passes, not one combined edit list: stripping placement/flush first means every
      // offset used below comes from a *fresh* reparse of the already-stripped text, never
      // sharing a position with one of the just-deleted property lines -- simpler and
      // provably correct rather than reasoning about two edits that might land on the
      // identical offset (e.g. if `placement` happened to be this node's very first property
      // line, right where a freshly-inserted `position` line would also need to go).
      const strippedText = deleteSpans(text, propSpans);
      let strippedBase;
      try { strippedBase = core.parseExpanded(strippedText); } catch (e) { return; }
      const freshNode = strippedBase.nodesById[nodeId];
      const freshNewParent = strippedBase.nodesById[newParentId];
      if (!freshNode || !freshNewParent) return;
      // Re-checked against the fresh tree too -- belt and braces, matching this codebase's
      // own established caution around structural edits.
      if (freshNode.id === freshNewParent.id || isAncestorOf(freshNode.id, freshNewParent.id, strippedBase)) return;

      const [x0, y0] = freshNode.props.position ?? [null, null];
      if ((x0 && !core.isEditable(x0)) || (y0 && !core.isEditable(y0))) {
        // Can't safely rewrite an expression-valued position to preserve where this sits
        // visually -- degrades to stripping placement/flush in place, matching this
        // codebase's own established "warn and fall back" convention for exactly this class
        // of risk (D-141's flush-against-a-rotated-rect, D-143's expression-valued scale
        // points).
        const degradeMessage = opts.degradeMessage
          ? opts.degradeMessage(nodeId, newParentId)
          : `'${nodeId}': can't move it into '${newParentId}' automatically -- its position is an expression, can't be safely rewritten.`;
        commitSourceEdit(strippedText, degradeMessage);
        return;
      }

      const positions = {};
      core.computePositions(strippedBase.root, null, [0, 0], positions);
      const [nodeAbsX, nodeAbsY] = positions[freshNode.id];
      const [npAbsX, npAbsY] = positions[freshNewParent.id];
      const newX = nodeAbsX - npAbsX, newY = nodeAbsY - npAbsY;

      const cut = toLineSpan(strippedText, freshNode.start, freshNode.end);
      const positionEdits = freshNode.props.position
        ? [
            { start: x0.start, end: x0.end, text: core.formatNumber(newX, x0.unit) },
            { start: y0.start, end: y0.end, text: core.formatNumber(newY, y0.unit) },
          ]
        : [{
            start: afterHeaderLine(strippedText, freshNode), end: afterHeaderLine(strippedText, freshNode),
            text: `${lineIndentAt(strippedText, freshNode.start)}  position: [${core.formatNumber(newX, "m")}, ${core.formatNumber(newY, "m")}]\n`,
          }];
      const localEdits = positionEdits.map((e) => ({ start: e.start - cut.start, end: e.end - cut.start, text: e.text }));
      let movedText = applyEditsDescending(strippedText.slice(cut.start, cut.end), localEdits);

      // Reindented to the *target's* own child depth -- a drop target can be shallower,
      // deeper, or a different branch entirely at the same depth. The node's own current
      // indent prefix is swapped for the new parent's own child indent, line by line -- each
      // line's *extra* indentation beyond that shared prefix (its own descendants, whatever
      // it contains) carries through untouched, just re-based to the new starting depth.
      const oldIndent = lineIndentAt(strippedText, freshNode.start);
      const newIndent = lineIndentAt(strippedText, freshNewParent.start) + "  ";
      movedText = movedText.split("\n")
        .map((line) => (line.startsWith(oldIndent) ? newIndent + line.slice(oldIndent.length) : line))
        .join("\n");

      // Inserted right after the new parent's own opening brace -- becoming its *first
      // child*. afterOpenBrace, not afterHeaderLine -- the target can be formatted
      // single-line, where afterHeaderLine's own "next newline, or node.end" fallback would
      // land after the target's own closing brace instead of inside it.
      const insertAt = afterOpenBrace(strippedText, freshNewParent);
      // A leading newline of its own -- movedText already carries its own indentation
      // (captured via toLineSpan on the way out) but nothing separating it from whatever
      // character sits immediately after the target's own `{` (usually none at all).
      const edits = [{ start: cut.start, end: cut.end, text: "" }, { start: insertAt, end: insertAt, text: `\n${movedText}` }];
      const successMessage = opts.successMessage
        ? opts.successMessage(nodeId, newParentId)
        : `'${nodeId}': moved into '${newParentId}'.`;
      commitSourceEdit(applyEditsDescending(strippedText, edits), successMessage);
    });
  }

  // D-148/S-039: "No placement (moves freely)" genuinely detaches the element from its
  // parent -- not just its placement/flush constraints (all this action used to clear) but
  // the structural containment itself, promoting it to the grandparent, its position
  // rewritten to keep it exactly where it visually was. Scoped to one level, matching
  // setPlacementInside's own established "placement always means the immediate parent"
  // convention -- not a blanket "detach from the whole ancestry". This project's grammar
  // only ever allows a single root element (parseProgram parses exactly one top-level
  // `element`, then only `connection` lines/EOF), so a node whose parent already IS the root
  // has nowhere to promote to: it just keeps clearing placement/flush in place, same as this
  // action always did before. The "has grandparent" case delegates entirely to
  // reparentElement, which is provably equivalent here: the grandparent's own child indent
  // is, by construction, exactly one level shallower than the node's current indent (parent
  // is grandparent's child, one level deeper) -- exactly reparentElement's own general
  // reindent-to-target-depth logic, applied to this specific target. The one visible
  // difference from clearPlacement's old bespoke splice: the node now lands as the
  // grandparent's *first* child (reparentElement's own insertion point) rather than as a
  // sibling positioned right where the old parent used to sit among the grandparent's other
  // children -- a cosmetic reordering only, not checked by any existing test.
  function clearPlacement(nodeId) {
    withParsedSource((text, base) => {
      const node = base.nodesById[nodeId];
      if (!node) return;
      const parent = node.parentId ? base.nodesById[node.parentId] : null;
      const grandparent = parent?.parentId ? base.nodesById[parent.parentId] : null;
      const propSpans = ["placement", "flush"].map((key) => findOwnPropertyLine(text, node, key)).filter(Boolean);
      if (!propSpans.length) return;

      if (!grandparent) {
        commitSourceEdit(deleteSpans(text, propSpans), `'${nodeId}': placement cleared.`);
        return;
      }

      reparentElement(nodeId, grandparent.id, {
        successMessage: (id) => `'${id}': placement cleared, moved out of '${parent.id}'.`,
        degradeMessage: (id) => `'${id}': placement cleared, but its position is an expression -- can't move it out of '${parent.id}' automatically.`,
      });
    });
  }

  // ---------- Context menu ----------
  // An element's own label if it has one, its raw id otherwise — the exact fallback
  // precedent D-087 already established for the F-021 stack-hint badge, reused here so a
  // menu label naming a container reads the same way that badge already does.
  function displayName(node) {
    return node.props.label ?? node.id;
  }

  // D-145: one hand-authored icon per distinct action, in the exact same style already used
  // for the app's own ribbon-bar buttons (see docs/index.html's rename-btn/plan-new-btn) --
  // a fixed viewBox/stroke wrapper (ICON_SVG_OPEN/CLOSE) around each icon's own path data,
  // so a button's full label only has to live in its `title` tooltip, not crammed into a
  // 42px circle.
  const ICON_SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  const ICON_SVG_CLOSE = "</svg>";
  const ICONS = {
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
    trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>',
    "chevrons-up": '<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>',
    "chevrons-down": '<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>',
    move: '<polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline><polyline points="15 19 12 22 9 19"></polyline><polyline points="19 9 22 12 19 15"></polyline><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line>',
    "log-in": '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line>',
    magnet: '<path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"></path><path d="m5 8 4 4"></path><path d="m12 15 4 4"></path>',
    unlock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',
    unlink: '<path d="m18.84 12.25 1.72-1.71a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"></path><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"></path><line x1="8" y1="2" x2="8" y2="5"></line><line x1="2" y1="8" x2="5" y2="8"></line><line x1="16" y1="19" x2="16" y2="22"></line><line x1="19" y1="16" x2="22" y2="16"></line>',
    "external-link": '<path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>',
  };

  // First ring (top-level actions/groups) and second ring (a group's own children,
  // "blooming" from that group's own button) -- radii tuned empirically live, same as
  // D-143's own handle-offset tuning. RADIAL_2's inner edge sits comfortably clear of
  // RADIAL_1's outer edge (132-25=107 vs 70+25=95) so the two rings never visually overlap.
  // D-146: bumped alongside the button size itself (was 62/118/21 for a 42px button).
  const RADIAL_1 = 70;
  const RADIAL_2 = 132;
  const RADIAL_BTN_RADIUS = 25;

  function polarOffset(radius, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return [radius * Math.cos(rad), radius * Math.sin(rad)];
  }

  // N peers with no particular direction of their own -- spread evenly around a full circle,
  // starting at the top and going clockwise (index 0 is always straight up).
  function ringAngle(index, count) {
    return count <= 1 ? -90 : -90 + (360 / count) * index;
  }

  // A group's own children are conceptually attached to the button that revealed them --
  // fanned across a small arc *centered on that parent button's own angle* (capped, so a
  // group with many connections doesn't sprawl a full half-circle) rather than spread around
  // the whole circle like top-level peers are.
  function fanAngle(index, count, parentAngleDeg) {
    if (count <= 1) return parentAngleDeg;
    const spread = Math.min(150, 42 * (count - 1));
    return parentAngleDeg - spread / 2 + (spread / (count - 1)) * index;
  }

  // D-146: `aria-label` (not `title`) carries the button's own full label -- still names it
  // for assistive tech, but without the browser's own native tooltip box; the visual hover
  // label is CSS-only (.radial-btn::before, `content: attr(aria-label)`), centered on the
  // button itself. --tx/--ty (not a plain inline `transform`) are what the CSS's own
  // radial-pop keyframes and base transform rule both read the position from.
  function radialButtonHtml(item, dataAttr, extraClass, dx, dy) {
    const classes = ["radial-btn", extraClass, item.danger ? "danger" : "", item.disabled ? "disabled" : "",
      item.checked ? "checked" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="${classes}" ${dataAttr} aria-label="${escapeHtml(item.label)}" ` +
      `style="--tx: ${dx.toFixed(1)}px; --ty: ${dy.toFixed(1)}px;">` +
      `${ICON_SVG_OPEN}${ICONS[item.icon] ?? ""}${ICON_SVG_CLOSE}</button>`;
  }

  // contextMenuItems stays the flat action registry handleMenuClick already indexes into
  // (data-i="N" -> contextMenuItems[N]) regardless of how deep a leaf is visually nested —
  // renderItems is a separate, small tree describing layout only. A leaf is { i }; a group
  // (e.g. "Placement") is { label, icon, group: [...] }, not itself an action (no data-i) —
  // clicking it toggles expandedGroup instead (see handleMenuClick), blooming its own
  // children as a second ring around this same click point rather than a hover flyout.
  function renderRadialMenu(items) {
    const count = items.length;
    let groupIndex = -1;
    let firstRingHtml = "";
    let ringsHtml = "";
    items.forEach((entry, idx) => {
      const angleDeg = ringAngle(idx, count);
      const [dx, dy] = polarOffset(RADIAL_1, angleDeg);
      if (entry.group) {
        groupIndex += 1;
        const g = groupIndex;
        const expanded = g === expandedGroup;
        firstRingHtml += radialButtonHtml(
          { label: entry.label, icon: entry.icon },
          `data-group-index="${g}"`,
          `radial-btn--group${expanded ? " expanded" : ""}`,
          dx, dy,
        );
        const childCount = entry.group.length;
        const childrenHtml = entry.group.map((childEntry, ci) => {
          const [cdx, cdy] = polarOffset(RADIAL_2, fanAngle(ci, childCount, angleDeg));
          return radialButtonHtml(contextMenuItems[childEntry.i], `data-i="${childEntry.i}"`, "", cdx, cdy);
        }).join("");
        ringsHtml += `<div class="radial-ring${expanded ? " expanded" : ""}" data-group-index="${g}">${childrenHtml}</div>`;
      } else {
        firstRingHtml += radialButtonHtml(contextMenuItems[entry.i], `data-i="${entry.i}"`, "", dx, dy);
      }
    });
    return firstRingHtml + ringsHtml;
  }

  function clampMenuCoord(v, viewportSize, extent, margin) {
    const lo = extent + margin, hi = viewportSize - extent - margin;
    // Viewport too small to avoid all clipping either way -- center is the least-bad choice,
    // rather than Math.min/Math.max silently inverting into a nonsensical value.
    return lo > hi ? viewportSize / 2 : Math.min(Math.max(v, lo), hi);
  }

  // Shared by openContextMenu and openRelateMenu -- both just build a renderItems tree and
  // hand it off here. A fresh full build, unlike a group-button toggle (setExpandedGroup),
  // which never touches this again for the same menu open.
  function showRadialMenu(items, x, y) {
    expandedGroup = null;
    contextMenuEl.innerHTML = renderRadialMenu(items);
    // Clamped against the *worst case* extent (assuming a group ends up expanded), not just
    // the first ring's own -- so expanding a group later never needs the anchor itself to
    // jump to stay on screen.
    const extent = RADIAL_2 + RADIAL_BTN_RADIUS;
    contextMenuEl.style.left = `${clampMenuCoord(x, window.innerWidth, extent, 8)}px`;
    contextMenuEl.style.top = `${clampMenuCoord(y, window.innerHeight, extent, 8)}px`;
    contextMenuEl.hidden = false;
  }

  function openContextMenu(nodeId, x, y) {
    contextMenuItems = [];
    const renderItems = [];
    const push = (item) => { contextMenuItems.push(item); return contextMenuItems.length - 1; };

    // F-029: a right-click on a member of a real (>1) multi-selection offers bulk actions
    // over the whole group instead of the ordinary single-element ones — everything below
    // this (Front/Back, Placement, Disconnect) stays scoped to nodeId alone, since none of
    // those have an obvious/requested group meaning.
    const groupTargets = selectedIds.size > 1 && selectedIds.has(nodeId) ? [...selectedIds] : null;
    if (groupTargets) {
      renderItems.push({ i: push({ label: `Duplicate ${groupTargets.length} Elements`, icon: "copy", action: () => duplicateElements(groupTargets) }) });
      renderItems.push({ i: push({ label: `Delete ${groupTargets.length} Elements`, icon: "trash", danger: true, action: () => deleteElements(groupTargets) }) });
    } else {
      renderItems.push({ i: push({ label: "Duplicate", icon: "copy", action: () => duplicateElement(nodeId) }) });
      renderItems.push({ i: push({ label: "Delete Element", icon: "trash", danger: true, action: () => deleteElement(nodeId) }) });
    }

    // D-144: Front/back offered whenever the element has any sibling at all — not gated on
    // detecting an actual overlap at this exact pixel (found not to be intuitive: an author
    // may want to set stacking order pre-emptively, or the one-point sample simply might not
    // land where two siblings currently overlap even though they do elsewhere). Each item
    // still hides itself once it would be a no-op (already first/last). Grouped under one
    // "Order" submenu (was two flat top-level items) as part of the top-level cap below.
    const node = program.nodesById[nodeId];
    const parent = node?.parentId ? program.nodesById[node.parentId] : null;
    if (parent && parent.children.length > 1) {
      const idx = parent.children.indexOf(node);
      const orderItems = [];
      if (idx < parent.children.length - 1) orderItems.push({ i: push({ label: "Bring to Front", icon: "chevrons-up", action: () => reorderSibling(nodeId, true) }) });
      if (idx > 0) orderItems.push({ i: push({ label: "Send to Back", icon: "chevrons-down", action: () => reorderSibling(nodeId, false) }) });
      renderItems.push({ label: "Order", icon: "layers", group: orderItems });
    }
    // F-035: setting placement/flush directly, instead of hand-typing the exact property
    // names into the source, grouped under one "Placement" submenu naming the actual
    // container in each label rather than leaving it to be inferred. "Outside" deliberately
    // isn't offered here yet — unlike "inside", it has no existing cold-start positioning
    // logic anywhere in this codebase (D-032's connected-point mode only ever activates
    // once an element is *already* resting against a target edge mid-drag), so offering it
    // now would silently do nothing for the common case of an element that isn't already
    // touching anything.
    if (parent) {
      const { container, placement: resolvedPlacement } = resolveContainer(node, parent, program);
      const ownInside = node.props.placement === "inside";
      const ownFlush = node.props.flush === true;
      // A resolved "inside" via an ancestor's childPlacement (F-020) constrains this node
      // regardless of its own props — removing this node's own placement/flush can never
      // actually free it while that ancestor still applies, so "Free" stays disabled
      // rather than silently doing something that looks like nothing happened (reported
      // directly: an element still clamped to its parent right after "Free").
      const ancestorConstrains = !!nearestChildPlacementAncestor(parent, program);
      const hasOwnPlacementProps = node.props.placement !== undefined || node.props.flush !== undefined;

      const placementItems = [
        {
          i: push({ label: `Inside ${displayName(parent)}`, icon: "log-in", action: () => setPlacementInside(nodeId), checked: ownInside, disabled: ownInside }),
        },
        {
          // Reported directly as unclear: "Flush against X" leaned on "flush" as jargon
          // few readers already know in this sense. "Snapped to X's edge" describes the
          // actual effect in plain terms instead of naming the underlying property.
          i: push({
            label: `Snapped to ${displayName(container ?? parent)}'s edge`,
            icon: "magnet",
            action: () => toggleFlush(nodeId),
            checked: ownFlush,
            disabled: resolvedPlacement !== "inside",
          }),
        },
        {
          // Reported directly as unclear: bare "Free" didn't say what it was free *from*.
          // "No placement (moves freely)" names both the state (no placement/flush
          // property left on this element) and its consequence in one line. Has no
          // persisted state of its own to reflect (unlike Inside/Flush, it's never the
          // thing that's "currently set") but stays part of the same checkable radio-style
          // row visually — an explicit `checked: false` (rather than leaving it `undefined`,
          // which would omit the checkmark slot entirely, see the top-level actions above)
          // keeps its label aligned with its two siblings.
          i: push({ label: "No placement (moves freely)", icon: "unlock", action: () => clearPlacement(nodeId), checked: false, disabled: !hasOwnPlacementProps || ancestorConstrains }),
        },
      ];
      renderItems.push({ label: "Placement", icon: "move", group: placementItems });
    }

    // D-144: "Connect to..." (right-click's own way to start the same pick-a-target flow
    // Ctrl/Cmd+drag's relateDrag already offers) and Disconnect share one "Connections"
    // submenu — both are about the same underlying relationship, and folding them together
    // is what keeps the top-level menu at 5 items instead of 6. "Connect to..." is always
    // offered (unlike Disconnect, its own validity isn't known until a target is actually
    // picked — same as the drag gesture today, which doesn't pre-filter valid targets
    // either). Disconnect stays flat rows in this same submenu, not nested a level deeper
    // (a `Connections -> Disconnect -> target` 3rd level would need `click_menu_item`'s own
    // test helper reworked to walk a full ancestor chain instead of just the nearest one) —
    // one row per existing connection, same displayName-per-partner shape Placement's own
    // flat rows already use.
    const connectionItems = [
      { i: push({ label: "Connect to…", icon: "link", action: () => startConnectPick(nodeId) }) },
    ];
    const ownConnections = program.connections.filter((c) => c.from === nodeId || c.to === nodeId);
    for (const c of ownConnections) {
      const partnerId = c.from === nodeId ? c.to : c.from;
      const partner = program.nodesById[partnerId];
      connectionItems.push({ i: push({ label: `Disconnect from ${displayName(partner)}`, icon: "unlink", action: () => removeConnection(c.from, c.to) }) });
    }
    renderItems.push({ label: "Connections", icon: "link", group: connectionItems });

    showRadialMenu(renderItems, x, y);
  }

  function closeContextMenu() {
    contextMenuEl.hidden = true;
    contextMenuItems = [];
    expandedGroup = null;
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
    // F-029: every multi-selected member is raised, others first and the primary
    // (selectedId) last, so it still paints topmost — same per-subtree raise as before,
    // just looped once per member instead of once total.
    const ids = selectedIds.size
      ? [...selectedIds].filter((id) => id !== selectedId).concat(selectedId)
      : [selectedId];
    for (const id of ids) {
      const node = prog.nodesById[id];
      if (!node) continue;
      for (const n of collectAllNodes(node, [])) {
        const el = svgEl.querySelector(`[data-id="${CSS.escape(n.id)}"]`);
        if (!el) continue;
        const next = el.nextElementSibling;
        const annotation = next && next.tagName === "g" && next.classList.contains("annotation") ? next : null;
        svgEl.appendChild(el);
        if (annotation) svgEl.appendChild(annotation);
      }
    }
  }

  // ---------- After every render, reapply the selection class. Full DOM replacement each
  // render means there's never stale overlay state to clean up first. ----------
  function handleRendered(prog, result) {
    program = prog;
    const positions = {};
    core.computePositions(prog.root, null, [0, 0], positions);
    lastPositions = positions;
    lastBboxes = {};
    computeBboxes(prog.root, positions, lastBboxes);

    const svgEl = core.rootEl.querySelector("svg");
    if (!svgEl) return;

    // S-005: the one moment `svgEl`'s own child order is exactly core's "true" declared
    // paint order (shapes then anchors, pre-order — see capturePaintOrderRank's own
    // comment) is right here, before bringToFront (below) re-appends the selected subtree
    // to the end and permanently obscures it. Captured once per render, read by
    // resolvedCandidatesAtPoint below — no cache, nothing to invalidate.
    capturePaintOrderRank(svgEl);

    // core's rerender() just replaced #plan-root's *entire* innerHTML with the fresh SVG,
    // which silently destroys these overlay elements too, not just old shape markup —
    // they're plain children of the same container, appended once at module load, so they
    // need re-adding after every single render, not just the first. appendChild moves an
    // already-existing node rather than erroring, so this is safe to call unconditionally.
    // D-156: fitBtnEl no longer belongs here -- it's #header-fit-btn now, a child of the
    // header, not of core.rootEl -- appending it here would move it out of the header and
    // into the viewer on the very next render (a real bug, caught live: the button visibly
    // jumped from the header into the bottom-right corner of the viewer pane).
    core.rootEl.appendChild(scaleBarEl);
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
      // F-029: every member of a multi-selection gets the same .selected visual (falls
      // back to just selectedId itself when nothing beyond it is selected — identical to
      // the single-element behavior this replaces). dataset.selectedId still names only
      // the primary — code-highlight-module.js's own selection-range reading stays
      // single-element, deliberately not generalized to the group.
      for (const id of selectedIds.size ? selectedIds : [selectedId]) {
        core.rootEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add("selected");
      }
      core.rootEl.dataset.selectedId = selectedId;
      bringToFront(svgEl, prog);
    } else {
      delete core.rootEl.dataset.selectedId;
    }
    // F-016: after bringToFront above, not before — handles must paint on top of the
    // selected shape (and stay hit-testable there), not get reburied by its own reorder.
    renderResizeHandles(svgEl, prog, positions);

    // A stationary click-cycle click never re-fires pointerover (the hovered DOM node gets
    // destroyed and replaced by this same rerender, but the pointer itself never moves), so
    // the stack-hint badge's ">" marker would otherwise stay stuck on whichever line was
    // current when the mouse first entered. Re-render just the marker against the frozen
    // candidate list on every render instead, so it reflects selectedId's latest value.
    if (stackHintCandidates && !stackBadgeEl.hidden) {
      stackBadgeEl.innerHTML = stackHintMarkup(stackHintCandidates);
      // core's rerender() just replaced every shape's DOM node, wiping any .stacked-dim
      // class along with everything else that wasn't reapplied above — without this, a
      // stationary click mid-hover would silently lose the dim effect until the mouse
      // next actually moves.
      for (const id of stackHintCandidates) {
        core.rootEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add("stacked-dim");
      }
    }

  }
  const unregisterOnRendered = core.onRendered(handleRendered);

  // ---------- Click-cycling through stacked elements (F-019, F-021) ----------
  // This app has no z-index — paint order is declaration order (core's own render()/
  // renderShape() walk the tree pre-order, pushing each node's own markup before recursing
  // into its children). id -> index into svgEl's own children at the moment core just
  // rendered them (see handleRendered) — "topmost" is the highest index. Captured fresh
  // every render, before bringToFront (also handleRendered) re-appends the selected
  // subtree to the very end and would otherwise permanently obscure the true order (S-005:
  // this single per-render snapshot replaces both the old stackOrderCache Map, which was
  // never invalidated and went silently stale after a real sibling reorder, and
  // clickCycle's own separate frozen-candidates list — one mechanism instead of two, and
  // simpler than either, since a plain DOM read needs no cache or invalidation at all).
  let paintOrderRank = new Map();
  function capturePaintOrderRank(svgEl) {
    paintOrderRank = new Map();
    let i = 0;
    for (const el of svgEl.children) {
      const id = el.dataset?.id;
      if (id) paintOrderRank.set(id, i++);
    }
  }

  // Every element actually painted at (clientX, clientY), nearest-first — deliberately not
  // reasoning about the tree (parent/child) at all, unlike an ancestor-walking approach
  // would: elementsFromPoint reflects real paint order, so it uniformly covers a container
  // fully hidden by its own children (F-019's own finding) *and* two unrelated siblings
  // that merely happen to overlap (F-021's broader case) with the same one mechanism,
  // rather than needing a second, different one later for the case this doesn't reach.
  // (Membership only — order comes from paintOrderRank via resolvedCandidatesAtPoint
  // below, since this raw elementsFromPoint order is exactly what bringToFront disturbs.)
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
  // Reads module-level `program` directly (S-009) — its one caller just below never passes
  // anything else; unlike resolveContainer/the check* validators (genuinely called with
  // both `program` and a drag-frame's own transient re-parse elsewhere in this file), there
  // was never a real second context here for a `base` parameter to serve.
  function excludeOutsideAttachedPairs(ids) {
    return ids.filter((id) => {
      const node = program.nodesById[id];
      const parent = node.parentId ? program.nodesById[node.parentId] : null;
      const { container, placement } = resolveContainer(node, parent, program);
      return !(placement === "outside" && container && ids.includes(container.id));
    });
  }

  // The badge's list and click-cycling's own stepping both need one **stable** ordering per
  // group of stacked ids, immune to D-086's own bringToFront (raising whatever gets
  // selected, which otherwise changes live elementsFromPoint order after every click) —
  // sourced from paintOrderRank (captured once per render, see handleRendered) rather than
  // elementsFromPoint's own live order, so this is correct on every call with no cache and
  // nothing to invalidate (S-005 — this used to be a Map keyed by id-set, never cleared,
  // silently stale after a real sibling reorder; confirmed live before this fix: right-click
  // "Send to Back" then re-hovering the same point kept showing the pre-reorder order).
  function resolvedCandidatesAtPoint(clientX, clientY) {
    const filtered = excludeOutsideAttachedPairs(candidateIdsAtPoint(clientX, clientY));
    return [...filtered].sort((a, b) => (paintOrderRank.get(b) ?? -1) - (paintOrderRank.get(a) ?? -1));
  }

  // F-021: run continuously from handlePointerMove (not just once on element-entry) — a
  // single sample at hover-*entry* missed a real case, reported directly: entering a large
  // element through its own non-overlapping region shows nothing, correctly, but then moving
  // the mouse — still inside that same element, so pointerover never re-fires — into the
  // part that actually does overlap something else never re-checked, leaving the hint off
  // for the rest of that hover even once the cursor is genuinely over a stacked point.
  function updateStackedHint(clientX, clientY, withinViewer) {
    const nonRootTrigger = withinViewer ? candidateIdsAtPoint(clientX, clientY).filter((id) => id !== program.root.id) : [];
    if (nonRootTrigger.length > 1) {
      // The badge's own list shows every reachable candidate, root included — unlike the
      // trigger check just above, which stays root-excluded (so hovering an ordinary
      // element still doesn't fire the hint on every element in the plan). Excluding root
      // from the list too would let click-cycling (which never excludes it) land on
      // something this list doesn't even mention, leaving the ">" marker with nothing to
      // point at — a real bug, found by testing selecting the root via a full cycle.
      const resolved = resolvedCandidatesAtPoint(clientX, clientY);
      // Every element in the group dims together, not just whichever one is literally under
      // the cursor — requested directly: seeing the whole layering at once (each one
      // partially see-through) is more useful than one layer fading at a time. Only
      // actually touched when the *set* changes, not every single move tick, since the
      // group can otherwise stay the same for many consecutive mousemove events in a row.
      const changed = !stackHintCandidates || stackHintCandidates.length !== resolved.length
        || !stackHintCandidates.every((id) => resolved.includes(id));
      if (changed) {
        if (stackHintCandidates) {
          for (const id of stackHintCandidates) {
            core.rootEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.remove("stacked-dim");
          }
        }
        for (const id of resolved) {
          core.rootEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add("stacked-dim");
        }
        stackHintCandidates = resolved;
      }
      stackBadgeEl.innerHTML = stackHintMarkup(resolved);
      stackBadgeEl.style.left = `${clientX}px`;
      stackBadgeEl.style.top = `${clientY}px`;
      stackBadgeEl.hidden = false;
    } else if (stackHintCandidates) {
      for (const id of stackHintCandidates) {
        core.rootEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.remove("stacked-dim");
      }
      stackHintCandidates = null;
      stackBadgeEl.hidden = true;
    }
  }

  // ---------- Event wiring — named functions so registerModuleCleanup can remove exactly
  // what was added. ----------
  function handlePointerDown(e) {
    if (e.button !== 0) return; // right-click only opens the context menu
    // Any plain HTML control appended over the viewer as a child of core.rootEl (the scale
    // bar; the Fit button used to live here too before D-156 moved it into the header) has
    // its own pointerdown bubble up to this same listener — a real bug, not a hypothetical,
    // found back when Fit still lived here by actually clicking it after panning and seeing
    // nothing happen: preventDefault() below suppressed the browser's own click-event
    // synthesis for the button before its own handler ever got a chance to run. Bail out
    // before touching it at all, so a plain button always gets to handle its own click
    // natively, the same as it would anywhere else on the page.
    if (e.target.closest("button")) return;
    // Without this, a mousedown-and-move over the SVG is indistinguishable from starting a
    // native text selection to the browser — every drag/pan gesture would leave a stray
    // selection highlight (and, on some browsers, try to start a native element drag) on
    // top of whatever this module does with the gesture itself.
    e.preventDefault();
    // That same preventDefault() also blocks the browser's own default focus-shift on
    // mousedown (normally any click blurs whatever text control had focus) — a real bug
    // found by testing F-043: clicking a shape right after typing in the code textarea
    // left the textarea focused, so the arrow-key nudge/resize shortcut kept moving its
    // caret instead of nudging the newly-selected element.
    if (isTextEditableFocus()) document.activeElement.blur();
    if (!program) return;

    // D-144: a click while picking a "Connect to..." target is entirely reinterpreted --
    // never falls through to ordinary shape-click/drag handling below, same as every
    // other gesture-in-progress branch in this function. Resolved on pointerUP, not here
    // (see handlePointerUp) -- mirroring relateDrag's own pointerup-resolution exactly:
    // opening the menu already here, mid-pointerdown, would still be bubbling up to
    // handleWindowPointerDown's own "click outside the menu closes it" listener on the
    // very same event, immediately closing the menu it just opened (a real bug, found live
    // by testing the full flow, not just reading the code).
    if (connectPick) return;

    // F-036: a second finger landing always wins over whatever the first finger alone was
    // starting — cancels any pending single-pointer gesture cleanly and starts a pinch
    // instead, rather than letting the two fight over the same source text.
    if (e.pointerType === "touch") {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.size === 2) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        if (drag) {
          drag.unregisterReparentHighlight?.();
          if (drag.reparentCandidateId) core.rootEl.querySelector(`[data-id="${CSS.escape(drag.reparentCandidateId)}"]`)?.classList.remove("reparent-candidate");
          core.sourceEl.value = drag.baseText; drag = null; core.rerender({ preserveViewBox: true });
        }
        if (resizeDrag) { core.sourceEl.value = resizeDrag.baseText; resizeDrag = null; core.rerender({ preserveViewBox: true }); }
        if (vertexDrag) { core.sourceEl.value = vertexDrag.baseText; vertexDrag = null; core.rerender({ preserveViewBox: true }); }
        if (scaleDrag) { core.sourceEl.value = scaleDrag.baseText; scaleDrag = null; core.rerender({ preserveViewBox: true }); }
        if (marqueeDrag) {
          marqueeDrag.rectEl?.remove();
          for (const id of marqueeDrag.candidateIds) core.rootEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.remove("marquee-candidate");
          marqueeDrag = null;
        }
        canvasDrag = null;
        core.rootEl.classList.remove("dragging");
        pinch = { startDist: pinchDistance(), startMid: pinchMidpoint(), startView: viewState || lastCoreFit };
        return;
      }
      if (activeTouches.size > 2) return; // a third finger: stay in the existing 2-finger pinch
    }

    // F-016: a resize handle always wins over the shape/canvas branching below — it's drawn
    // on top specifically so it stays hit-testable even where it visually overlaps the
    // selected shape's own edge.
    const handle = e.target.closest(".resize-handle");
    if (handle) {
      const nodeId = handle.dataset.nodeId;
      const corner = handle.dataset.corner;
      const node = program.nodesById[nodeId];
      const abs = lastPositions[nodeId];
      if (node && abs) {
        if (corner === "radius") {
          const r0 = node.props.radius;
          if (!core.isEditable(r0)) {
            core.dragmsgEl.textContent = `'${nodeId}': radius is an expression, can't resize by dragging — edit it directly`;
          } else {
            resizeDrag = { id: nodeId, kind: "radius", startAbs: abs, baseText: core.sourceEl.value };
            core.rootEl.classList.add("dragging");
          }
        } else if (corner === "vertex") {
          // D-139: a polygon/polyline's own per-vertex handle. A corner-reference point
          // (pt.cornerRef) has no state of its own here at all — it's really just the id of
          // a sibling bare-point node that's already independently draggable today by
          // clicking its own small anchor dot directly, so this starts the exact same
          // ordinary `drag` that click already would (same self-intersection/connected-node/
          // grid-snap handling, no new code). Only a literal [x,y] point needs the new
          // vertexDrag gesture below.
          const pointIndex = Number(handle.dataset.pointIndex);
          const pt = node.props.points?.[pointIndex];
          if (pt && typeof pt === "function" && pt.cornerRef) {
            const cornerNode = program.nodesById[pt.cornerRef];
            const cornerAbs = lastPositions[pt.cornerRef];
            if (cornerNode && cornerAbs && cornerNode.props.position) {
              drag = { id: cornerNode.id, groupIds: [], baseText: core.sourceEl.value,
                clientX: e.clientX, clientY: e.clientY, moved: false, singleOnly: e.shiftKey, startAbs: cornerAbs };
              core.rootEl.classList.add("dragging");
            }
          } else if (Array.isArray(pt) && core.isEditable(pt[0]) && core.isEditable(pt[1])) {
            vertexDrag = { id: nodeId, pointIndex, baseText: core.sourceEl.value,
              startAbs: core.resolvePointAbs(pt, abs, lastPositions) };
            core.rootEl.classList.add("dragging");
          } else {
            core.dragmsgEl.textContent = `'${nodeId}': this point is an expression, can't drag it directly — edit it in the editor`;
          }
        } else if (corner.startsWith("scale-")) {
          // D-143: proportional scale from the shape's own bounding-box corner, generalizing
          // resizeDrag's own rect-corner algorithm from one point to N. Reparsed fresh every
          // move (applyScaleDrag) — only the pivot and the dragged corner's own starting
          // position need capturing here, the same "just the fixed gesture-start facts"
          // reasoning resizeDrag/vertexDrag already establish.
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const pt of node.props.points ?? []) {
            let p;
            try { p = core.resolvePointAbs(pt, abs, lastPositions); } catch (e) { continue; }
            minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
          }
          const cornerPos = { "scale-tl": [minX, minY], "scale-tr": [maxX, minY], "scale-bl": [minX, maxY], "scale-br": [maxX, maxY] };
          const pivotPos = { "scale-tl": [maxX, maxY], "scale-tr": [minX, maxY], "scale-bl": [maxX, minY], "scale-br": [minX, minY] };
          scaleDrag = { id: nodeId, corner, pivotAbs: pivotPos[corner], originalCornerAbs: cornerPos[corner], baseText: core.sourceEl.value };
          core.rootEl.classList.add("dragging");
        } else {
          const [w0, h0] = node.props.size;
          const [x0, y0] = node.props.position ?? [];
          const editable = node.props.position && core.isEditable(w0) && core.isEditable(h0)
            && core.isEditable(x0) && core.isEditable(y0);
          if (!editable) {
            core.dragmsgEl.textContent = `'${nodeId}': position/size includes an expression, can't resize by dragging — edit it directly`;
          } else {
            const [ox, oy] = abs;
            const w = core.numOf(w0), h = core.numOf(h0);
            // Each handle's anchor is its own diagonally-opposite corner — fixed for the
            // whole gesture, computed once here from the rect's state right now. Anchors are
            // always in the rect's own un-rotated local frame (exactly what position/size
            // already store) -- rotation is a purely visual, render-time transform, so this
            // math is unaffected by it. D-141: pivot/rotationDeg captured here so
            // applyResizeDrag can rotate the live cursor *back* into this same local frame.
            const anchors = { tl: [ox + w, oy + h], tr: [ox, oy + h], bl: [ox + w, oy], br: [ox, oy] };
            const rotationDeg = core.numOf(node.props.rotation ?? 0);
            resizeDrag = { id: nodeId, kind: "corner", anchorAbs: anchors[corner], startAbs: [ox, oy],
              rotationDeg, pivot: [ox + w / 2, oy + h / 2], baseText: core.sourceEl.value };
            core.rootEl.classList.add("dragging");
          }
        }
      }
      return;
    }

    const el = e.target.closest("[data-id]");
    if (!el) {
      // F-047: Alt+drag on empty canvas starts a marquee selection instead of a pan --
      // the same modifier Alt+click already uses to add one element at a time, now doing
      // the same thing over a whole region at once. Bboxes are snapshotted once, right
      // here, via the real rendered geometry (Element.getBBox(), already in viewBox units,
      // works identically for every shape kind unlike this file's own computeBboxes, which
      // only ever covers rects and bare points) -- nothing moves during this gesture, so
      // there's no need to re-query on every pointermove.
      if (e.altKey) {
        const bboxes = new Map();
        for (const shapeEl of core.rootEl.querySelectorAll("[data-id]")) {
          try { bboxes.set(shapeEl.dataset.id, shapeEl.getBBox()); } catch (err) { /* detached/zero-size — skip */ }
        }
        const svgEl = core.rootEl.querySelector("svg");
        let rectEl = null;
        if (svgEl) {
          svgEl.insertAdjacentHTML("beforeend",
            `<rect class="marquee-rect" x="0" y="0" width="0" height="0" fill="rgba(124,58,237,0.08)" stroke="#7c3aed" stroke-width="1" stroke-dasharray="4 3" pointer-events="none" />`);
          rectEl = svgEl.lastElementChild;
        }
        marqueeDrag = { startClientX: e.clientX, startClientY: e.clientY, moved: false, bboxes, rectEl, candidateIds: new Set() };
        return;
      }
      // Empty canvas: could be a plain click (deselect) or the start of a pan — decided by
      // whether the pointer actually moves before release, see handlePointerMove/Up.
      canvasDrag = { startClientX: e.clientX, startClientY: e.clientY, moved: false,
        startView: viewState || lastCoreFit };
      return;
    }

    // Ctrl/Cmd+drag on an element starts the relate gesture instead of an ordinary
    // drag/click-cycle — the source never moves for its duration (see handlePointerMove),
    // so none of the click-cycling machinery below applies to it at all.
    if (e.ctrlKey || e.metaKey) {
      // A live line from the source's own center to wherever the cursor currently is —
      // requested directly, "always shown" for the whole gesture, not just once a valid
      // candidate is found. x2/y2 are updated every frame in handlePointerMove; x1/y1 never
      // move, matching the source itself never visually moving during this gesture.
      let lineEl = null;
      const sourceNode = program.nodesById[el.dataset.id];
      const center = sourceNode && nodeCenter(sourceNode, lastPositions);
      const svgEl = core.rootEl.querySelector("svg");
      if (center && svgEl) {
        const vb = clientToViewBoxPoint(e.clientX, e.clientY) ?? [center[0] * core.M, center[1] * core.M];
        svgEl.insertAdjacentHTML("beforeend", `<line class="relate-drag-line" x1="${center[0] * core.M}" y1="${center[1] * core.M}" x2="${vb[0]}" y2="${vb[1]}" stroke="#2a8a3e" stroke-width="1.5" stroke-dasharray="4 3" pointer-events="none" />`);
        lineEl = svgEl.lastElementChild;
      }
      relateDrag = { fromId: el.dataset.id, candidateId: null, lineEl };
      core.rootEl.classList.add("dragging");
      return;
    }

    // F-029: Alt+click toggles this element's own membership in the multi-selection and
    // takes over the whole gesture (no drag started) — mirrors the Ctrl/Cmd branch above.
    // A plain click (no modifier) always collapses back to single-selecting whatever it
    // hits (see handlePointerUp), so this is the only way to grow or shrink a group.
    if (e.altKey) {
      const id = el.dataset.id;
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
        if (selectedId === id) selectedId = selectedIds.values().next().value ?? null;
      } else {
        selectedIds.add(id);
        selectedId = id;
      }
      core.rerender({ preserveViewBox: true });
      return;
    }

    // Which element a click actually targets: normally whatever's topmost at this pixel
    // (el.dataset.id, same as before) — unless this click lands within tolerance of the
    // *previous* plain click's own point, in which case it steps to whatever was one layer
    // further down that same stack last time, wrapping back to the top once exhausted.
    // Recomputed fresh on every click (S-005) — resolvedCandidatesAtPoint is now sourced
    // from paintOrderRank, immune to bringToFront's own DOM reordering, so there's no more
    // need to freeze a snapshot at cycle-start the way this used to.
    let chosenId = el.dataset.id;
    const cycleCandidates = resolvedCandidatesAtPoint(e.clientX, e.clientY);
    if (clickCycle && Math.hypot(e.clientX - clickCycle.x, e.clientY - clickCycle.y) <= CLICK_CYCLE_TOLERANCE_PX) {
      const idx = cycleCandidates.indexOf(clickCycle.lastId);
      if (idx !== -1 && cycleCandidates.length > 1) chosenId = cycleCandidates[(idx + 1) % cycleCandidates.length];
    }

    const node = program.nodesById[chosenId];
    if (!node.props.position && !node.props.points) {
      core.dragmsgEl.textContent = `${node.id}: has no explicit position/points in source, nothing to drag`;
      return;
    }
    // F-031: the node's own absolute anchor at gesture-start, captured once — every kind
    // of dragged node (position-based, points-based polygon/polyline, or a bare point)
    // has one via lastPositions, and snapping *that* landing on the grid (then applying
    // the resulting uniform delta to whatever's actually being edited) stays coherent
    // regardless of shape, the same way connected-group propagation already applies one
    // shared delta to more than one thing.
    // F-029: dragging from inside an existing multi-selection moves the whole group by the
    // same delta — groupIds is empty (zero behavior change) for every ordinary single/
    // connected-only drag, including a plain drag that starts on an element outside the
    // current multi-selection.
    const groupIds = selectedIds.size > 1 && selectedIds.has(node.id)
      ? [...selectedIds].filter((id) => id !== node.id) : [];
    drag = { id: node.id, groupIds, baseText: core.sourceEl.value, clientX: e.clientX, clientY: e.clientY, moved: false, singleOnly: e.shiftKey, startAbs: lastPositions[node.id], reparentCandidateId: null };
    // D-150 (F-012): applyDrag's own core.rerender() is async (it awaits module loading
    // before ever replacing rootEl's own innerHTML), so a plain classList.add() called
    // synchronously right after applyDrag() lands on a DOM node that gets thrown away the
    // moment that pending render actually completes -- a real bug, found live (the
    // highlight computed correctly but was never visible). core.onRendered fires *after*
    // rootEl.innerHTML is actually replaced, so applying the highlight there -- reading
    // drag.reparentCandidateId fresh each time, not captured once -- is the one point
    // guaranteed to survive. Registered once per gesture (not per frame), unregistered in
    // handlePointerUp/the F-036 cancellation path below.
    drag.unregisterReparentHighlight = core.onRendered(() => {
      if (drag && drag.reparentCandidateId) {
        core.rootEl.querySelector(`[data-id="${CSS.escape(drag.reparentCandidateId)}"]`)?.classList.add("reparent-candidate");
      }
    });
    core.rootEl.classList.add("dragging");

    // F-036/D-146: touch's own equivalent of the right-click context menu — contextmenu via
    // long-press only fires inconsistently across touch browsers. A hold past LONG_PRESS_MS
    // with no real movement (drag.moved reused as the cancellation signal, see
    // handlePointerMove) cancels the pending drag and dispatches a real "contextmenu" event
    // on the held element instead of calling openContextMenu directly -- this now genuinely
    // *is* a right-click (D-146's own request), not a hand-rolled subset of one: it goes
    // through handleContextMenu's exact same logic (selection included), so a future change
    // there never has to be separately re-applied here. Scoped to a shape only, matching
    // handleContextMenu's own existing scope — no canvas-level long-press menu.
    if (e.pointerType === "touch") {
      const heldId = chosenId;
      const cx = e.clientX, cy = e.clientY;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (!drag || drag.moved || drag.id !== heldId) return; // moved away, released, or superseded by a pinch
        core.sourceEl.value = drag.baseText;
        drag = null;
        core.rootEl.classList.remove("dragging");
        // Re-resolved fresh by id, not the `el` captured at pointerdown time -- a rerender
        // in between (e.g. from something else entirely) would have replaced that DOM node,
        // and dispatching on a detached element would never bubble up to handleContextMenu
        // at all.
        const heldEl = core.rootEl.querySelector(`[data-id="${CSS.escape(heldId)}"]`);
        if (heldEl) heldEl.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
      }, LONG_PRESS_MS);
    }
  }

  function handleContextMenu(e) {
    // D-144: right-clicking anything while picking a "Connect to..." target just cancels
    // the pick -- it never also opens a new context menu on that same right-click.
    if (connectPick) {
      e.preventDefault();
      cancelConnectPick();
      return;
    }
    const el = e.target.closest("[data-id]");
    if (!el || !program) return;
    e.preventDefault();
    // Right-clicking a point can only ever DOM-hit-test whatever's visually topmost there —
    // there's no right-click equivalent of D-077's click-cycling. Without this, a fully
    // covered element (already reached and selected via a left-click cycle) could never be
    // right-clicked directly at all: only the element currently on top of it, needing an
    // indirect "select the wrong one and send IT to back" workaround instead of directly
    // acting on the one actually intended. Prefers the current selection whenever it's
    // still genuinely part of the stack at this exact point — a stale selection from
    // somewhere else in the plan is never substituted in for an unrelated right-click.
    // D-146: a real bug, found live -- resolvedCandidatesAtPoint includes every element
    // whose shape covers this point, and a plain nested child's own *parent* almost always
    // does too (its shape typically underlies the child's), so "stacked" was true for
    // nearly every ordinary click, not just genuine sibling overlap -- silently skipping
    // the auto-select branch below for almost any right-click. Filtered to exclude the
    // topmost hit's own ancestors: an ancestor coincidentally underlying this point was
    // never what "stacked, needs disambiguating" meant here (that's what D-077's own
    // click-cycling is for on the left-click side); a genuine overlapping *sibling* still
    // counts, unaffected.
    const candidates = resolvedCandidatesAtPoint(e.clientX, e.clientY)
      .filter((id) => id === el.dataset.id || !isAncestorOf(id, el.dataset.id, program));
    const stacked = candidates.length > 1;
    const targetId = stacked && selectedId && candidates.includes(selectedId)
      ? selectedId : el.dataset.id;
    // Outside a stacked point, right-clicking a different element also selects it — the
    // menu then visibly acts on whatever the selection indicator itself is now
    // highlighting, instead of leaving it pointed at something else entirely. Left off
    // inside a stacked area on purpose: with no right-click equivalent of click-cycling,
    // forcing the topmost candidate into the selection there would make it impossible to
    // right-click a still-covered element without first fighting the stack back into
    // place via a left-click.
    // F-029: right-clicking a member of an existing multi-selection keeps the whole group
    // intact (so the menu can offer the bulk actions below) — right-clicking anything else
    // collapses to single-selecting just that element, same as a plain left-click would.
    const inGroup = selectedIds.size > 1 && selectedIds.has(targetId);
    if (!stacked && !inGroup && (targetId !== selectedId || selectedIds.size > 1)) {
      selectedId = targetId;
      selectedIds = new Set([targetId]);
      core.rerender({ preserveViewBox: true });
    }
    openContextMenu(targetId, e.clientX, e.clientY);
  }

  // D-146: flips .expanded on only the one button+ring pair involved (closing whichever
  // group was previously open, if any) -- never touches contextMenuEl's own innerHTML, so
  // no button anywhere in the menu (first ring included) is ever recreated by a toggle.
  // Replaced D-145's own "re-render the whole menu with a new expandedGroup" approach,
  // which was simpler but had a real, reported side effect: since every button is a fresh
  // DOM node after an innerHTML replace, the untouched first ring's own radial-pop opening
  // animation silently replayed on every single group click, not just the true first open.
  function setExpandedGroup(g) {
    if (expandedGroup !== null) {
      contextMenuEl.querySelector(`.radial-btn--group[data-group-index="${expandedGroup}"]`)?.classList.remove("expanded");
      contextMenuEl.querySelector(`.radial-ring[data-group-index="${expandedGroup}"]`)?.classList.remove("expanded");
    }
    const next = expandedGroup === g ? null : g;
    if (next !== null) {
      contextMenuEl.querySelector(`.radial-btn--group[data-group-index="${next}"]`)?.classList.add("expanded");
      contextMenuEl.querySelector(`.radial-ring[data-group-index="${next}"]`)?.classList.add("expanded");
    }
    expandedGroup = next;
  }

  function handleMenuClick(e) {
    // D-145: a group button (e.g. "Placement") isn't an action itself -- it toggles its own
    // ring open/closed instead of resolving through contextMenuItems like every data-i
    // button below.
    const groupBtn = e.target.closest("button.radial-btn--group");
    if (groupBtn) {
      setExpandedGroup(Number(groupBtn.dataset.groupIndex));
      return;
    }
    const btn = e.target.closest("button[data-i]");
    if (!btn) return;
    const item = contextMenuItems[Number(btn.dataset.i)];
    if (item?.disabled) return;
    closeContextMenu();
    item?.action();
  }

  function handleWindowPointerDown(e) {
    if (!contextMenuEl.hidden && !contextMenuEl.contains(e.target)) closeContextMenu();
  }

  // ---------- Keyboard nudge/resize for the selected element (F-043) ----------
  // `settings { keyboardStep: 0.1 }` (meters) — one shared value for both move and resize,
  // per the request's own wording ("one definable jump size"). Deliberately not tied to
  // grid.size (grid-module.js): the grid is still purely visual (F-031, grid-snapped
  // dragging, is unbuilt), so coupling this to it would make keyboard nudging silently
  // change behavior depending on whether a plan happens to declare a grid.
  function keyboardStepMeters() {
    return core.numOf(program?.settings?.keyboardStep ?? 0.1);
  }

  const RESIZE_MIN = 0.01; // a resize can never shrink a dimension to zero/negative

  // F-016: visible, draggable resize handles for the selected rect/circle — real SVG
  // elements in plan/meters coordinates (× core.M), not fixed-position HTML overlays, so
  // panning/zooming keeps them correctly anchored for free the same way it already does for
  // every shape, with no separate screen-space recomputation to keep in sync. Fixed size in
  // viewBox units, not zoom-compensated — a deliberate v1 simplification. data-node-id, not
  // data-id, so these never collide with the app-wide [data-id] shape-selector convention
  // (the exact bug D-112 hit once already). No manual removal of last render's handles
  // needed: core.rerender() already replaces #plan-root's whole innerHTML every time.
  const HANDLE_HALF = 7; // viewBox units — a touch-usable ~14x14 square/circle at 1x zoom
  // D-136: reported directly -- with several elements selected, the resize handles (below)
  // were more visually obvious than the actual multi-selection, and since they only ever
  // mark the one primary element (resize itself stays single-element only, F-029/D-124),
  // that read as "just this one is selected." Handles now only render for a genuine
  // single-element selection; the .selected filter (injectStyles, D-137) is what marks a
  // multi-selection instead, one entry per member.
  function renderResizeHandles(svgEl, prog, positions) {
    if (!selectedId || selectedIds.size > 1) return;
    if (isGestureActive() && !resizeDrag && !vertexDrag && !scaleDrag) return; // hidden mid-drag/pinch/relate, shown mid-resize/mid-vertex/mid-scale-drag
    const node = prog.nodesById[selectedId];
    const abs = node && positions[selectedId];
    if (!node || !abs) return;
    // core's own renderShape falls back to a bare anchor point for a rect/circle with no
    // declared style at all (a real, deliberate rule, not this module's own) — a styleless
    // "rect" is never actually drawn as one, so it must not get resize handles either;
    // found live, not assumed, by testing a rect with no style and seeing handles float
    // around geometry nothing on screen actually corresponds to.
    const hasStyle = node.props.style !== undefined;
    if (node.props.shape === "rect" && node.props.size && node.props.position && hasStyle) {
      const [ox, oy] = abs;
      const w = core.numOf(node.props.size[0]), h = core.numOf(node.props.size[1]);
      // An expression-valued size/position resolves to a function, not a number, here (the
      // program tree is expanded but not yet rendered) — Number.isFinite rejects that
      // uniformly rather than drawing 3 of 4 corners at NaN coordinates. Grabbing one of
      // these is separately guarded against too (handlePointerDown's own isEditable check),
      // but there's nothing coherent to even show without valid geometry in the first place.
      if (!Number.isFinite(w) || !Number.isFinite(h)) return;
      // D-141: each corner rotated around the rect's own center before placing its handle —
      // the handle itself stays a plain axis-aligned square (only its *position* rotates,
      // not its own shape), matching the circle radius handle's own already-rotation-
      // agnostic look.
      const rotationDeg = core.numOf(node.props.rotation ?? 0);
      const pivot = [ox + w / 2, oy + h / 2];
      const corners = [
        ["tl", ox, oy], ["tr", ox + w, oy], ["bl", ox, oy + h], ["br", ox + w, oy + h],
      ];
      for (const [corner, cx0, cy0] of corners) {
        const [x, y] = rotatePoint(cx0, cy0, pivot[0], pivot[1], rotationDeg);
        svgEl.insertAdjacentHTML("beforeend",
          `<rect class="resize-handle" data-node-id="${selectedId}" data-corner="${corner}" ` +
          `x="${x * core.M - HANDLE_HALF}" y="${y * core.M - HANDLE_HALF}" width="${HANDLE_HALF * 2}" height="${HANDLE_HALF * 2}" />`);
      }
    } else if (node.props.shape === "circle" && node.props.radius !== undefined && hasStyle) {
      const [cx, cy] = abs;
      const r = core.numOf(node.props.radius);
      if (!Number.isFinite(r)) return;
      svgEl.insertAdjacentHTML("beforeend",
        `<circle class="resize-handle" data-node-id="${selectedId}" data-corner="radius" ` +
        `cx="${(cx + r) * core.M}" cy="${cy * core.M}" r="${HANDLE_HALF}" />`);
    } else if ((node.props.shape === "polygon" || node.props.shape === "polyline") && node.props.points && hasStyle) {
      // D-139: one handle per vertex, corner-references included — a mixed shape (some
      // literal points, some corner-refs, the exact pattern the shipped `apartment` example
      // uses throughout) gets one consistent row of handles, not some vertices handled and
      // others silently not. What a given handle actually *does* when dragged differs (see
      // handlePointerDown's own "vertex" case) but its rendering here is uniform.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      node.props.points.forEach((pt, i) => {
        let p;
        try { p = core.resolvePointAbs(pt, abs, positions); } catch (e) { return; } // unresolved corner ref — skip
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        svgEl.insertAdjacentHTML("beforeend",
          `<circle class="resize-handle" data-node-id="${selectedId}" data-corner="vertex" data-point-index="${i}" ` +
          `cx="${p[0] * core.M}" cy="${p[1] * core.M}" r="${HANDLE_HALF}" />`);
      });

      // D-143: proportional scale, from the shape's own bounding box — offered only when
      // every corner-ref point this shape uses is exclusive to it (canScale). A shared
      // corner moving would silently distort whatever else references it too — D-074's own
      // unresolved concern, deliberately left unsolved rather than guessed at here; a shape
      // with any shared corner just gets no scale handles at all, same as a degenerate
      // (zero-width or zero-height) bounding box would produce a divide-by-zero below.
      const cornerUsers = {};
      core.computeCornerUsers(prog.root, cornerUsers);
      if (maxX > minX && maxY > minY && canScale(node, cornerUsers)) {
        // For a simple box-ish polygon (the common case — every point sits exactly at one
        // of the bbox's own corners), a scale handle placed at the literal bbox corner
        // would land right on top of D-139's own vertex handle there — same screen spot,
        // different behavior, genuinely ambiguous to click. Offset outward along the
        // corner's own diagonal (in *screen* placement only — the actual scale math in
        // handlePointerDown/applyScaleDrag always uses the true, un-offset bbox corner) by
        // just over one handle's own width, so the two stay visually and hit-test distinct
        // wherever they'd otherwise coincide, and sit unobtrusively close when they don't.
        // Found live: an existing D-139 test regressed on exactly this shape (a 4-point
        // quad whose own corners are its bbox corners) before this fix.
        const OFFSET = HANDLE_HALF * 6 / Math.SQRT2;
        const scaleCorners = [
          ["scale-tl", minX, minY, -OFFSET, -OFFSET], ["scale-tr", maxX, minY, OFFSET, -OFFSET],
          ["scale-bl", minX, maxY, -OFFSET, OFFSET], ["scale-br", maxX, maxY, OFFSET, OFFSET],
        ];
        for (const [corner, x0, y0, dx, dy] of scaleCorners) {
          const x = x0 * core.M + dx, y = y0 * core.M + dy;
          svgEl.insertAdjacentHTML("beforeend",
            `<rect class="resize-handle" data-node-id="${selectedId}" data-corner="${corner}" ` +
            `x="${x - HANDLE_HALF}" y="${y - HANDLE_HALF}" width="${HANDLE_HALF * 2}" height="${HANDLE_HALF * 2}" />`);
        }
      }
    }
  }

  // A keyboard nudge is exactly "a drag of a fixed, small magnitude" — applyDrag only ever
  // reads dragState.id/baseText/singleOnly (its own body never touches clientX/clientY/
  // moved), so a synthetic one-shot dragState reuses its entire pipeline —
  // connected-node propagation, collision/containment clamping, the outside-slide
  // mechanic, composite backward-solve — for free, rather than re-deriving any of it here.
  function nudgeSelected(dx, dy) {
    applyDrag({ id: selectedId, baseText: core.sourceEl.value, singleOnly: false }, dx, dy);
  }

  // New, unlike nudgeSelected above — nothing else in this codebase resizes anything.
  // Deliberately scoped to rect/circle only, the same split F-016's own "Scale" question
  // already drew: a corner-reference-built polygon/polyline would need every referenced
  // corner moved outward from a pivot, "a materially different mechanism," not attempted
  // here. dw/dh: the signed step for the width-ish/height-ish direction — exactly one is
  // ever nonzero per keypress (one arrow key at a time).
  function resizeSelected(dw, dh) {
    withParsedSource((text, base) => {
      const node = base.nodesById[selectedId];
      if (!node) return;
      const shape = node.props.shape;
      if (shape === "rect" && node.props.size) {
        const [w0, h0] = node.props.size;
        const edits = [];
        if (dw !== 0) {
          if (!core.isEditable(w0)) { core.dragmsgEl.textContent = `'${selectedId}': width is an expression, can't resize via keyboard — edit it directly`; return; }
          edits.push({ start: w0.start, end: w0.end, text: core.formatNumber(Math.max(RESIZE_MIN, w0.value + dw), w0.unit) });
        }
        if (dh !== 0) {
          if (!core.isEditable(h0)) { core.dragmsgEl.textContent = `'${selectedId}': height is an expression, can't resize via keyboard — edit it directly`; return; }
          edits.push({ start: h0.start, end: h0.end, text: core.formatNumber(Math.max(RESIZE_MIN, h0.value + dh), h0.unit) });
        }
        if (!edits.length) return;
        core.sourceEl.value = applyEditsDescending(text, edits);
        core.dragmsgEl.textContent = "";
        core.rerender({ preserveViewBox: true });
        return;
      }
      if (shape === "circle" && node.props.radius !== undefined) {
        const r0 = node.props.radius;
        if (!core.isEditable(r0)) { core.dragmsgEl.textContent = `'${selectedId}': radius is an expression, can't resize via keyboard — edit it directly`; return; }
        // No independent width/height to pick between — any of the four arrow keys
        // drives the one radius; whichever of dw/dh is nonzero is this keypress's delta.
        const newR = Math.max(RESIZE_MIN, r0.value + (dw || dh));
        core.sourceEl.value = applyEditsDescending(text, [{ start: r0.start, end: r0.end, text: core.formatNumber(newR, r0.unit) }]);
        core.dragmsgEl.textContent = "";
        core.rerender({ preserveViewBox: true });
        return;
      }
      // Shapeless (bare point) or polygon/polyline — no-op, but a clear message rather
      // than a silent nothing, the same transparency every other unsupported combination
      // in this codebase already gets.
      core.dragmsgEl.textContent = shape
        ? `'${selectedId}': resize isn't supported for shape "${shape}" yet`
        : `'${selectedId}': has no size to resize`;
    });
  }

  const ARROW_KEY_DELTAS = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };

  // Never true for the SVG viewer itself (nothing in it is a text control) — this exists
  // specifically so arrow keys keep their existing meaning (move the caret) inside the code
  // textarea and any modal's text fields (rename, sign-in/register), rather than this
  // shortcut hijacking them.
  function isTextEditableFocus() {
    const el = document.activeElement;
    return !!el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      if (connectPick) { cancelConnectPick(); return; }
      if (!contextMenuEl.hidden) { closeContextMenu(); return; }
      // F-029: with the menu already closed, Escape clears a multi-selection instead —
      // standard "deselect the group" convention, left off collapsing to the single
      // primary element since a plain click already covers that.
      if (selectedIds.size > 1) { selectedIds = new Set(); selectedId = null; core.rerender({ preserveViewBox: true }); }
      return;
    }
    const arrow = ARROW_KEY_DELTAS[e.key];
    if (!arrow || !selectedId || !program || isTextEditableFocus()) return;
    // Bail during any other concurrent gesture/menu, the same way other handlers already
    // do — a keyboard nudge mid-drag or with the relate/context menu open would fight
    // whatever that other interaction is already doing.
    if (isGestureActive() || !contextMenuEl.hidden) return;
    e.preventDefault();
    const step = keyboardStepMeters();
    const [ux, uy] = arrow;
    if (e.shiftKey) resizeSelected(ux * step, uy * step);
    else nudgeSelected(ux * step, uy * step);
  }

  // Committing on keyup (once per hold), not on every keydown: held-key OS auto-repeat can
  // fire many keydowns per second, and committing each one would flood undo history — the
  // opposite of how a mouse-drag already works (commitUndoStep fires once, on release, not
  // per pointermove frame). A quick tap-and-release still commits immediately; holding the
  // key coalesces the whole hold into one undo step. commitUndoStep is already a no-op if
  // nothing changed, so a stray arrow-key release elsewhere (e.g. moving the caret while
  // typing) costs nothing even without the isTextEditableFocus guard below — kept anyway
  // to make the scoping obvious rather than relying on that as the only safety net.
  function handleKeyUp(e) {
    if (ARROW_KEY_DELTAS[e.key] && !isTextEditableFocus()) core.commitUndoStep();
  }

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
  // F-013: a *parallel* nice-number table in feet, not a unit-converted copy of the metric
  // one above -- converting metric's own nice steps into feet would label the bar "3.28 ft"
  // instead of a round number. The smallest four steps are inch-fractions-of-a-foot (so the
  // < 1ft branch below can still label them as whole inches), then a 1-2-3-5-10 progression
  // in feet, extended to 20000 (rather than stopping at 5000 to mirror the metric table's
  // own count) so its dynamic range isn't accidentally ~3x short of the metric side's.
  const SCALE_BAR_STEPS_FT = [1 / 12, 2 / 12, 3 / 12, 6 / 12, 1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000, 5000, 10000, 20000];
  const SCALE_BAR_MAX_PX = 140;

  function updateScaleBar() {
    const pxPerMeter = currentPxPerMeter();
    if (!pxPerMeter) return;
    // F-013: imperial reads its own step table in feet (each converted to meters via
    // core.FT_TO_M for the same px-fit comparison) and labels in feet/inches -- a compact
    // single-unit label ("15 ft"/"6 in"), not core.formatMeasurement's combined "5' 6.3""
    // annotation style, which is built for a different UI context (see its own comment).
    const imperial = core.getDisplayUnit() === "imperial";
    const steps = imperial ? SCALE_BAR_STEPS_FT : SCALE_BAR_STEPS_M;
    const toMeters = imperial ? (ft) => ft * core.FT_TO_M : (m) => m;
    let step = steps[0];
    for (const s of steps) {
      if (toMeters(s) * pxPerMeter <= SCALE_BAR_MAX_PX) step = s; else break;
    }
    scaleBarBarEl.style.width = `${toMeters(step) * pxPerMeter}px`;
    scaleBarLabelEl.textContent = imperial
      ? (step < 1 ? `${Math.round(step * 12)} in` : `${step} ft`)
      : (step < 1 ? `${Math.round(step * 100)} cm` : `${step} m`);
  }

  // Shared by handleWheel and the pinch handler below so the two zoom mechanisms can't
  // silently drift to different limits (the exact duplication class D-114/S-015 just fixed
  // elsewhere in this same file).
  function zoomWidthBounds() {
    return { minWidth: lastCoreFit.width / 8, maxWidth: lastCoreFit.width * 2 };
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
    // The same `xMidYMid meet` letterboxing offset clientToViewBoxPoint accounts for (see
    // its own comment) — without it the point kept "under the cursor" during a zoom is
    // actually offset from the real cursor whenever the viewer pane's aspect ratio doesn't
    // match the viewBox's, which is close to always.
    const offsetX = (rect.width - current.width * scale) / 2;
    const offsetY = (rect.height - current.height * scale) / 2;
    const cursorVbX = current.x + (e.clientX - rect.left - offsetX) / scale;
    const cursorVbY = current.y + (e.clientY - rect.top - offsetY) / scale;

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const { minWidth, maxWidth } = zoomWidthBounds();
    const newWidth = Math.min(maxWidth, Math.max(minWidth, current.width / factor));
    if (newWidth === current.width) return; // already at a zoom limit
    const ratio = newWidth / current.width;
    const newHeight = current.height * ratio;
    const newScale = Math.min(rect.width / newWidth, rect.height / newHeight);
    // offsetX/offsetY stay exactly the same after a pure zoom (the aspect ratio and the
    // constraining axis are both unchanged, so the constraining axis always exactly fills
    // `rect` and the other axis's on-screen slack never moves) — reused directly rather
    // than recomputed against newWidth/newHeight/newScale.
    const newX = cursorVbX - (e.clientX - rect.left - offsetX) / newScale;
    const newY = cursorVbY - (e.clientY - rect.top - offsetY) / newScale;

    viewState = { x: newX, y: newY, width: newWidth, height: newHeight };
    svg.setAttribute("viewBox", `${newX} ${newY} ${newWidth} ${newHeight}`);
    updateScaleBar();
  }

  // F-036: pinch-to-zoom — touch's own equivalent of handleWheel above, driven by two
  // fingers instead of a wheel event. Distance between the two touches drives the zoom
  // factor; their midpoint is the anchor a map/canvas pinch is expected to zoom (and pan)
  // around, exactly the role the cursor plays for handleWheel.
  function pinchDistance() {
    const [a, b] = [...activeTouches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function pinchMidpoint() {
    const [a, b] = [...activeTouches.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function handlePinchMove() {
    const svg = core.rootEl.querySelector("svg");
    if (!svg || !lastCoreFit || activeTouches.size < 2) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const base = pinch.startView;
    const scale0 = Math.min(rect.width / base.width, rect.height / base.height);
    const offsetX = (rect.width - base.width * scale0) / 2;
    const offsetY = (rect.height - base.height * scale0) / 2;
    // The viewBox point under the pinch's own *start* midpoint — this is what stays
    // anchored under wherever the (live, moving) midpoint currently is, the same law
    // handleWheel applies to the cursor.
    const anchorVbX = base.x + (pinch.startMid.x - rect.left - offsetX) / scale0;
    const anchorVbY = base.y + (pinch.startMid.y - rect.top - offsetY) / scale0;

    const factor = pinchDistance() / pinch.startDist || 1;
    const { minWidth, maxWidth } = zoomWidthBounds();
    const newWidth = Math.min(maxWidth, Math.max(minWidth, base.width / factor));
    const ratio = newWidth / base.width;
    const newHeight = base.height * ratio;
    const newScale = Math.min(rect.width / newWidth, rect.height / newHeight);
    const mid = pinchMidpoint();
    const newX = anchorVbX - (mid.x - rect.left - offsetX) / newScale;
    const newY = anchorVbY - (mid.y - rect.top - offsetY) / newScale;

    viewState = { x: newX, y: newY, width: newWidth, height: newHeight };
    svg.setAttribute("viewBox", `${newX} ${newY} ${newWidth} ${newHeight}`);
    updateScaleBar();
  }

  // F-016: dragging a resize handle. Reparses resizeDrag.baseText fresh every call — not
  // the live evolving sourceEl.value — the same reason applyDrag does: every move computes
  // an *absolute* target from the gesture's own fixed start state (anchorAbs/startAbs),
  // never accumulated from whatever the previous move already wrote, so spans and original
  // literal values both stay exactly as they were at gesture-start regardless of how many
  // moves have already happened.
  function applyResizeDrag(clientX, clientY) {
    const cursor = clientToPlanPoint(clientX, clientY);
    if (!cursor) return;
    let base;
    try { base = core.parseExpanded(resizeDrag.baseText); } catch (e) { return; }
    const node = base.nodesById[resizeDrag.id];
    if (!node) return;
    const edits = [];
    if (resizeDrag.kind === "radius") {
      const r0 = node.props.radius;
      // F-031: snaps the resulting radius *value* to the nearest grid multiple, not the
      // cursor's raw (x, y) — snapping the cursor to a grid intersection would rarely
      // land the distance-from-center on a clean multiple at all (that distance is
      // sqrt(2)*size for a diagonal intersection, etc.), unlike a rect corner's own
      // straightforward x/y.
      const rawR = Math.hypot(cursor[0] - resizeDrag.startAbs[0], cursor[1] - resizeDrag.startAbs[1]);
      const snapSize = snapIncrement();
      const newR = Math.max(RESIZE_MIN, snapSize ? Math.round(rawR / snapSize) * snapSize : rawR);
      edits.push({ start: r0.start, end: r0.end, text: core.formatNumber(newR, r0.unit) });
    } else {
      const [ax, ay] = resizeDrag.anchorAbs;
      // D-141: the raw cursor is in the outer, un-rotated plan frame — position/size (and
      // anchorAbs above, derived from them) are always stored in the rect's own local frame,
      // rotation being a purely visual render-time transform. Rotating the cursor by
      // -rotationDeg around the same pivot captured at gesture start puts it back into that
      // local frame before any of the existing (rotation-unaware) math below runs — for an
      // unrotated rect (rotationDeg 0) rotatePoint short-circuits to the cursor unchanged.
      const [localX, localY] = resizeDrag.rotationDeg
        ? rotatePoint(cursor[0], cursor[1], resizeDrag.pivot[0], resizeDrag.pivot[1], -resizeDrag.rotationDeg)
        : cursor;
      // F-031: snaps the cursor's own plan point to the nearest grid intersection first —
      // every dependent value below (position, width, height) is then derived from this
      // one already-snapped point, consistent by construction rather than re-snapped
      // independently.
      const [snapX, snapY] = snappedGridPoint(localX, localY);
      const newAbsX = Math.min(ax, snapX), newAbsY = Math.min(ay, snapY);
      const newW = Math.max(RESIZE_MIN, Math.abs(snapX - ax));
      const newH = Math.max(RESIZE_MIN, Math.abs(snapY - ay));
      const [w0, h0] = node.props.size;
      const [x0, y0] = node.props.position;
      edits.push({ start: w0.start, end: w0.end, text: core.formatNumber(newW, w0.unit) });
      edits.push({ start: h0.start, end: h0.end, text: core.formatNumber(newH, h0.unit) });
      const deltaX = newAbsX - resizeDrag.startAbs[0], deltaY = newAbsY - resizeDrag.startAbs[1];
      edits.push({ start: x0.start, end: x0.end, text: core.formatNumber(x0.value + deltaX, x0.unit) });
      edits.push({ start: y0.start, end: y0.end, text: core.formatNumber(y0.value + deltaY, y0.unit) });
    }
    core.sourceEl.value = applyEditsDescending(resizeDrag.baseText, edits);
    core.rerender({ preserveViewBox: true });
  }

  // D-139: dragging a polygon/polyline's own per-vertex handle for a literal [x,y] point —
  // same reparse-baseText-fresh-every-call reasoning as applyResizeDrag right above. Only
  // ever edits that one point's own x/y span; every other point in the shape is untouched.
  function applyVertexDrag(clientX, clientY) {
    const cursor = clientToPlanPoint(clientX, clientY);
    if (!cursor) return;
    let base;
    try { base = core.parseExpanded(vertexDrag.baseText); } catch (e) { return; }
    const node = base.nodesById[vertexDrag.id];
    const pt = node?.props.points?.[vertexDrag.pointIndex];
    if (!node || !Array.isArray(pt)) return;
    const [x0, y0] = pt;
    if (!core.isEditable(x0) || !core.isEditable(y0)) return;

    const dx = cursor[0] - vertexDrag.startAbs[0], dy = cursor[1] - vertexDrag.startAbs[1];
    const [snapDx, snapDy] = snappedDragDelta(vertexDrag.startAbs, dx, dy);
    const newX = x0.value + snapDx, newY = y0.value + snapDy;

    // Realism, mirroring wouldSelfIntersect's own reasoning: meaningless for an open
    // polyline, so scoped to shape:"polygon" only, matching that function's own convention.
    if (node.props.shape === "polygon" && !base.settings.allowSelfIntersectingPolygons) {
      const positions = {};
      core.computePositions(base.root, null, [0, 0], positions);
      const ownAbs = positions[node.id];
      const testPoints = node.props.points.map((p, i) => i === vertexDrag.pointIndex
        ? [ownAbs[0] + newX, ownAbs[1] + newY]
        : core.resolvePointAbs(p, ownAbs, positions));
      if (core.polygonSelfIntersects(testPoints)) {
        core.dragmsgEl.textContent = `${node.id}: this would make the polygon self-intersecting. Set allowSelfIntersectingPolygons: true to allow this.`;
        return;
      }
    }

    const edits = [
      { start: x0.start, end: x0.end, text: core.formatNumber(newX, x0.unit) },
      { start: y0.start, end: y0.end, text: core.formatNumber(newY, y0.unit) },
    ];
    core.sourceEl.value = applyEditsDescending(vertexDrag.baseText, edits);
    core.rerender({ preserveViewBox: true });
  }

  // D-143: dragging one of a polygon/polyline's 4 bounding-box scale handles. Same
  // reparse-baseText-fresh-every-call reasoning as applyResizeDrag/applyVertexDrag above —
  // only pivotAbs/originalCornerAbs (the gesture's own fixed starting facts) are carried in
  // scaleDrag itself; everything else (every point's own current position, cornerUsers)
  // is re-derived fresh each move.
  function applyScaleDrag(clientX, clientY) {
    const cursor = clientToPlanPoint(clientX, clientY);
    if (!cursor) return;
    let base;
    try { base = core.parseExpanded(scaleDrag.baseText); } catch (e) { return; }
    const node = base.nodesById[scaleDrag.id];
    if (!node || !node.props.points) return;

    // Re-checked every move, not just at gesture start -- if the source changed underneath
    // (a corner this shape uses became shared by something else), scaling further would
    // reintroduce exactly the distortion-of-other-shapes problem canScale exists to avoid.
    const cornerUsers = {};
    core.computeCornerUsers(base.root, cornerUsers);
    if (!canScale(node, cornerUsers)) return;

    const positions = {};
    core.computePositions(base.root, null, [0, 0], positions);
    const ownAbs = positions[node.id];

    const [snapX, snapY] = snappedGridPoint(cursor[0], cursor[1]);
    const [pivotX, pivotY] = scaleDrag.pivotAbs;
    const [origX, origY] = scaleDrag.originalCornerAbs;
    const denomX = origX - pivotX, denomY = origY - pivotY;
    if (!denomX || !denomY) return; // degenerate; render already guards a zero-width/height bbox
    const sx = (snapX - pivotX) / denomX, sy = (snapY - pivotY) / denomY;
    const scalePoint = (p) => [pivotX + (p[0] - pivotX) * sx, pivotY + (p[1] - pivotY) * sy];

    // Every point must be genuinely editable before touching any of them -- a scale that
    // silently left one point behind (an expression-valued literal, or a corner node whose
    // own position is an expression) would look broken, not cleanly partially applied.
    for (const pt of node.props.points) {
      if (Array.isArray(pt)) {
        if (!core.isEditable(pt[0]) || !core.isEditable(pt[1])) {
          core.dragmsgEl.textContent = `${node.id}: one of its points is an expression, can't scale — edit it directly`;
          return;
        }
      } else if (typeof pt === "function" && pt.cornerRef) {
        const cornerNode = base.nodesById[pt.cornerRef];
        const cpos = cornerNode?.props.position;
        if (!cornerNode || !cpos || !core.isEditable(cpos[0]) || !core.isEditable(cpos[1])) {
          core.dragmsgEl.textContent = `${node.id}: '${pt.cornerRef}' isn't a plain draggable point, can't scale`;
          return;
        }
      }
    }

    // No self-intersection check here, deliberately — unlike D-139's own per-vertex drag
    // (which can genuinely cross an edge), scaling every point by a fixed (sx, sy) from one
    // shared pivot is an invertible linear map of the whole point set, and segment
    // intersection is an affinely-invariant property: verified by proof (the sign tests
    // segmentsIntersect/polygonSelfIntersects use flip in lockstep under any nonzero
    // diagonal scale, never changing their outcome) and brute-force (20,000 random simple
    // polygons scaled by random, including negative/mirroring, sx/sy: zero ever became
    // self-intersecting). A shape that was already simple before this scale is provably
    // still simple after it, so a check here could never actually reject anything.
    const edits = [];
    const touchedCorners = new Set();
    for (const pt of node.props.points) {
      if (Array.isArray(pt)) {
        const [x0, y0] = pt;
        const newAbs = scalePoint(core.resolvePointAbs(pt, ownAbs, positions));
        edits.push({ start: x0.start, end: x0.end, text: core.formatNumber(newAbs[0] - ownAbs[0], x0.unit) });
        edits.push({ start: y0.start, end: y0.end, text: core.formatNumber(newAbs[1] - ownAbs[1], y0.unit) });
      } else if (typeof pt === "function" && pt.cornerRef && !touchedCorners.has(pt.cornerRef)) {
        touchedCorners.add(pt.cornerRef);
        const cornerNode = base.nodesById[pt.cornerRef];
        const [cx0, cy0] = cornerNode.props.position;
        const origAbs = positions[pt.cornerRef];
        const newAbs = scalePoint(origAbs);
        edits.push({ start: cx0.start, end: cx0.end, text: core.formatNumber(cx0.value + (newAbs[0] - origAbs[0]), cx0.unit) });
        edits.push({ start: cy0.start, end: cy0.end, text: core.formatNumber(cy0.value + (newAbs[1] - origAbs[1]), cy0.unit) });
      }
    }

    core.sourceEl.value = applyEditsDescending(scaleDrag.baseText, edits);
    core.rerender({ preserveViewBox: true });
  }

  function handlePointerMove(e) {
    if (e.pointerType === "touch" && activeTouches.has(e.pointerId)) {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch) { handlePinchMove(); return; }
    if (resizeDrag) { applyResizeDrag(e.clientX, e.clientY); return; }
    if (vertexDrag) { applyVertexDrag(e.clientX, e.clientY); return; }
    if (scaleDrag) { applyScaleDrag(e.clientX, e.clientY); return; }
    if (connectPick) {
      // S-038: shared isValidGestureTarget -- relateDrag's own branch below uses the exact
      // same check, just triggered by hover-with-no-button-down instead of hover-during-drag.
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-id]");
      const hoveredId = el?.dataset.id;
      const newCandidateId = isValidGestureTarget(hoveredId, connectPick.fromId, program) ? hoveredId : null;
      if (newCandidateId !== connectPick.candidateId) {
        if (connectPick.candidateId) core.rootEl.querySelector(`[data-id="${CSS.escape(connectPick.candidateId)}"]`)?.classList.remove("relate-candidate");
        if (newCandidateId) core.rootEl.querySelector(`[data-id="${CSS.escape(newCandidateId)}"]`)?.classList.add("relate-candidate");
        connectPick.candidateId = newCandidateId;
      }
      return;
    }
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
    if (marqueeDrag) {
      const dxScreen = e.clientX - marqueeDrag.startClientX;
      const dyScreen = e.clientY - marqueeDrag.startClientY;
      if (!marqueeDrag.moved && Math.hypot(dxScreen, dyScreen) > 3) {
        marqueeDrag.moved = true;
        core.rootEl.classList.add("dragging");
      }
      if (!marqueeDrag.moved) return;
      const start = clientToViewBoxPoint(marqueeDrag.startClientX, marqueeDrag.startClientY);
      const current = clientToViewBoxPoint(e.clientX, e.clientY);
      if (!start || !current) return;
      const mx = Math.min(start[0], current[0]), my = Math.min(start[1], current[1]);
      const mw = Math.abs(current[0] - start[0]), mh = Math.abs(current[1] - start[1]);
      if (marqueeDrag.rectEl) {
        marqueeDrag.rectEl.setAttribute("x", mx);
        marqueeDrag.rectEl.setAttribute("y", my);
        marqueeDrag.rectEl.setAttribute("width", mw);
        marqueeDrag.rectEl.setAttribute("height", mh);
      }
      // Cheap since bboxes were snapshotted once at gesture start (see handlePointerDown)
      // -- only the marquee rectangle itself needs recomputing on every frame.
      const marqueeRect = { x: mx, y: my, width: mw, height: mh };
      const newCandidates = new Set();
      for (const [id, bbox] of marqueeDrag.bboxes) {
        if (rectsIntersect(marqueeRect, bbox)) newCandidates.add(id);
      }
      for (const id of marqueeDrag.candidateIds) {
        if (!newCandidates.has(id)) core.rootEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.remove("marquee-candidate");
      }
      for (const id of newCandidates) {
        if (!marqueeDrag.candidateIds.has(id)) core.rootEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add("marquee-candidate");
      }
      marqueeDrag.candidateIds = newCandidates;
      return;
    }
    if (relateDrag) {
      if (relateDrag.lineEl) {
        const vb = clientToViewBoxPoint(e.clientX, e.clientY);
        if (vb) { relateDrag.lineEl.setAttribute("x2", vb[0]); relateDrag.lineEl.setAttribute("y2", vb[1]); }
      }
      // Live-under-cursor target, not the source itself and not one of its own structural
      // ancestors/descendants — S-038's shared isValidGestureTarget, for the same underlying
      // reason: relating a node to its own container/child isn't a meaningful relationship
      // this language has any other way to represent.
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-id]");
      const hoveredId = el?.dataset.id;
      const newCandidateId = isValidGestureTarget(hoveredId, relateDrag.fromId, program) ? hoveredId : null;
      if (newCandidateId !== relateDrag.candidateId) {
        if (relateDrag.candidateId) core.rootEl.querySelector(`[data-id="${CSS.escape(relateDrag.candidateId)}"]`)?.classList.remove("relate-candidate");
        if (newCandidateId) core.rootEl.querySelector(`[data-id="${CSS.escape(newCandidateId)}"]`)?.classList.add("relate-candidate");
        relateDrag.candidateId = newCandidateId;
      }
      return;
    }
    if (!drag) {
      if (program) updateStackedHint(e.clientX, e.clientY, core.rootEl.contains(e.target));
      return;
    }
    // Same 3px-of-slop threshold canvasDrag already uses to tell a pan from a plain click —
    // reused here so a click-cycle (see candidateIdsAtPoint) only ever advances on a genuine
    // click-in-place, never gets reset by the sub-pixel jitter of a real drag's first frame.
    // Also doubles as the long-press cancellation signal (F-036) — real movement past this
    // same threshold means it's a drag, not a hold, no separate tolerance constant needed.
    if (!drag.moved && Math.hypot(e.clientX - drag.clientX, e.clientY - drag.clientY) > 3) {
      drag.moved = true;
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    const pxPerMeter = currentPxPerMeter();
    let dx = (e.clientX - drag.clientX) / pxPerMeter;
    let dy = (e.clientY - drag.clientY) / pxPerMeter;
    [dx, dy] = snappedDragDelta(drag.startAbs, dx, dy);
    applyDrag(drag, dx, dy);

    // D-150 (F-012): Shift held during an ordinary drag additionally looks for a valid
    // reparent target under the cursor -- S-038's shared isValidGestureTarget, plus excluding
    // the node's own *current* parent (dropping back on your own parent isn't a new one).
    // Deliberately gated on a held modifier, not automatic: an ordinary drag frequently ends
    // up over some other nearby shape, and reparenting on every such coincidence would make
    // simple repositioning unpredictable. Skipped entirely for a group drag
    // (drag.groupIds.length) -- v1 scope. applyDrag above always refreshes core.dragmsgEl
    // fully on its own every frame, so this only ever *adds* to it when there's a candidate to
    // report, never clears it otherwise.
    if (drag.moved && !drag.groupIds.length) {
      const currentParentId = program?.nodesById[drag.id]?.parentId;
      let newCandidateId = null;
      if (e.shiftKey) {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-id]");
        const hoveredId = el?.dataset.id;
        newCandidateId = isValidGestureTarget(hoveredId, drag.id, program, currentParentId) ? hoveredId : null;
      }
      // Only the *candidate id* is decided here, synchronously, every frame -- the actual
      // highlight is applied from the drag-start-registered core.onRendered hook instead
      // (see handlePointerDown), since applyDrag's own render above is async and hasn't
      // necessarily replaced the DOM yet at this exact point.
      drag.reparentCandidateId = newCandidateId;
      if (newCandidateId) core.dragmsgEl.textContent += `\n'${drag.id}': release to move it into '${newCandidateId}'`;
    }
  }

  function handlePointerUp(e) {
    core.rootEl.classList.remove("dragging");
    clearTimeout(longPressTimer);
    longPressTimer = null;
    if (e.pointerType === "touch") activeTouches.delete(e.pointerId);
    if (pinch) {
      // Ends the moment either finger lifts — deliberately not handed off into a live
      // single-finger pan with whichever touch remains; release both and start a fresh
      // gesture instead.
      if (activeTouches.size < 2) pinch = null;
      return;
    }
    if (resizeDrag) {
      resizeDrag = null;
      core.commitUndoStep();
      return;
    }
    if (vertexDrag) {
      vertexDrag = null;
      core.commitUndoStep();
      return;
    }
    if (scaleDrag) {
      scaleDrag = null;
      core.commitUndoStep();
      return;
    }
    // D-144: resolved on pointerup, exactly like relateDrag's own gesture right below --
    // opening openRelateMenu here (rather than in handlePointerDown, mid-pointerdown) is
    // what keeps it clear of handleWindowPointerDown's own same-event "click outside the
    // menu" closer. Unlike every gesture state above, connectPick isn't only ever armed by
    // a left-button pointerdown (it's armed by a menu click) -- a right-click's own
    // pointerup reaches here too and must NOT resolve the pick itself; a real bug found
    // live: right-clicking mid-pick was opening the relate-confirmation menu right here,
    // *before* the native contextmenu event even fired to cancel it. handleContextMenu's
    // own connectPick-cancel handles the right-click case instead.
    if (connectPick && e.button === 0) {
      const { fromId } = connectPick;
      // D-152: resolved fresh from this event's own point, not from connectPick's own
      // candidateId -- that's only ever populated by handlePointerMove's hover tracking,
      // which never runs on touch (there's no hover state without an active drag: a tap
      // goes straight from "not touching" to pointerdown/up at the target, no intervening
      // pointermove ever fires). A real bug, reported directly: every tap during a pick
      // silently cancelled it, since the stored candidateId was still null. Recomputing
      // the identical validity check (S-038's shared isValidGestureTarget) directly against
      // this event's own point works the same for mouse (where a prior hover already agrees)
      // and touch alike.
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-id]");
      const hoveredId = el?.dataset.id;
      const candidateId = isValidGestureTarget(hoveredId, fromId, program) ? hoveredId : null;
      cancelConnectPick();
      // Releasing over empty canvas, back on the source, or an invalid (ancestor/descendant)
      // candidate just cancels -- no menu, no edit, matching relateDrag's own convention.
      if (candidateId) openRelateMenu(fromId, candidateId, e.clientX, e.clientY);
      return;
    }
    if (relateDrag) {
      const { fromId, candidateId } = relateDrag;
      if (candidateId) core.rootEl.querySelector(`[data-id="${CSS.escape(candidateId)}"]`)?.classList.remove("relate-candidate");
      relateDrag.lineEl?.remove();
      relateDrag = null;
      // Releasing over empty canvas, back on the source, or an invalid (ancestor/descendant)
      // candidate does nothing at all — the same graceful "changed your mind" shape a
      // cancelled ordinary drag already has, no menu and no edit either way.
      if (candidateId) openRelateMenu(fromId, candidateId, e.clientX, e.clientY);
      return;
    }
    if (canvasDrag) {
      const wasClick = !canvasDrag.moved;
      canvasDrag = null;
      if (wasClick) { selectedId = null; selectedIds = new Set(); core.rerender({ preserveViewBox: true }); }
      return;
    }
    if (marqueeDrag) {
      const wasClick = !marqueeDrag.moved;
      marqueeDrag.rectEl?.remove();
      for (const id of marqueeDrag.candidateIds) {
        core.rootEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.remove("marquee-candidate");
      }
      // A marquee that never actually moved is just a stray Alt+click on empty canvas --
      // deselects, matching canvasDrag's own "plain click on nothing" convention exactly,
      // rather than doing nothing (a zero-size marquee "selecting" nothing would otherwise
      // just silently leave whatever was already selected untouched, a surprising result
      // for what looks like a deliberate click).
      if (wasClick) {
        selectedId = null; selectedIds = new Set();
        marqueeDrag = null;
        core.rerender({ preserveViewBox: true });
        return;
      }
      // F-047: additive, matching Alt+click's own behavior -- a marquee never clears a
      // selection made a moment earlier, by Alt+click or by an earlier marquee.
      for (const id of marqueeDrag.candidateIds) selectedIds.add(id);
      if (marqueeDrag.candidateIds.size) selectedId = [...marqueeDrag.candidateIds].pop();
      marqueeDrag = null;
      core.rerender({ preserveViewBox: true });
      return;
    }
    if (drag) {
      const nodeId = drag.id;
      selectedId = nodeId; // click or drag-and-release both select the element
      // F-029: an actual group-drag (moved, started from inside a multi-selection) keeps
      // the whole group selected; a plain click (never moved) always collapses to just the
      // one element clicked, whether or not it was already part of a group — no "sticky"
      // multi-select survives a plain click.
      selectedIds = drag.moved && drag.groupIds.length ? new Set([nodeId, ...drag.groupIds]) : new Set([nodeId]);
      // A plain click (never moved) remembers its own point + chosen id, so a repeated
      // click right there can step to the next thing underneath next time; an actual drag
      // invalidates it — dragging is a deliberate move, not "try again at this spot".
      clickCycle = drag.moved ? null : { x: drag.clientX, y: drag.clientY, lastId: nodeId };
      // D-150 (F-012): a live reparent candidate (Shift held over a valid different
      // element, see handlePointerMove) is resolved here, before `drag` itself is cleared —
      // this is the one place left that still knows what was live. Unregistering the
      // highlight hook *before* the final rerender below means it never re-applies the
      // class to a fresh post-drag render that has nothing to do with this gesture anymore.
      const reparentTargetId = drag.reparentCandidateId;
      drag.unregisterReparentHighlight?.();
      if (reparentTargetId) core.rootEl.querySelector(`[data-id="${CSS.escape(reparentTargetId)}"]`)?.classList.remove("reparent-candidate");
      drag = null;
      if (reparentTargetId) {
        // reparentElement runs its own commitSourceEdit (rerender + commitUndoStep) against
        // the text applyDrag already updated with the final dragged position -- one single
        // undo step for the whole Shift-drag-and-drop gesture, not two (move, then a
        // separate reparent) the way calling core.commitUndoStep() here first would.
        reparentElement(nodeId, reparentTargetId);
      } else {
        core.rerender({ preserveViewBox: true });
        // Once per gesture, not once per pointermove frame (applyDrag runs on every one of
        // those) — commitUndoStep is a no-op if the text didn't actually change, so a plain
        // click-to-select (drag set, nothing moved) never clutters history either.
        core.commitUndoStep();
      }
    }
  }

  // Suppressed during either kind of drag: without setPointerCapture, the cursor still
  // fires over/out for whatever it happens to pass across mid-gesture, not just what's
  // actually being interacted with (same reasoning as the object-drag case).
  function handlePointerOver(e) {
    if (isGestureActive()) return;
    const el = e.target.closest("[data-id]");
    if (!el || !program) return;
    const users = el.dataset.cornerUsers;
    if (users) {
      for (const uid of users.split(",").filter(Boolean)) {
        core.rootEl.querySelector(`[data-id="${CSS.escape(uid)}"]`)?.classList.add("corner-preview");
      }
    }
    // Requested directly: a connection's own line should be visible on hover regardless of
    // the `showConnections` setting (that toggle is for a *permanent* line, this is a
    // transient hover aid) — drawn straight into the live <svg>, not gated on rerendering,
    // so it appears/disappears exactly with the hover itself. Also requested: an *indirect*
    // chain (A-B-C) should show in full when hovering just A, not only A's own direct edge —
    // reusing core's own `connectedNodeIds` BFS (the same one drag propagation already
    // treats as one fully transitive group) rather than inventing a second notion of
    // "connected" that only looks one hop deep.
    const svgEl = core.rootEl.querySelector("svg");
    const reachable = new Set([el.dataset.id, ...core.connectedNodeIds(el.dataset.id, program.connections)]);
    for (const c of program.connections) {
      if (!reachable.has(c.from) || !reachable.has(c.to)) continue;
      core.rootEl.querySelector(`[data-id="${CSS.escape(c.from)}"]`)?.classList.add("connected-highlight");
      core.rootEl.querySelector(`[data-id="${CSS.escape(c.to)}"]`)?.classList.add("connected-highlight");
      if (svgEl) {
        const a = program.nodesById[c.from], b = program.nodesById[c.to];
        const pa = a && nodeCenter(a, lastPositions), pb = b && nodeCenter(b, lastPositions);
        if (pa && pb) {
          svgEl.insertAdjacentHTML("beforeend", `<line class="hover-connection-line" x1="${pa[0] * core.M}" y1="${pa[1] * core.M}" x2="${pb[0] * core.M}" y2="${pb[1] * core.M}" stroke="#8a8a8a" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.6" pointer-events="none" />`);
        }
      }
    }
    // The stacked-hint check itself now lives in updateStackedHint, run continuously from
    // handlePointerMove rather than once here — see that function for why: a single sample
    // at element-*entry* missed a real case (entering a large element through its own
    // non-overlapping region, then moving — still inside the same element, no fresh
    // pointerover — into the part that does overlap something else).
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
    // Clears the *whole* highlighted set (every node in this component, not just the ones
    // directly touching whatever's under the pointer right now) — matches handlePointerOver
    // now highlighting the full transitive chain rather than only direct partners.
    core.rootEl.querySelectorAll(".connected-highlight").forEach((el2) => el2.classList.remove("connected-highlight"));
    core.rootEl.querySelectorAll("svg .hover-connection-line").forEach((el2) => el2.remove());
    if (stackHintCandidates) {
      for (const id of stackHintCandidates) {
        core.rootEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.remove("stacked-dim");
      }
    }
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
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  core.rootEl.addEventListener("pointerover", handlePointerOver);
  core.rootEl.addEventListener("pointerout", handlePointerOut);
  core.rootEl.addEventListener("wheel", handleWheel, { passive: false });
  fitBtnEl?.addEventListener("click", handleFitClick);

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
    window.removeEventListener("keyup", handleKeyUp);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    core.rootEl.removeEventListener("pointerover", handlePointerOver);
    core.rootEl.removeEventListener("pointerout", handlePointerOut);
    core.rootEl.removeEventListener("wheel", handleWheel);
    fitBtnEl?.removeEventListener("click", handleFitClick);
    // D-156: hidden again, not removed -- #header-fit-btn is core's own persistent slot
    // (docs/index.html), not this module's to delete.
    if (fitBtnEl) fitBtnEl.hidden = true;
    core.rootEl.classList.remove("dragging");
    delete core.rootEl.dataset.selectedId;
    contextMenuEl.remove();
    scaleBarEl.remove();
    styleEl.remove();
    // S-010: every module-owned mutable variable, not just five of thirteen — the comment
    // above says "undoes exactly what setup did," so it should actually be true, even
    // though nothing currently depends on it (the whole IIFE closure is discarded on
    // reload regardless).
    program = null;
    lastBboxes = {};
    lastPositions = {};
    selectedId = null;
    selectedIds = new Set();
    drag = null;
    relateDrag = null;
    contextMenuItems = [];
    clickCycle = null;
    stackHintCandidates = null;
    viewState = null;
    lastCoreFit = null;
    canvasDrag = null;
    marqueeDrag = null;
    paintOrderRank = new Map();
    activeTouches.clear();
    pinch = null;
    clearTimeout(longPressTimer);
    longPressTimer = null;
    resizeDrag = null;
    vertexDrag = null;
    scaleDrag = null;
  });
})();
