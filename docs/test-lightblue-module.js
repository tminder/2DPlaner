// Test module, not shipped/trusted (not in TRUSTED_MODULES) and not linked from anywhere —
// colors the plan's background light blue. Exists purely to have a real, fetchable URL for
// trying out the untrusted-external-module confirm() flow (D-045): declare
// module "https://www.planagonia.com/app/test-lightblue-module.js" in any plan and the app
// should prompt before loading it, then paint the background light blue once accepted.
(function () {
  const core = window.PlanCore;
  if (!core) {
    console.error("test-lightblue-module.js: window.PlanCore not found — must load after the core script.");
    return;
  }

  // Same bounded-background approach as grid-module.js: 5x the fit-to-content box,
  // centered on it, comfortably covers this app's own bounded zoom-out plus realistic
  // panning, without needing to recompute on every pan/zoom frame.
  function handleRendered(prog) {
    const svgEl = core.rootEl.querySelector("svg");
    if (!svgEl) return;

    const vb = svgEl.viewBox.baseVal;
    const rectX = vb.x - 2 * vb.width;
    const rectY = vb.y - 2 * vb.height;
    const rectW = 5 * vb.width;
    const rectH = 5 * vb.height;

    svgEl.insertAdjacentHTML(
      "afterbegin",
      `<rect class="test-lightblue-bg" x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" fill="#cfe8fb" pointer-events="none" />`
    );
  }
  const unregisterOnRendered = core.onRendered(handleRendered);

  core.registerModuleCleanup("test-lightblue-module.js", () => {
    unregisterOnRendered();
  });
})();
