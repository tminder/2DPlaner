// Annotations module (D-039): renders label / dimensions / edgeLengths — computed,
// read-only display facts about an element's own geometry, not required for the two core
// primitives themselves. Kept entirely out of core and separate from
// interactivity-module.js: a read-only embed (D-024) may want dimension labels with no
// drag/select/connect at all, so the two are independently loadable.
//
// Uses no core API beyond what D-031 already exposes for interactivity — core.onRendered
// to run after core's own render, core.computePositions/resolvePointAbs to re-derive each
// element's absolute geometry, core.numOf/M to read/scale values the same way core does.
// Nothing here needed a new core hook: this is the same "read the rendered result, layer
// more SVG on top" pattern interactivity-module.js already uses for its connect/disconnect
// icons and scale bar.
(function () {
  const core = window.PlanCore;
  if (!core) {
    console.error("annotations-module.js: window.PlanCore not found — must load after the core script.");
    return;
  }

  function escapeXml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  }
  function fmtMeters(n) { return (Math.round(n * 100) / 100).toString(); }

  function dimensionText(node) {
    if (node.props.shape === "rect") {
      const w = core.numOf(node.props.size[0]), h = core.numOf(node.props.size[1]);
      return `${fmtMeters(w)} × ${fmtMeters(h)} m`;
    }
    if (node.props.shape === "circle") {
      const r = core.numOf(node.props.radius ?? 0);
      return `⌀ ${fmtMeters(r * 2)} m`;
    }
    return null;
  }

  // Per-element edgeLengths overrides the plan-wide settings.edgeLengths default — unset on
  // the element means "inherit the plan default," not "off"; an explicit true/false on the
  // element always wins over whatever the plan default is.
  function edgeLengthsEnabled(node, settings) {
    if (typeof node.props.edgeLengths === "boolean") return node.props.edgeLengths;
    return !!settings.edgeLengths;
  }

  // One label per edge of an already-resolved absolute point list — `closed` adds the
  // wraparound edge (last point back to the first) for rect/polygon, omits it for polyline's
  // open path (which has no enclosed area to be outside of in the first place). Each label
  // sits a short distance off its own edge, on the outward side — for a closed shape that
  // means away from `centroid` (the two normal candidates are checked against it directly,
  // so this is correct regardless of the point list's own winding direction) — and reads in
  // the same direction as the edge itself via an SVG rotation, flipped 180° when that would
  // otherwise render the text upside down.
  function edgeLengthLines(pts, closed, centroid) {
    const n = pts.length;
    const count = closed ? n : n - 1;
    const OFFSET = 0.15;
    const lines = [];
    for (let i = 0; i < count; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      let nx = -dy / len, ny = dx / len;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (closed && centroid) {
        const towardMid = [mid[0] - centroid[0], mid[1] - centroid[1]];
        if (nx * towardMid[0] + ny * towardMid[1] < 0) { nx = -nx; ny = -ny; }
      }
      const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
      const readableAngle = angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg;
      lines.push({
        pos: [mid[0] + nx * OFFSET, mid[1] + ny * OFFSET],
        angle: readableAngle,
        text: `${fmtMeters(len)} m`,
      });
    }
    return lines;
  }

  function annotationMarkup(node, anchor, edgeLines) {
    const label = node.props.label;
    const dims = node.props.dimensions ? dimensionText(node) : null;
    if (!label && !dims && !edgeLines.length) return "";
    const showMode = node.props.show === "always" ? "always" : "hover";
    const lines = [label, dims].filter(Boolean);
    const lineHeight = 12;
    const startY = anchor[1] * core.M - ((lines.length - 1) * lineHeight) / 2;
    const textEls = lines.map((line, i) =>
      `<text x="${anchor[0]*core.M}" y="${startY + i*lineHeight}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="#222">${escapeXml(line)}</text>`
    ).join("");
    const edgeTextEls = edgeLines.map(({ pos, angle, text }) =>
      `<text x="${pos[0]*core.M}" y="${pos[1]*core.M}" transform="rotate(${angle} ${pos[0]*core.M} ${pos[1]*core.M})" text-anchor="middle" dominant-baseline="central" font-size="10" fill="#555">${escapeXml(text)}</text>`
    ).join("");
    // One show mode per element governs label, dimensions, and edge lengths together
    // (D-026/D-038) — a single group, rather than a second independent visibility axis.
    return `<g class="annotation" data-show="${showMode}">${textEls}${edgeTextEls}</g>`;
  }

  // Mirrors core's own renderShape branching exactly (same shape/style conditions, same
  // rect-corners-from-size and polygon/polyline-points-via-resolvePointAbs geometry) since
  // core no longer computes or exposes per-node corner lists once rendering is done — this
  // derives them itself from the same parsed tree + resolved positions core already used.
  // Returns "" (not this shape kind, or nothing to show) rather than a markup string.
  function annotationMarkupForNode(node, positions, settings) {
    const ownAbs = positions[node.id];
    const { shape, style } = node.props;
    if (shape === "rect" && style) {
      const w = core.numOf(node.props.size[0]), h = core.numOf(node.props.size[1]);
      const anchor = [ownAbs[0] + w / 2, ownAbs[1] + h / 2];
      const corners = [[ownAbs[0], ownAbs[1]], [ownAbs[0] + w, ownAbs[1]], [ownAbs[0] + w, ownAbs[1] + h], [ownAbs[0], ownAbs[1] + h]];
      const edgeLines = edgeLengthsEnabled(node, settings) ? edgeLengthLines(corners, true, anchor) : [];
      return annotationMarkup(node, anchor, edgeLines);
    }
    if ((shape === "polyline" || shape === "polygon") && style) {
      const absPts = node.props.points.map((pt) => core.resolvePointAbs(pt, ownAbs, positions));
      const anchor = [absPts.reduce((s, p) => s + p[0], 0) / absPts.length, absPts.reduce((s, p) => s + p[1], 0) / absPts.length];
      const edgeLines = edgeLengthsEnabled(node, settings) ? edgeLengthLines(absPts, shape === "polygon", anchor) : [];
      return annotationMarkup(node, anchor, edgeLines);
    }
    if (shape === "circle" && style) return annotationMarkup(node, ownAbs, []);
    if (window.PlanModules && window.PlanModules[shape]) return annotationMarkup(node, ownAbs, []);
    // A bare/no-shape element gets no annotation — matches core's own prior behavior
    // exactly; a shapeless element can't carry a label yet (documented gap, not something
    // this refactor changes).
    return "";
  }

  // core's CSS hover-reveal (`svg .obj:hover + .annotation[data-show="hover"]`) depends on
  // an annotation being its shape's *immediate* next sibling in the DOM — every shape is a
  // flat sibling directly under <svg>, not nested per element, so appending all annotations
  // together at the very end (simpler, but wrong) would put every one of them after every
  // shape instead of right after its own. Inserting each one right after the specific shape
  // element it belongs to, in the same depth-first order core itself rendered in, recreates
  // exactly the interleaving core used to produce directly.
  function insertAnnotations(node, positions, settings, svgEl) {
    const markup = annotationMarkupForNode(node, positions, settings);
    if (markup) {
      const shapeEl = svgEl.querySelector(`[data-id="${CSS.escape(node.id)}"]`);
      if (shapeEl) shapeEl.insertAdjacentHTML("afterend", markup);
    }
    for (const child of node.children) insertAnnotations(child, positions, settings, svgEl);
  }

  function handleRendered(prog, result) {
    const svgEl = core.rootEl.querySelector("svg");
    if (!svgEl) return;
    const positions = {};
    core.computePositions(prog.root, null, [0, 0], positions);
    insertAnnotations(prog.root, positions, prog.settings, svgEl);
  }
  const unregisterOnRendered = core.onRendered(handleRendered);

  core.registerModuleCleanup("annotations-module.js", () => {
    unregisterOnRendered();
  });
})();
