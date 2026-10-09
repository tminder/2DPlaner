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
(function () {
  const core = window.PlanCore;
  if (!core) {
    console.error("wall-with-door-module.js: window.PlanCore not found — must load after the core script.");
    return;
  }

  // Runs before core ever renders (core.registerBeforeRender), so rendering itself needs
  // zero composition-specific code: the synthesized nodes are ordinary polyline Elements,
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

    const segment = (idSuffix, a, b, style, extra) => {
      let id = `${node.id}${idSuffix}`;
      if (usedIds.has(id)) {
        let n = 2;
        while (usedIds.has(`${id}${n}`)) n++;
        id = `${id}${n}`;
      }
      usedIds.add(id);
      return { id, parentId: node.id, children: [], props: { shape: "polyline", points: [a, b], style, ...extra } };
    };
    node.children.push(
      segment("_wall_a", from, doorStart, { stroke: "#444", strokeWidth: 0.1 }),
      segment("_door", doorStart, doorEnd,
        { stroke: "#8a6a42", strokeWidth: 0.1, strokeDash: "0.15,0.1" },
        { label: "Tür", show: "hover" }),
      segment("_wall_b", doorEnd, to, { stroke: "#444", strokeWidth: 0.1 }),
    );
  }

  function expandComposites(node, usedIds) {
    if (node.props.compose === "wallWithDoor") expandWallWithDoor(node, usedIds);
    for (const child of node.children) expandComposites(child, usedIds);
  }

  const unregister = core.registerBeforeRender((program) => {
    expandComposites(program.root, new Set(Object.keys(program.nodesById)));
  });
  core.registerModuleCleanup("wall-with-door-module.js", unregister);
})();
