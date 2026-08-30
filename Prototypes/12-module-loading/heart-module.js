// External module (D-020): fetched at runtime via a <script src="heart-module.js"> tag
// created by the app, not bundled in the main page. Registers a "heart" shape renderer
// using the same convention an internal module uses — the core doesn't know or care
// which kind of module it came from once it's loaded.
(function () {
  window.PlanModules = window.PlanModules || {};

  window.PlanModules["heart"] = function (node, ownAbs, M, helpers) {
    const numOf = helpers.numOf;
    const s = numOf(node.props.radius ?? 0.3) * M; // treat radius as a rough half-width
    const style = node.props.style ?? {};
    const cx = ownAbs[0] * M, cy = ownAbs[1] * M;
    const d = `M ${cx},${cy + s * 0.35}
      C ${cx - s},${cy - s * 0.4} ${cx - s * 0.5},${cy - s * 1.3} ${cx},${cy - s * 0.4}
      C ${cx + s * 0.5},${cy - s * 1.3} ${cx + s},${cy - s * 0.4} ${cx},${cy + s * 0.35} Z`;
    return `<path class="obj" data-id="${node.id}" pointer-events="all" d="${d}" fill="${style.fill ?? "none"}" stroke="${style.stroke ?? "none"}" stroke-width="${numOf(style.strokeWidth ?? 0.02) * M}" />`;
  };

  if (typeof logModule === "function") logModule("'heart-module.js' (external) loaded and registered shape 'heart'");
})();
