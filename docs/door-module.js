// D-011/F-002's third module promise: a reusable, higher-level building block "composed
// from Element and Connection" (language.md's own long-standing illustrative example) —
// one compact element instead of the four corner elements plus three polylines D-018's
// shared-corner pattern needs for the same visual (exactly what every shipped wall/door
// in this app's own apartment example does today, by hand).
//
//   element w { compose: "wallWithDoor" from: [0m,0m] to: [5m,0m] doorAt: 2m doorWidth: 0.9m }
//
// First validated as Prototypes/17-module-composition/ (rendering only, D-046); this is
// that same expansion logic, ported into the real product, plus the drag-editability half
// D-046 explicitly left unattempted — see interactivity-module.js's own composeDragEdits
// for that part.
//
// F-054/D-199: renamed from wall-with-door-module.js. The old door segment was just a
// dashed polyline across the gap — "makes little sense," reported directly, nothing that
// actually reads as a door the way a real floor plan does. Two changes, requested together:
// (1) the door segment now renders the standard architectural symbol — a quarter-circle
// swing arc from the hinge, not a dashed line — via a new `doorSwing` shape kind
// (`window.PlanModules.doorSwing`, see "Adding a shape kind" in modules.md) shared by both
// this composite's own door segment and (2) a new standalone, freely placeable door element
// (`shape: "doorSwing"` directly, no composition needed at all) that doesn't have to sit
// inside a `wallWithDoor` — registered into the header's own "New Element" flyout via the
// new `core.registerElementPreset` hook (D-199), the same way `registerHeaderAction`
// already lets a module add a header button.
(function () {
  const core = window.PlanCore;
  if (!core) {
    console.error("door-module.js: window.PlanCore not found — must load after the core script.");
    return;
  }

  // ---------- The doorSwing shape: a quarter-circle swing arc from a hinge point ----------
  // Shared by both the wallWithDoor composite's own door segment (below) and the standalone
  // door element — the composite just computes `rotation` from its own wall direction
  // instead of an author-written one, everything else about the geometry is identical.
  // Properties read directly off the node (no core support needed, see checkUnrecognizedShapes/
  // checkUnsupportedProperties in interactivity-module.js, both already skip any shape with a
  // matching `window.PlanModules` entry):
  //   position  — the hinge point (where the door is "attached"), same as any other element.
  //   width     — the door leaf's own width, meters.
  //   rotation  — degrees, clockwise, matching rect's own D-141 convention: the direction
  //               the door opening runs in when closed (0° = along +x).
  //   swing     — "left" (default) or "right": which side of the opening direction the leaf
  //               swings open toward (and the arc bulges toward).
  // Drawn as one <path>: a straight line from the hinge to the leaf's open-position endpoint,
  // then a radius-`width` arc back to the closed-position endpoint — exactly the two-part
  // symbol every real architectural floor plan uses, not an approximation of it.
  function doorSwingMarkup(node, ownAbs, M, { numOf, idAttr }) {
    const width = numOf(node.props.width ?? 0.9);
    const deg = numOf(node.props.rotation ?? 0);
    const rad = (deg * Math.PI) / 180;
    const ux = Math.cos(rad), uy = Math.sin(rad);
    const swingRight = node.props.swing === "right";
    // Perpendicular to (ux,uy), rotated toward the chosen swing side.
    const px = swingRight ? uy : -uy, py = swingRight ? -ux : ux;
    const hx = ownAbs[0] * M, hy = ownAbs[1] * M;
    const closedX = hx + ux * width * M, closedY = hy + uy * width * M;
    const openX = hx + px * width * M, openY = hy + py * width * M;
    const r = width * M;
    // SVG's sweep-flag picks which of the two 90° arcs between open/closed to draw -- the
    // one that actually bulges toward the chosen swing side rather than away from it.
    // Verified live rather than derived purely on paper (SVG's y-down coordinate system
    // makes the usual "clockwise/counterclockwise" intuition easy to get backwards).
    const sweepFlag = swingRight ? 1 : 0;
    return `<path class="obj" ${idAttr} pointer-events="stroke" d="M ${hx},${hy} L ${openX},${openY} A ${r},${r} 0 0 ${sweepFlag} ${closedX},${closedY}" fill="none" stroke="#8a6a42" stroke-width="${0.04 * M}" />`;
  }
  window.PlanModules = window.PlanModules || {};
  window.PlanModules.doorSwing = doorSwingMarkup;

  // ---------- The wallWithDoor composite ----------
  // Runs before core ever renders (core.registerBeforeRender), so rendering itself needs
  // zero composition-specific code: the synthesized nodes are ordinary Elements,
  // indistinguishable from ones typed directly — this is the actual claim being tested,
  // not just "a module can draw something."
  //
  // S-028, investigated and found not to be a real bug (D-190): this comment used to say
  // the composite's own `position` "isn't factored into its children's coordinates,"
  // self-admitted as broken for a nested, non-zero `position`. Checked live, including two
  // levels of ancestor position stacked on top of the composite's own: it already comes
  // out exactly right with no special-casing at all -- `from`/`to` below become the
  // synthesized children's own literal points completely unmodified, and
  // core.computePositions already adds back every ancestor's own position (the composite's
  // included) when resolving them, the same as it would for any hand-written polyline.
  // S-027: `${node.id}${idSuffix}` isn't checked against any real sibling id before use --
  // in the rare case an author's own plan happens to declare one that collides, this would
  // otherwise silently corrupt nodesById's own last-writer-wins lookup, the exact risk
  // F-028 describes for hand-authored duplicates (and this path is exempt from the
  // load-time duplicate-id check, since these nodes are synthesized after parsing, not
  // part of the parsed source). Disambiguated the same way uniqueId
  // (interactivity-module.js) already does elsewhere -- `id`, then `id2`, `id3`, ... --
  // against `usedIds`, threaded through the whole expansion walk so one composite's own
  // synthesized ids are visible to the next one too, not just the plan's original ids.
  function expandWallWithDoor(node, usedIds) {
    const from = node.props.from.map(core.numOf);
    const to = node.props.to.map(core.numOf);
    const doorAt = core.numOf(node.props.doorAt);
    const doorWidth = core.numOf(node.props.doorWidth);
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const doorStart = [from[0] + ux * doorAt, from[1] + uy * doorAt];
    const doorEnd = [from[0] + ux * (doorAt + doorWidth), from[1] + uy * (doorAt + doorWidth)];
    const angleDeg = (Math.atan2(uy, ux) * 180) / Math.PI;

    const uniqueChildId = (idSuffix) => {
      let id = `${node.id}${idSuffix}`;
      if (usedIds.has(id)) {
        let n = 2;
        while (usedIds.has(`${id}${n}`)) n++;
        id = `${id}${n}`;
      }
      usedIds.add(id);
      return id;
    };
    const wallSegment = (idSuffix, a, b) => ({
      id: uniqueChildId(idSuffix), parentId: node.id, children: [],
      props: { shape: "polyline", points: [a, b], style: { stroke: "#444", strokeWidth: 0.1 } },
    });
    // F-054/D-199: the door segment itself is now a doorSwing node, hinged at doorStart --
    // composeDragEdits (interactivity-module.js) still matches this child by its own
    // "_door" id suffix, unchanged, so dragging it to slide the door along the wall keeps
    // working exactly as before; only what it *renders as* changed.
    const doorSegment = {
      id: uniqueChildId("_door"), parentId: node.id, children: [],
      props: { shape: "doorSwing", position: doorStart, width: doorWidth, rotation: angleDeg,
        swing: node.props.swing === "right" ? "right" : "left", label: "Tür", show: "hover" },
    };
    node.children.push(wallSegment("_wall_a", from, doorStart), doorSegment, wallSegment("_wall_b", doorEnd, to));
  }

  function expandComposites(node, usedIds) {
    if (node.props.compose === "wallWithDoor") expandWallWithDoor(node, usedIds);
    for (const child of node.children) expandComposites(child, usedIds);
  }

  const unregisterBeforeRender = core.registerBeforeRender((program) => {
    expandComposites(program.root, new Set(Object.keys(program.nodesById)));
  });

  // ---------- "New Element" registration (D-199) ----------
  // The standalone door: shape: "doorSwing" directly on an ordinary element, no composition
  // needed at all -- unlike wallWithDoor, a lone door has nothing else to synthesize. Its
  // `position` is a real, author-editable literal (unlike the composite's own synthesized
  // doorSegment above), so it drags/selects through the exact same generic path any other
  // element with a position does -- no composeDragEdits entry needed for it.
  const preset = core.registerElementPreset({
    idBase: "door",
    label: "Door",
    swatchHtml: '<span class="preset-swatch" style="background:#c9a876;border-color:#8a6a42;border-radius:0 100% 0 0;"></span>',
    buildElementText(id, indent, unit) {
      const inner = indent + "  ";
      return [
        `${indent}element ${id} {`,
        `${inner}shape: "doorSwing"`,
        `${inner}position: [0.3${unit}, 0.3${unit}]`,
        `${inner}width: 0.9${unit}`,
        `${inner}rotation: 0`,
        `${inner}swing: "left"`,
        `${indent}}`,
      ].join("\n");
    },
  });

  core.registerModuleCleanup("door-module.js", () => {
    unregisterBeforeRender();
    preset.unregister();
    delete window.PlanModules.doorSwing;
  });
})();
