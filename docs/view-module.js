// View module (D-198): zoom, pan, pinch-to-zoom, the scale bar, and the Fit button -- split
// out of interactivity-module.js, which used to own all of this alongside drag/select/
// connect/the context menu. Requested directly ("fit shouldn't be part of interactivity
// module"): camera/viewport concerns and editing concerns are different things that happened
// to share one file, not one concern that happens to need splitting.
//
// viewState/lastCoreFit (the current pan/zoom override, and core's own last fit-to-content
// box) turned out to be the one truly indivisible piece -- every camera gesture reads and
// writes the *same* value, so splitting any one of them into a separate module without
// moving all of them would leave two independent, driftable copies of "where the camera is"
// (exactly the problem Core Aim 1 warns about). This module therefore owns pan, wheel-zoom,
// pinch-zoom, the scale bar, and Fit together, as one cluster.
//
// Known, accepted tradeoff (confirmed directly before building this): today, a second touch
// landing mid-gesture auto-cancels whatever one-touch drag/resize/marquee gesture
// interactivity-module.js had in progress, and takes over as a pinch. The two modules no
// longer share gesture state to make that handoff possible -- a second finger landing now
// just starts an independent pinch here, while interactivity-module.js's own gesture (if
// any) simply holds in place (not cancelled, just not reacting to movement) until back down
// to one touch, rather than being cancelled outright. A real behavior change, not hidden:
// documented here, in language-spec/modules.md, and as a new open question
// (planning/open-questions.md) for whether it's worth a dedicated cross-module hook later.
(function () {
  const core = window.PlanCore;
  if (!core) {
    console.error("view-module.js: window.PlanCore not found — must load after the core script.");
    return;
  }

  function injectStyles(styleEl) {
    styleEl.textContent = `
      #plan-root svg { cursor: grab; } /* empty canvas: click-drag pans */
      #plan-root.view-panning svg { cursor: grabbing; }

      #interactivity-scale-bar { position: absolute; right: 10px; bottom: 10px;
        display: flex; flex-direction: column; align-items: center; pointer-events: none;
        font-family: system-ui, sans-serif; font-size: 11px; color: #333; }
      #interactivity-scale-bar .bar { height: 6px; border-left: 1.5px solid #333;
        border-right: 1.5px solid #333; border-bottom: 1.5px solid #333; }
      #interactivity-scale-bar .label { margin-top: 2px; background: rgba(255,255,255,0.85);
        padding: 0 4px; border-radius: 2px; }
    `;
  }

  // Belt-and-braces, same reasoning interactivity-module.js's own startup already uses: start
  // from a clean slate rather than risk a duplicate if a stale element somehow survived.
  document.getElementById("view-module-style")?.remove();
  document.getElementById("interactivity-scale-bar")?.remove();

  const styleEl = document.createElement("style");
  styleEl.id = "view-module-style";
  document.head.appendChild(styleEl);
  injectStyles(styleEl);

  const scaleBarEl = document.createElement("div");
  scaleBarEl.id = "interactivity-scale-bar";
  scaleBarEl.innerHTML = `<div class="bar"></div><div class="label"></div>`;
  core.rootEl.appendChild(scaleBarEl);
  const scaleBarBarEl = scaleBarEl.querySelector(".bar");
  const scaleBarLabelEl = scaleBarEl.querySelector(".label");

  // D-156: #header-fit-btn is a stable slot core always provides (docs/index.html's own
  // header), unhidden here rather than created fresh -- same shape the scale bar above and
  // every other module-owned header toggle already use.
  const fitBtnEl = document.getElementById("header-fit-btn");
  if (fitBtnEl) fitBtnEl.hidden = false;

  // viewState: the viewBox {x,y,width,height} currently applied on top of whatever core just
  // rendered, or null to mean "use core's own fit as-is". lastCoreFit: core's fit box as of
  // the most recent render, captured before viewState is applied over it -- needed both to
  // detect "core just re-fit the content" (compared against the previous value, see
  // restoreViewBox below) and as the stable reference to clamp zoom range against.
  let viewState = null;
  let lastCoreFit = null;
  let canvasDrag = null; // pointerdown on empty space: pending pan-or-click
  const activeTouches = new Map(); // pointerId -> {x, y}, this module's own independent copy
  let pinch = null; // {startDist, startMid: {x,y}, startView: {x,y,width,height}}

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
  // instead of a round number.
  const SCALE_BAR_STEPS_FT = [1 / 12, 2 / 12, 3 / 12, 6 / 12, 1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000, 5000, 10000, 20000];
  const SCALE_BAR_MAX_PX = 140;

  function updateScaleBar() {
    const pxPerMeter = currentPxPerMeter();
    if (!pxPerMeter) return;
    // F-013: imperial reads its own step table in feet and labels in feet/inches -- a
    // compact single-unit label ("15 ft"/"6 in"), not core.formatMeasurement's combined
    // "5' 6.3"" annotation style, built for a different UI context.
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
  // silently drift to different limits.
  function zoomWidthBounds() {
    return { minWidth: lastCoreFit.width / 8, maxWidth: lastCoreFit.width * 2 };
  }

  // Zoom relative to the cursor: the viewBox point currently under the pointer stays under
  // the pointer after the zoom, matching the zoom-to-cursor behavior any map/canvas tool
  // has trained people to expect.
  function handleWheel(e) {
    const svg = core.rootEl.querySelector("svg");
    if (!svg || !lastCoreFit) return;
    e.preventDefault();
    const current = viewState || lastCoreFit;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(rect.width / current.width, rect.height / current.height);
    // The same `xMidYMid meet` letterboxing offset accounted for everywhere else in this
    // module — without it the point kept "under the cursor" during a zoom is actually
    // offset from the real cursor whenever the viewer pane's aspect ratio doesn't match the
    // viewBox's, which is close to always.
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
    const newX = cursorVbX - (e.clientX - rect.left - offsetX) / newScale;
    const newY = cursorVbY - (e.clientY - rect.top - offsetY) / newScale;

    viewState = { x: newX, y: newY, width: newWidth, height: newHeight };
    svg.setAttribute("viewBox", `${newX} ${newY} ${newWidth} ${newHeight}`);
    updateScaleBar();
  }

  // F-036: pinch-to-zoom — touch's own equivalent of handleWheel above, driven by two
  // fingers instead of a wheel event.
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

  function handleFitClick() {
    viewState = null;
    core.rerender();
  }

  function handlePointerDown(e) {
    if (e.button !== 0) return; // right-click only opens the context menu elsewhere
    if (e.target.closest("button")) return;

    if (e.pointerType === "touch") {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.size === 2) {
        canvasDrag = null;
        pinch = { startDist: pinchDistance(), startMid: pinchMidpoint(), startView: viewState || lastCoreFit };
        return;
      }
      if (activeTouches.size > 2) return; // a third finger: stay in the existing 2-finger pinch
      if (pinch) return; // already mid-pinch from an earlier 2-finger landing
    }

    // Anything with a [data-id] (a shape), a resize handle, or Alt held (F-047's marquee) is
    // not this module's concern — interactivity-module.js's own listener handles those.
    // Empty canvas, plain pointer: could be a plain click or the start of a pan, decided by
    // whether the pointer actually moves before release (handlePointerMove/Up below).
    if (e.target.closest("[data-id]") || e.target.closest(".resize-handle") || e.altKey) return;
    e.preventDefault();
    canvasDrag = { startClientX: e.clientX, startClientY: e.clientY, moved: false,
      startView: viewState || lastCoreFit };
  }

  function handlePointerMove(e) {
    if (e.pointerType === "touch" && activeTouches.has(e.pointerId)) {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch) { handlePinchMove(); return; }
    if (!canvasDrag) return;
    const svg = core.rootEl.querySelector("svg");
    if (!svg) return;
    const dxScreen = e.clientX - canvasDrag.startClientX;
    const dyScreen = e.clientY - canvasDrag.startClientY;
    if (!canvasDrag.moved && Math.hypot(dxScreen, dyScreen) > 3) {
      canvasDrag.moved = true;
      core.rootEl.classList.add("view-panning");
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
  }

  function handlePointerUp(e) {
    core.rootEl.classList.remove("view-panning");
    if (e.pointerType === "touch") activeTouches.delete(e.pointerId);
    if (pinch) {
      // Ends the moment either finger lifts — deliberately not handed off into a live
      // single-finger pan with whichever touch remains.
      if (activeTouches.size < 2) pinch = null;
      return;
    }
    canvasDrag = null;
  }

  core.rootEl.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  core.rootEl.addEventListener("wheel", handleWheel, { passive: false });
  fitBtnEl?.addEventListener("click", handleFitClick);

  // Resize can change the SVG's on-screen size without any render or zoom/pan action of
  // ours (window resize, or the code pane being resized) — the scale bar (and the drag
  // scale interactivity-module.js's own currentPxPerMeter copy reads) both depend on that
  // size, so both need to stay current when it changes for reasons neither of us triggered.
  const resizeObserver = new ResizeObserver(() => updateScaleBar());
  resizeObserver.observe(core.rootEl);

  // core just replaced #plan-root's innerHTML, so svgEl's viewBox is core's own fresh
  // fit-to-content box, not yet touched by any zoom/pan — capture it before applying
  // viewState over it. If it differs from last time, core actually re-fit the content, so
  // any existing zoom/pan is relative to a "home" that no longer exists — drop it and start
  // fresh from the new fit. If it's unchanged (e.g. a drag's preserveViewBox:true, or an
  // edit that happened not to change the bounding box), keep whatever view the user had.
  function restoreViewBox(svgEl) {
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
  }

  const unregisterOnRendered = core.onRendered((prog, result) => {
    // core's rerender() just replaced #plan-root's *entire* innerHTML with the fresh SVG,
    // which silently destroys the scale bar too, not just old shape markup -- it's a plain
    // child of the same container, appended once at module load, so it needs re-adding
    // after every single render. appendChild moves an already-existing node rather than
    // erroring, so this is safe to call unconditionally.
    core.rootEl.appendChild(scaleBarEl);
    const svgEl = core.rootEl.querySelector("svg");
    if (!svgEl) return;
    restoreViewBox(svgEl);
  });

  core.registerModuleCleanup("view-module.js", () => {
    unregisterOnRendered();
    resizeObserver.disconnect();
    core.rootEl.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    core.rootEl.removeEventListener("wheel", handleWheel);
    fitBtnEl?.removeEventListener("click", handleFitClick);
    if (fitBtnEl) fitBtnEl.hidden = true;
    core.rootEl.classList.remove("view-panning");
    scaleBarEl.remove();
    styleEl.remove();
    viewState = null;
    lastCoreFit = null;
    canvasDrag = null;
    pinch = null;
    activeTouches.clear();
  });
})();
