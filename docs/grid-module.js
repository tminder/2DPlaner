// Grid module (F-014): a checkered or line background, a scale reference only — no
// interactivity dependency at all, not even selection state, the cleanest case yet for the
// D-039/D-042 "pure display" module test. Auto-loaded (see AUTO_MODULES in index.html) so
// `settings { grid: { size: 1 } }` works with zero module declaration, the same way
// settings.styles/settings.version already do — an opt-in module would leave
// `settings.grid` silently doing nothing for anyone who didn't also know to declare this
// module, exactly the kind of silent gap F-023 exists to eliminate.
(function () {
  const core = window.PlanCore;
  if (!core) {
    console.error("grid-module.js: window.PlanCore not found — must load after the core script.");
    return;
  }

  // `type: "checker"` (default, unchanged from the first version of this module) or
  // `type: "lines"` — each returns the pattern's own tile size (in px, before any world-
  // origin anchoring) and its inner markup; the caller wraps it in the actual <pattern>.
  function checkerTile(cell) {
    return {
      tile: cell * 2,
      inner: `
        <rect width="${cell * 2}" height="${cell * 2}" fill="#fafafa" />
        <rect width="${cell}" height="${cell}" fill="#ededed" />
        <rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="#ededed" />
      `,
    };
  }

  // A single tile's own top and left edge, tiled edge-to-edge, draws every grid line
  // exactly once (each interior line is some tile's top or left edge) — the standard SVG
  // line-grid technique, avoids drawing every line twice where tiles would otherwise abut.
  function linesTile(cell) {
    return {
      tile: cell,
      inner: `<path d="M ${cell} 0 L 0 0 0 ${cell}" fill="none" stroke="#ddd" stroke-width="1" />`,
    };
  }

  function handleRendered(prog) {
    const svgEl = core.rootEl.querySelector("svg");
    if (!svgEl) return;

    const grid = prog.settings && prog.settings.grid;
    if (!grid) return;

    const size = core.numOf(grid.size ?? 1);
    const cell = size * core.M;
    const { tile, inner } = grid.type === "lines" ? linesTile(cell) : checkerTile(cell);
    const vb = svgEl.viewBox.baseVal;
    // A deliberate, finite boundary, not true infinite tiling: 5x the fit-to-content box,
    // centered on it, comfortably covers the app's own bounded zoom-out (2x, see
    // interactivity-module.js) plus realistic panning. Recomputing this on every pan/zoom
    // frame would mean reaching into interactivity-module.js's own wheel/drag handlers —
    // exactly the dependency this module exists to not need.
    const rectX = vb.x - 2 * vb.width;
    const rectY = vb.y - 2 * vb.height;
    const rectW = 5 * vb.width;
    const rectH = 5 * vb.height;

    const markup = `
      <defs>
        <pattern id="plan-grid-pattern" x="0" y="0" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse">
          ${inner}
        </pattern>
      </defs>
      <rect class="plan-grid-bg" x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" fill="url(#plan-grid-pattern)" pointer-events="none" />
    `;
    svgEl.insertAdjacentHTML("afterbegin", markup);
  }
  const unregisterOnRendered = core.onRendered(handleRendered);

  core.registerModuleCleanup("grid-module.js", () => {
    unregisterOnRendered();
  });
})();
