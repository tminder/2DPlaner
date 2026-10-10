# Technical Debt

Numbered `S-x` (Gap) entries — code-quality, consistency, and correctness-risk items in the *existing* codebase that are harder to maintain or riskier than they should be, kept in mind and addressed going forward. Distinct from `F-x` (feature/design questions not yet built, `open-questions.md`) and `D-x` (decisions already made and built, `decisions.md`).

This file holds only *currently open* debt. An entry is removed once it's resolved — the fix itself is recorded as a `D-x` decision in `decisions.md`, not narrated here. Entries aren't a chronological log of when something was found; they're numbered for stable cross-referencing, and a number is retired (not reused) once its entry is resolved and removed. When new debt is found, prefer folding it into an existing related entry over adding a new number — add a new one only for something genuinely distinct.

## `docs/interactivity-module.js`

## S-035 A `hidden` subtree still has its geometry computed and validated

`computePositions` and the load-time validation pass (`checkContainment`/`checkCollisions`) walk the *full* tree unconditionally — a `hidden: true` node (D-112) renders nothing, but its position is still resolved and it can still trigger a containment/collision violation naming an element that's currently invisible on screen. Deliberately deferred when `hidden` was built: fixing it means threading a "skip this subtree" check through several existing tree-walks for a case that's cosmetic today (a stray validation message), not a functional bug.

## S-040 `findOwnPropertyLine`'s line-anchored regex can't find a property on a single-line-formatted element

