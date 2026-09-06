// Hierarchy/layers panel (D-112): renders the full element tree into #hierarchy-panel — a
// stable, always-present slot core itself provides (docs/index.html), the same relationship
// core has with .viewer-pane except a module fills this one instead of core's own renderer.
// Lets a viewer show/hide any subtree (writes/clears `hidden`, a new core-level rendering
// property core's own renderShape now checks) and reorder siblings (swaps two adjacent
// declarations) — the plan-editing half of this feature; core.rootEl's own open/closed
// toggle for the panel itself lives in docs/index.html, not here (session UI state, not
// plan content, see that file's own comment next to the header button).
(function () {
  const core = window.PlanCore;
  if (!core) {
    console.error("hierarchy-module.js: window.PlanCore not found — must load after the core script.");
    return;
  }

  const panelEl = document.getElementById("hierarchy-panel");
  if (!panelEl) return; // no slot on this page at all (a read-only embed, D-024) — nothing to do

  document.getElementById("hierarchy-module-style")?.remove();
  const styleEl = document.createElement("style");
  styleEl.id = "hierarchy-module-style";
  document.head.appendChild(styleEl);
  styleEl.textContent = `
    #hierarchy-panel { font-family: system-ui, sans-serif; font-size: 12.5px; padding: 0.5rem; }
    #hierarchy-panel ul { list-style: none; margin: 0; padding-left: 1.1rem; }
    #hierarchy-panel > ul { padding-left: 0; }
    .hier-row { display: flex; align-items: center; gap: 0.2rem; padding: 0.15rem 0.2rem; border-radius: 4px; }
    .hier-row:hover { background: #f0f4fa; }
    .hier-row button { border: none; background: none; cursor: pointer; font: inherit;
      padding: 0.1rem 0.3rem; border-radius: 3px; line-height: 1.4; }
    .hier-row button:hover:not(:disabled) { background: #dde6f2; }
    .hier-row button:disabled { opacity: 0.3; cursor: default; }
    .hier-caret { width: 1.2em; flex: none; text-align: center; }
    .hier-caret.leaf { visibility: hidden; }
    .hier-eye { flex: none; }
    .hier-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; padding: 0 0.15rem; }
    .hier-row[data-hidden-effective="true"] .hier-label { color: #999; font-style: italic; }
    .hier-move { flex: none; font-size: 0.85em; }
  `;

  let program = null;
  // Which parent ids are currently collapsed -- session-only UI convenience, not plan
  // content (an editing aid like undo history's own in-memory array, not something a
  // reload or another viewer of the same saved plan should be expected to see).
  const collapsed = new Set();

  function displayName(node) { return node.props.label ?? node.id; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  }

  // ---------- Small, self-contained text-splice helpers — a second, deliberate instance
  // of the same private-to-one-module duplication interactivity-module.js already has
  // with core (S-023's own precedent for annotations-module.js/core geometry), not a
  // cross-file refactor bundled into this feature. Tracked as its own tech-debt entry. ----------
  function toLineSpan(text, start, end) {
    while (start > 0 && text[start - 1] !== "\n") start--;
    while (end < text.length && text[end] !== "\n") end++;
    if (text[end] === "\n") end++;
    return { start, end };
  }

  function applyEditsDescending(text, edits) {
    let out = text;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    return out;
  }

  function withParsedSource(action) {
    const text = core.sourceEl.value;
    let base;
    try { base = core.parseExpanded(text); } catch (e) { return; }
    action(text, base);
  }

  function commitSourceEdit(newText) {
    core.sourceEl.value = newText;
    core.rerender({ preserveViewBox: true });
    core.commitUndoStep();
  }

  // This node's own `key: ...` line, excluding any child's same-named property — the exact
  // scan interactivity-module.js already established for placement/flush.
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

  function afterHeaderLine(text, node) {
    let i = node.start;
    while (i < node.end && text[i] !== "\n") i++;
    return i < node.end ? i + 1 : i;
  }

  function toggleHidden(nodeId) {
    withParsedSource((text, base) => {
      const node = base.nodesById[nodeId];
      if (!node) return;
      const turningOn = node.props.hidden !== true;
      const existing = findOwnPropertyLine(text, node, "hidden");
      let edits;
      if (turningOn) {
        if (existing) edits = [{ start: existing.start, end: existing.end, text: `${existing.indent}hidden: true` }];
        else edits = [{ start: afterHeaderLine(text, node), end: afterHeaderLine(text, node), text: `${lineIndentAt(text, node.start)}  hidden: true\n` }];
      } else if (existing) {
        const span = toLineSpan(text, existing.start, existing.end);
        edits = [{ start: span.start, end: span.end, text: "" }];
      } else {
        return; // already off, nothing to clear
      }
      commitSourceEdit(applyEditsDescending(text, edits));
    });
  }

  // Swaps two *adjacent* siblings' own declaration order — simpler than interactivity-
  // module.js's own reorderSibling (cut-and-reinsert at the very front/back): since the
  // two are already next to each other, this is a straight two-way text swap.
  function moveSiblingAdjacent(nodeId, arrayDelta) {
    withParsedSource((text, base) => {
      const node = base.nodesById[nodeId];
      const parent = node?.parentId ? base.nodesById[node.parentId] : null;
      if (!parent) return;
      const idx = parent.children.indexOf(node);
      const swapIdx = idx + arrayDelta;
      if (swapIdx < 0 || swapIdx >= parent.children.length) return;
      const other = parent.children[swapIdx];

      const [first, second] = idx < swapIdx ? [node, other] : [other, node];
      const firstSpan = toLineSpan(text, first.start, first.end);
      const secondSpan = toLineSpan(text, second.start, second.end);
      const firstText = text.slice(firstSpan.start, firstSpan.end);
      const secondText = text.slice(secondSpan.start, secondSpan.end);

      commitSourceEdit(applyEditsDescending(text, [
        { start: firstSpan.start, end: firstSpan.end, text: secondText },
        { start: secondSpan.start, end: secondSpan.end, text: firstText },
      ]));
    });
  }

  // Siblings listed in *reverse* declaration order — the last-declared child (topmost
  // paint order, D-110) shown first/topmost, so "the row at the top is the thing in
  // front" reads the way every layers panel's own convention already does (Photoshop/
  // Illustrator/Figma), matching the request's own framing directly. Button semantics
  // follow from this: "▲" (toward the top of the list = more toward the front) swaps with
  // the next-*higher*-index array neighbor; "▼" with the next-*lower*-index one.
  function rowMarkup(node, hiddenAncestor) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const ownHidden = node.props.hidden === true;
    const effectiveHidden = hiddenAncestor || ownHidden;

    const parent = node.parentId ? program.nodesById[node.parentId] : null;
    let moveButtons = "";
    if (parent) {
      const idx = parent.children.indexOf(node);
      const canMoveUp = idx < parent.children.length - 1;
      const canMoveDown = idx > 0;
      moveButtons = `
        <button class="hier-move" data-action="move-up" data-node-id="${node.id}" title="Bring forward" ${canMoveUp ? "" : "disabled"}>▲</button>
        <button class="hier-move" data-action="move-down" data-node-id="${node.id}" title="Send backward" ${canMoveDown ? "" : "disabled"}>▼</button>`;
    }

    const caret = hasChildren
      ? `<button class="hier-caret" data-action="toggle-collapse" data-node-id="${node.id}">${isCollapsed ? "▸" : "▾"}</button>`
      : `<span class="hier-caret leaf">▾</span>`;

    const row = `<div class="hier-row" data-hidden-effective="${effectiveHidden}">
      ${caret}
      <button class="hier-eye" data-action="toggle-hidden" data-node-id="${node.id}" title="${ownHidden ? "Show" : "Hide"}">${ownHidden ? "🚫" : "👁"}</button>
      <span class="hier-label">${escapeHtml(displayName(node))}</span>
      ${moveButtons}
    </div>`;

    let childrenMarkup = "";
    if (hasChildren && !isCollapsed) {
      const reversed = [...node.children].reverse();
      childrenMarkup = `<ul>${reversed.map((c) => rowMarkup(c, effectiveHidden)).join("")}</ul>`;
    }
    return `<li>${row}${childrenMarkup}</li>`;
  }

  function renderPanel() {
    if (!program) return;
    panelEl.innerHTML = `<ul>${rowMarkup(program.root, false)}</ul>`;
  }

  function handlePanelClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const { action, nodeId } = btn.dataset;
    if (action === "toggle-collapse") {
      if (collapsed.has(nodeId)) collapsed.delete(nodeId); else collapsed.add(nodeId);
      renderPanel();
    } else if (action === "toggle-hidden") {
      toggleHidden(nodeId);
    } else if (action === "move-up") {
      moveSiblingAdjacent(nodeId, 1);
    } else if (action === "move-down") {
      moveSiblingAdjacent(nodeId, -1);
    }
  }
  panelEl.addEventListener("click", handlePanelClick);

  function handleRendered(prog) {
    program = prog;
    renderPanel();
  }
  const unregisterOnRendered = core.onRendered(handleRendered);

  core.registerModuleCleanup("hierarchy-module.js", () => {
    unregisterOnRendered();
    panelEl.removeEventListener("click", handlePanelClick);
    panelEl.innerHTML = "";
    styleEl.remove();
  });
})();
