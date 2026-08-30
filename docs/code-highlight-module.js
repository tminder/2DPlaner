// Code highlighting module: syntax colors plus marking the selected element's own span in
// the source textarea. A plain <textarea> can't color individual characters, so this
// overlays an invisible textarea (still fully native — typing, caret, undo, native text
// selection, all untouched) on top of a colored <pre> backdrop kept in exact visual sync.
// The standard lightweight alternative to a real code-editor dependency, matching D-034's
// "zero dependencies, plain static files" scope — no library, ~150 lines.
//
// Two things needed from elsewhere, both already exposed for exactly this kind of module:
// core.tokenize() (added alongside this module) for coloring, and interactivity-module.js's
// core.rootEl.dataset.selectedId (a loose, optional signal it already sets on every render)
// for which span to mark. Neither required a new API shaped specifically for this — the
// same story as D-039/D-041: a module reusing what D-031's core/module split already
// exposes, not a reason to grow it further.
(function () {
  const core = window.PlanCore;
  if (!core) {
    console.error("code-highlight-module.js: window.PlanCore not found — must load after the core script.");
    return;
  }
  const textarea = core.sourceEl;
  if (!textarea) return; // no code editor on this page at all (a read-only embed, D-024) — nothing to overlay

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  }

  // Belt-and-braces, matching the other modules' own cleanup precedent: unwrap the textarea
  // back out from underneath a leftover wrapper before doing anything else.
  document.getElementById("code-highlight-style")?.remove();
  const stale = document.getElementById("code-highlight-wrap");
  if (stale && stale.contains(textarea)) {
    stale.parentNode.insertBefore(textarea, stale);
    stale.remove();
  }

  const styleEl = document.createElement("style");
  styleEl.id = "code-highlight-style";
  styleEl.textContent = `
    #code-highlight-wrap { position: relative; }
    /* An explicit background here, not left transparent-through-to-the-page — the wrap
       otherwise shows whatever's behind it (docs/index.html's own #f4f4f2 page background),
       which the textarea's own visible border/radius were never designed against, and
       which made a pale highlight color harder to read than intended. */
    #code-highlight-backdrop { position: absolute; inset: 0; margin: 0; overflow: hidden;
      pointer-events: none; white-space: pre-wrap; word-break: break-word; background: #fff; }
    #code-highlight-wrap textarea { position: relative; background: transparent; color: transparent;
      caret-color: #222; }
    .tok-keyword { color: #8250df; font-weight: 600; }
    .tok-string { color: #0a7d3c; }
    .tok-number { color: #b35900; }
    .tok-comment { color: #8a8a8a; font-style: italic; }
    .tok-ident { color: #1a4b8c; }
    .tok-selected { background: #ffd54a; border-radius: 2px; box-shadow: 0 0 0 1px #e0ad00; }
  `;
  document.head.appendChild(styleEl);

  // Move the (otherwise untouched) textarea into a wrapper that takes over its own flex
  // sizing, with the colored backdrop as a same-size sibling positioned behind it.
  //
  // flexGrow/Shrink/Basis are copied from the *computed* style since docs/index.html's own
  // `flex: 0 0 420px` is already a fixed value — but height stays a literal "100%" rather
  // than copying getComputedStyle's *resolved pixel* height: that would freeze the wrapper
  // at whatever height the page happened to be at load time, no longer tracking .layout's
  // real height (and thus the viewer pane beside it) across a window resize.
  const wrap = document.createElement("div");
  wrap.id = "code-highlight-wrap";
  const outerStyle = getComputedStyle(textarea);
  wrap.style.flexGrow = outerStyle.flexGrow;
  wrap.style.flexShrink = outerStyle.flexShrink;
  wrap.style.flexBasis = outerStyle.flexBasis;
  wrap.style.height = "100%";
  textarea.parentNode.insertBefore(wrap, textarea);
  const backdrop = document.createElement("pre");
  backdrop.id = "code-highlight-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  wrap.appendChild(backdrop);
  wrap.appendChild(textarea);
  textarea.style.flex = "1 1 auto";
  textarea.style.width = "100%";
  textarea.style.height = "100%";

  // The backdrop's box has to match the textarea's exactly (font, padding, border) or
  // every wrapped line drifts out of alignment — read it from the textarea's own computed
  // style rather than hardcoding a second copy of docs/index.html's CSS that could
  // silently drift out of sync with it later. Border color is deliberately not copied
  // (kept transparent) — the width/style still offset the padding correctly, but drawing
  // the same visible border twice, once from each element, risks a faint double edge.
  function syncBoxMetrics() {
    const s = getComputedStyle(textarea);
    backdrop.style.fontFamily = s.fontFamily;
    backdrop.style.fontSize = s.fontSize;
    backdrop.style.lineHeight = s.lineHeight;
    backdrop.style.letterSpacing = s.letterSpacing;
    backdrop.style.padding = s.padding;
    backdrop.style.borderWidth = s.borderWidth;
    backdrop.style.borderStyle = s.borderStyle;
    backdrop.style.borderColor = "transparent";
    backdrop.style.borderRadius = s.borderRadius; // otherwise the backdrop's own white background shows square corners poking out past the textarea's rounded ones
    backdrop.style.boxSizing = s.boxSizing;
    backdrop.style.tabSize = s.tabSize;
  }
  syncBoxMetrics();

  function tokenClass(t) {
    if (t.type === "STRING") return "string";
    if (t.type === "NUMBER") return "number";
    if (t.type === "ELEMENT" || t.type === "MODULE" || t.type === "CONNECTION" ||
        t.type === "SETTINGS" || t.type === "TRUE" || t.type === "FALSE") return "keyword";
    if (t.type === "IDENT") return "ident";
    return null; // punctuation — left uncolored, reads fine as plain text
  }

  // core.tokenize() never emits a token for whitespace or a comment (both are skipped
  // during lexing) — the gaps between real tokens are reconstructed here from the raw
  // source instead, so the backdrop's text stays character-for-character identical to the
  // textarea's (required for the overlay to stay aligned), with a comment's own // to
  // end-of-line colored separately from plain whitespace within those gaps.
  //
  // Every token boundary and the selection's own start/end become "cut points" so no
  // single slice ever straddles two different tokens or crosses into/out of the selected
  // range — each slice is then either entirely one token or entirely a gap, and entirely
  // inside or outside the selection, so its classes can be decided once per slice.
  function renderHighlighted(text, tokens, selRange) {
    const real = tokens.filter((t) => t.type !== "EOF");
    const cuts = new Set([0, text.length]);
    for (const t of real) { cuts.add(t.start); cuts.add(t.end); }
    if (selRange) { cuts.add(selRange.start); cuts.add(selRange.end); }
    const sorted = [...cuts].sort((a, b) => a - b);

    let ti = 0, html = "";
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i], end = sorted[i + 1];
      if (start === end) continue;
      while (ti < real.length && real[ti].end <= start) ti++;
      const tok = ti < real.length && real[ti].start <= start && end <= real[ti].end ? real[ti] : null;
      const inSelection = !!selRange && start >= selRange.start && end <= selRange.end;
      let escaped = escapeHtml(text.slice(start, end));
      if (!tok) escaped = escaped.replace(/\/\/[^\n]*/g, (m) => `<span class="tok-comment">${m}</span>`);
      const cls = tok ? tokenClass(tok) : null;
      const classes = [cls ? `tok-${cls}` : null, inSelection ? "tok-selected" : null].filter(Boolean);
      html += classes.length ? `<span class="${classes.join(" ")}">${escaped}</span>` : escaped;
    }
    return html;
  }

  // Kept from the last *successful* parse (core.onRendered only fires on one, see
  // docs/index.html's rerender()) — a stale program during an in-progress edit is a
  // reasonable fallback for "which span is selected," since selection itself can't have
  // changed without a successful render happening first.
  let lastProgram = null;

  function currentSelectionRange() {
    const id = core.rootEl.dataset.selectedId;
    if (!id || !lastProgram) return null;
    const node = lastProgram.nodesById[id];
    return node ? { start: node.start, end: node.end } : null;
  }

  let lastSelectedId; // undefined until the first render — see the scroll-into-view note below

  function refresh() {
    const text = textarea.value;
    let tokens;
    try {
      tokens = core.tokenize(text);
    } catch (e) {
      backdrop.textContent = text; // an invalid character mid-edit — plain uncolored text beats nothing
      return;
    }
    backdrop.innerHTML = renderHighlighted(text, tokens, currentSelectionRange());
    // A <pre> needs a trailing blank line to actually render a trailing newline — without
    // this the backdrop comes up one line short of the textarea at the very end of the text.
    if (text.endsWith("\n")) backdrop.innerHTML += " ";

    // Scroll only when the selection actually *changed* — every render, not just a
    // selection change, reaches this same function (a drag's own repeated re-renders
    // included), and re-scrolling the code pane on every drag tick of an already-selected
    // element would fight the user rather than help them.
    //
    // A first attempt hand-computed the target scrollTop from the highlight span's own
    // offsetTop/offsetHeight — reported not to actually move the scroll position, and nothing
    // wrong with that math turned up on review, but a multi-line inline <span> (which is
    // exactly what a whole element declaration spanning several lines produces) is a case
    // where offsetHeight in particular is inconsistently defined across browsers, only
    // reliably describing one line box rather than the element's true multi-line extent.
    // scrollIntoView() delegates the actual "is this visible, where should it end up"
    // geometry to the browser instead of re-deriving it here, sidestepping that class of
    // bug entirely. It scrolls backdrop (marked's own nearest positioned/overflow ancestor,
    // not textarea, since the two are only ever kept in sync manually) — read the result
    // back onto textarea afterward, the reverse direction of every other sync in this file.
    const id = core.rootEl.dataset.selectedId;
    if (id !== lastSelectedId) {
      lastSelectedId = id;
      const marked = backdrop.querySelector(".tok-selected");
      if (marked) {
        marked.scrollIntoView({ block: "center", inline: "nearest" });
        textarea.scrollTop = backdrop.scrollTop;
        textarea.scrollLeft = backdrop.scrollLeft;
      }
    }
    syncScroll();
  }

  function syncScroll() {
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  }

  textarea.addEventListener("input", refresh);
  textarea.addEventListener("scroll", syncScroll);
  window.addEventListener("resize", syncBoxMetrics);

  // Fires after every rerender() — a real edit, a drag's own repeated re-renders, and a
  // selection change alike (interactivity-module.js re-renders on select, see D-031) — so
  // this alone should keep both the coloring and the selection mark current. Reported not
  // to be enough for the selection mark on its own — kept, but backed up below by watching
  // the actual DOM signal directly, rather than assuming this callback firing after
  // interactivity's own is a guarantee that held up in practice.
  const unregisterOnRendered = core.onRendered((program) => {
    lastProgram = program;
    refresh();
  });

  // Reacts to core.rootEl's data-selected-id directly, independent of which module's
  // onRendered callback fired in which order — a change here is the one thing that
  // actually has to trigger a re-highlight, so watching it directly is a more robust
  // trigger than inferring "selection probably changed" from a render having happened.
  const selectionObserver = new MutationObserver(refresh);
  selectionObserver.observe(core.rootEl, { attributes: true, attributeFilter: ["data-selected-id"] });

  refresh();

  core.registerModuleCleanup("code-highlight-module.js", () => {
    unregisterOnRendered();
    selectionObserver.disconnect();
    textarea.removeEventListener("input", refresh);
    textarea.removeEventListener("scroll", syncScroll);
    window.removeEventListener("resize", syncBoxMetrics);
    textarea.style.flex = "";
    textarea.style.width = "";
    textarea.style.height = "";
    if (wrap.parentNode) wrap.parentNode.insertBefore(textarea, wrap);
    wrap.remove();
    styleEl.remove();
    lastProgram = null;
    lastSelectedId = undefined;
  });
})();