Found live while building D-150: `findOwnPropertyLine` (used by `setPlacementInside`/`toggleFlush`/`clearPlacement`/`reparentElement` to locate `placement`/`flush`) matches `^([ \t]*)key\s*:.*$` with `/gm` — anchored to a physical *line* start. Every shipped example writes one property per line, but nothing in the grammar requires that; an element written entirely on one line (`element x { shape: "rect" ... placement: "inside" ... }`) has `placement:` sitting mid-line, never at a line start, so the regex silently finds nothing. Every caller above then silently no-ops on that property instead of erroring — `clearPlacement`/`reparentElement` still complete (the reparent/position-rewrite itself isn't affected), just leaving a stale `placement`/`flush` behind on a single-line element specifically. Not fixed in D-150 (out of scope for that pass, and shared by D-148 before it) — would need `findOwnPropertyLine` to locate a property by token position instead of a per-line regex.

## `docs/index.html` (core)

## S-016 Two independent recursive interpreters over the same AST must be kept in sync by hand

`evalAst` and `linearize` both walk `num`/`neg`/`bin`/`path` nodes with separate per-operator logic. Adding a new operator or AST node type requires updating both, with nothing enforcing that they stay consistent.

## S-019 `render()` re-derives geometry `renderShape()` already computed, instead of one shared bbox pass

`bboxes` is only populated for rects inside `renderShape`; `render()` then separately re-walks the whole tree and recomputes polyline/polygon points and circle radii a second time just to fold their extents into the fit box. Any future shape type will likely repeat the same oversight.

## S-020 `nodeDragEdits` solves "literal vs. expression" differently for `position` than for `points`

A `position` coordinate that's an expression attempts `trySolveBackward` to rewrite the source; a `points` entry that's a corner-ref function never attempts anything and just warns "drag that corner directly." Plausibly a deliberate limit (corner refs aren't linear-solvable the same way), but it's undocumented, so it reads as an inconsistency rather than a designed boundary.

## S-021 `checkRealism` recomputes the whole tree's positions from scratch per candidate drag position

Called on every proposed move during an active drag, over the entire plan every time. Fine at today's plan sizes; a likely bottleneck as plans grow (see also F-007, drag performance at scale).

## S-022 Value-kind tagging is purely structural/duck-typed

`isEditable` (`"start" in v`) and `numOf` (`"value" in v`) rely on ad hoc shape checks rather than any explicit tag or class. Any future value object that happens to carry a `start` or `value` property would silently be misidentified as a literal token.

## Secondary modules

## S-023 `annotations-module.js` re-derives geometry core already computed, with no enforced link

`annotationMarkupForNode`'s own comment admits it "mirrors core's own `renderShape` branching exactly," re-deriving rect corners and polygon/polyline absolute points from scratch since core doesn't expose per-node corner lists after rendering. Any future shape-branch change in `renderShape` can silently desync this copy — nothing links the two.

## S-041 The code editor's syntax-highlight overlay sometimes desyncs from where typing actually lands

Reported directly, not yet reproduced or root-caused: the highlighted/colored backdrop `code-highlight-module.js` (D-042) paints behind the real (transparent) textarea sometimes stops lining up with where the cursor actually is / where a keystroke actually inserts text. Since the whole mechanism depends on the backdrop's own text rendering staying pixel-identical to the real textarea's (same font/line-height/wrapping, scrolled in lockstep), a mismatch there — a scroll-sync miss, a wrapping difference after some specific edit, a stale backdrop not yet re-painted for the textarea's current content — would produce exactly this symptom.

**Clarified directly: not just miscolored text — the native caret itself lands at a different character than the one clicked, and typing inserts there** ("blinkender vertikaler Strich für die Anzeige landet anderswo"), confirming the *visible* symptom is a real position mismatch between the backdrop (what's seen) and the textarea (what's actually edited), not merely a cosmetic recoloring lag.

**A real, structured investigation attempt, three hypotheses tested live and each ruled out, not just reasoned about:**
1. **`word-break: break-word` (backdrop) vs. the real textarea's UA-default `overflow-wrap: break-word`** — the first suspect, since they're different properties. A constructed stress plan (many long unbroken label strings) initially showed a large `scrollHeight` mismatch between the two elements, looking like confirmation — but this turned out to be an artifact of the *test* itself using comma-separated element properties, invalid syntax in this language (properties are newline-separated, not comma-separated, confirmed directly against `language-spec/language.md` and every shipped example). The invalid text left `rerender()` throwing a parse error and the backdrop stuck showing the previous plan while the raw `<textarea>` (which doesn't care about Planagonia's grammar) happily displayed the new, much longer text — a real backdrop/textarea desync, but caused by my own test's bad input, not the module. With valid syntax, `scrollHeight` matched exactly, and forcing both elements to identical `word-break`/`overflow-wrap` values live made no measurable difference either way.
2. **`.tok-keyword { font-weight: 600 }` subtly changing a bolded line's own line-box height**, since native-caret hit-testing depends on the *real* textarea's uniform (never-bold) line metrics while the backdrop's `element`/`connection`/etc. keywords render bold — removed live and re-tested against the same random click set; identical results, ruled out.
3. **A `caretRangeFromPoint`-based comparison** (clicking a random point, comparing the real `selectionStart` against a Range computed against the backdrop's own text at the same pixel) found a genuine-looking small mismatch (4/60 random clicks, off by 4–23 characters) on a large, realistic plan — but a *more* rigorous version of the same test, clicking the *exact* pixel of a specific word's own `getBoundingClientRect()` rather than a random point, landed the caret exactly correctly every time. This suggests `caretRangeFromPoint` itself has its own hit-testing imprecision near line-box boundaries in headless Chromium, not that the app has a real divergence at those points — a test-methodology artifact, not (confirmed to be) a product bug, though not fully ruled out either.

**Status: still unreproduced with a clean, deterministic repro, despite genuine effort — not just left untouched.** Candidates not yet tested, requiring either the user's real environment or a capability this session's headless Linux Chromium sandbox may not exercise the same way:
- **Native (non-overlay) scrollbar width** — this sandbox's headless Chromium measured a **0px** scrollbar gutter difference between the textarea and the backdrop (probably rendering overlay-style scrollbars); a real Windows/Chrome profile with classic, space-reserving scrollbars could give the textarea a genuinely narrower content box than the backdrop, changing where long lines wrap between the two. Untested here because it can't be forced in this environment.
- **A layout change that doesn't fire `window.resize`** — dragging the code/viewer pane divider (F-040/D-111), toggling the Layers panel, or switching the mobile Code/Viewer tabs all change the code pane's actual width without a `window.resize` event; `syncBoxMetrics()` only re-runs on that event, though the properties it copies (font/padding/border, not width) shouldn't by themselves need re-syncing on a pure width change — a real gap here would be more subtle than a stale metric.
- Browser zoom level, a specific font-rendering/DPI combination, or a specific plan's own content not yet tried.

**Next step, not guessable further from here: reproduce with a specific plan's own text, browser, zoom level, and exact click location**, or a screen recording of it happening — this entry's own three ruled-out hypotheses are recorded so the next attempt doesn't re-walk the same ground.

## S-036 Text-splice source-editing helpers are now duplicated across two modules

`toLineSpan`/`applyEditsDescending`/`findOwnPropertyLine`-shaped helpers live privately inside both `interactivity-module.js` and (D-112) `hierarchy-module.js` — the same small "read/write a plan-text edit" primitives, copied rather than shared, since neither `window.PlanCore` nor any other cross-module channel exposes them. Accepted as the right call the first time (matching S-023's own "a module brings its own copy" tradeoff with core's geometry) but a second instance of the identical duplication is exactly the "wait for a second use, then share" signal this project's own refactor philosophy (D-095/D-096) watches for — worth hoisting onto `window.PlanCore` if a third module ever needs the same capability.

## `storage-service-php/`

## S-043 D-201's new user-modules feature shipped without a live test, a bigger risk than S-042's

[D-201](decisions.md#d-201-f-056-v1-built-signed-in-users-can-create-their-own-modules-from-profile) (F-056 v1 — a signed-in user's own modules, a new `user_modules` table plus `modules.php`/`module-code.php`) was deployed deliberately without exercising it against the live `auth.planagonia.com`/`api.planagonia.com` instances — unlike [S-042](#s-042-d-200s-registerphp-fix-shipped-without-a-live-test-against-wordpress)'s own deferral (a small change reusing an already-verified-live code path), this is an entirely new table and two new endpoints, so the risk here is real and explicitly flagged as such in D-201 itself, not minimized. Three checks are outstanding, needing a real signed-in test account: (1) the dashboard lists/creates/edits/deletes a module correctly end to end; (2) `module-code.php?id=X` serves a real module's stored code with the right content-type (its error paths for a missing/invalid id can be, and should be, checked without an account at all — plain unauthenticated `curl`); (3) pasting a created module's own `module "..."` line into a real plan actually loads it through the app's existing confirm() dialog. Tied to [F-057](open-questions.md#f-057-the-whole-profileauthcloud-storage-stack-has-no-automated-test-coverage-at-all)'s own broader point, same as S-042.

## S-042 D-200's `register.php` fix shipped without a live test against WordPress

[D-200](decisions.md#d-200-f-059s-email-enumeration-half-fixed-registerphp-no-longer-confirms-an-email-is-already-taken) (the email-enumeration fix, folding a duplicate-email registration into the same code path `forgot-password.php` already uses) was deployed deliberately without exercising it against the live `auth.planagonia.com`/`api.planagonia.com` instances first — confirmed directly as the right tradeoff for this specific change (reuses already-verified-live functions unchanged), but it means this is still, right now, unverified in production. Three checks are still outstanding: (1) registering a genuinely new email still returns `201` with a working verification email: (2) registering again with an email that already has a verified account returns the identical `201`/message, not a `400`; (3) that second case actually emails a working fresh verification/reset link. Tied to [F-057](open-questions.md#f-057-the-whole-profileauthcloud-storage-stack-has-no-automated-test-coverage-at-all)'s own broader point — this is one concrete, resolvable instance of exactly the coverage gap that entry describes, not a new category of problem.

## Project structure / process

## S-033 Static assets are physically duplicated across many directories

`favicon.ico`, `favicon.svg`, and `apple-touch-icon.png` each exist as separate physical copies across `docs/`, `homepage/`, every `homepage/blog/<post>/` directory, `homepage/impressum/`, `homepage/modules/`, `homepage/terms/`, `profile/`, and `site-docs/` — confirmed byte-identical across every copy, re-checking this entry directly rather than assuming. A future favicon change means updating (and re-deploying) every copy by hand; missing one silently leaves a stale icon on that one section indefinitely.

**Re-checked, not an oversight: [D-076](decisions.md#d-076-a-site-favicon-a-link-back-to-the-marketing-site-from-the-app-and-the-apps-own-menu-redesign-recorded-not-built) already decided this deliberately.** `docs/` genuinely needs its own copy — it's served from two hosts with different path structures (GitHub Pages at `/2DPlaner/`, the custom domain at `/app/`), where a root-absolute favicon path would 404 on the GitHub Pages copy specifically. The other pages (`homepage/` and its own subpages, `profile/`, `site-docs/`) each have only one real deployment root and could technically share via an absolute path, but D-076 chose uniform, total self-containment per page instead (D-034's own "no shared asset file anywhere in this project" pattern), consistent with every other asset in this project. Confirmed this still stands: the remaining cost is the manual-update burden stated above, accepted in exchange for needing zero per-deployment path reasoning on any page, ever. Not changed.

