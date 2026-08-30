// Prototype 17: tests D-011/F-002's third, never-attempted module promise — a reusable,
// higher-level building block "composed from Element and Connection" (language.md's own
// illustrative wall-with-a-door example), offered by a module rather than the plan's
// author hand-writing every corner (D-018's pattern, as every shipped wall does today).
(function () {
  const core = window.PlanCore;
  if (!core) {
    console.error("wall-with-door-module.js: window.PlanCore not found — must load after the core script.");
    return;
  }

  // Synthesizes the same three-piece structure (wall_a / door / wall_b) the apartment
  // example's author currently writes by hand as four corner elements plus three
  // polylines (D-018) — from four plain parameters instead. Runs before core ever
  // renders (core.registerBeforeRender), so rendering itself needs zero
  // composition-specific code: the synthesized nodes are ordinary polyline Elements,
  // indistinguishable from ones a human/AI typed directly — this is the actual claim
  // being tested, not just "a module can draw something."
  //
  // Deliberately not attempted here: the composite's own `position` isn't factored into
  // its children's coordinates (from/to are treated as already being in the composite's
  // parent's local space, i.e. as if the composite itself always sits at [0,0]) — an
  // orthogonal, solvable detail left out to keep this test focused on the actual
  // question. Also not attempted: making any of the synthesized children draggable — a
  // drag on wall_a's endpoint has no source-text span to write back to (it was never
  // typed, only computed), so it would need backward-solving into the composite's own
  // from/to/doorAt/doorWidth instead of D-012's existing per-property machinery. That's a
  // genuinely separate, harder problem than expansion itself, surfaced by building this,
  // not solved by it — see this prototype's entry in planning/decisions.md.
  function expandWallWithDoor(node) {
    const from = node.props.from.map(core.numOf);
    const to = node.props.to.map(core.numOf);
    const doorAt = core.numOf(node.props.doorAt);
    const doorWidth = core.numOf(node.props.doorWidth);
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const doorStart = [from[0] + ux * doorAt, from[1] + uy * doorAt];
    const doorEnd = [from[0] + ux * (doorAt + doorWidth), from[1] + uy * (doorAt + doorWidth)];

    const segment = (idSuffix, a, b, style, extra) => ({
      id: `${node.id}${idSuffix}`, parentId: node.id, children: [],
      props: { shape: "polyline", points: [a, b], style, ...extra },
    });
    node.children.push(
      segment("_wall_a", from, doorStart, { stroke: "#444", strokeWidth: 0.1 }),
      segment("_door", doorStart, doorEnd,
        { stroke: "#8a6a42", strokeWidth: 0.1, strokeDash: "0.15,0.1" },
        { label: "Tür", show: "hover" }),
      segment("_wall_b", doorEnd, to, { stroke: "#444", strokeWidth: 0.1 }),
    );
  }

  function expandComposites(node) {
    if (node.props.compose === "wallWithDoor") expandWallWithDoor(node);
    for (const child of node.children) expandComposites(child);
  }

  core.registerBeforeRender((program) => expandComposites(program.root));
})();
