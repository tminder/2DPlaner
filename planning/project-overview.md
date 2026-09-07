# Project Overview

**Snapshot as of 2026-09-07 — a point-in-time status summary, not a living document.**
Unlike [core-aims.md](core-aims.md), [decisions.md](decisions.md), and
[open-questions.md](open-questions.md), which are kept continuously in sync with the
project, this file describes where things stood when it was written and will drift out of
date. Supersedes the 2026-09-06 revision: its own top recommendation (a CI workflow running
the suite on every push) is built ([D-108](decisions.md#d-108-the-test-suite-now-runs-on-its-own-via-github-actions--deliberately-test-only-not-deploy))
and has been green through every one of the ~15 commits since. Prefer
`decisions.md`/`open-questions.md`/`tech-debt.md`/`core-aims.md` for current state; treat
this file as a snapshot of where things stand and what's worth doing next.

## What the project is

A browser-based 2D plan generator: plans are defined in a purpose-built language as code,
and the code and the rendered plan stay in sync — editing the code updates the plan;
dragging the plan writes the code back (D-013, D-012). Six core aims
([core-aims.md](core-aims.md)):

1. Code and plan never drift apart.
2. A purpose-built language, not general-purpose code.
3. Extensible via modules loaded from within the plan itself.
4. Built to last, not just to work — technical debt tracked (`tech-debt.md`) and paid down
   alongside feature work.
5. Findable by search engines — a single consolidated domain, real metadata, a maintained
   sitemap/`robots.txt`, signed-in-only surfaces deliberately excluded from indexing.
6. **New this snapshot: built toward eventual commercial success, with intellectual
   property protected accordingly** — not purely an open experiment; a choice that would
   freely give away replicable value gets weighed deliberately from here on, not decided by
   default. Nothing about the concrete mechanism is designed yet — see F-046 below.

The plan's code is meant to be primarily *authored by an AI* (D-003), with a technical
human reviewing and directing — this shapes the language toward low-ambiguity,
token-efficient generation over hand-typing ergonomics (D-017).

## What's actually built and live

The whole site is live and public at [planagonia.com](https://www.planagonia.com/) — the
app, docs, blog, profile, and the WordPress/PHP-MySQL backend behind sign-in and cloud
sync, all on one consolidated domain structure.

**Since the last snapshot (D-108 through D-120, ~15 commits, one working session):**

- **The editor grew a third and fourth panel.** A collapsible hierarchy/layers panel
  (D-112) shows the full parent/child tree, lets a layer be shown/hidden via a real
  `hidden: true` source property (so a hidden subtree is genuinely absent from rendering
  *and* every interaction surface, not just visually dimmed), and reorders siblings —
  demonstrated by a new shipped "Campervan Build" example built specifically to show a
  hidden layer revealing something underneath. A full-width plan-picker panel (D-113)
  replaced the old cramped `<select>` dropdown with separate Open/New actions, each
  showing every plan (or example) as a live-rendered mini-preview, not a bare name.
- **The code/viewer split is now resizable** (F-040/D-111) — a draggable divider,
  persisted per-browser, keyboard-resizable, hidden on mobile.
- **Two real mobile/touch gaps closed** (F-036/D-115): real two-finger pinch-to-zoom
  (a new gesture state layered onto the existing pointer-event machinery, anchored the
  same way `handleWheel`'s cursor-zoom already was) and a long-press equivalent for the
  right-click context menu, both built without touching mouse/pen behavior at all.
- **Visible, draggable resize handles for the selected rect/circle** (F-016/D-116) — real
  SVG elements at each corner (rect) or the radius point (circle), draggable via the same
  Pointer Events pinch/long-press already use, so it works on touch for free. Two real
  bugs were caught live before shipping: an expression-valued size drawing handles at
  `NaN` coordinates, and a styleless shape (which core itself renders as a bare point, not
  a real shape) still getting phantom handles.
- **A tech-debt cluster closed** (D-114): a real, if narrow, bug where a path-qualified
  module declaration (`module "modules/grid-module.js"`) would still pop the
  untrusted-module confirm dialog every session; the exact `fixedViewBox`-reset
  duplication class that had *just* caused a live bug in the plan-picker preview, fixed at
  its root by centralizing on `rerender()`'s own existing default; duplicated
  download/filename-sanitizing logic.
- **A real production bug report turned into a four-fix chain on the auth backend** —
  the session's second half, all found and fixed live against the real WordPress/MySQL
  backend, not staged:
  - The emailed verification link pointed at the main site instead of the API's own
    domain, a flat 404 ("File not found") (D-117).
  - **The actual root cause of "Invalid credentials":** WordPress's REST API returns two
    different fields, `username` (the real login) and `slug` (a URL-safe nicename that
    turns dots into hyphens) — the code used `slug` everywhere it needed `username`,
    silently breaking sign-in for *any* account whose derived username contained a dot
    (i.e., most real email addresses). Fixed at three call sites, confirmed with a real
    account created, tested, and cleaned up live against the production WordPress
    instance (D-118).
  - Sign-in now explicitly documented (and tested) to accept an email address, not just a
    username — WordPress's own Basic Auth already resolved it either way; the gap was
    only the form's own label (D-119).
  - **A "Forgot your password?" flow, built from the ground up** (D-120) — reuses the
    entire existing register→verify email/token machinery unchanged, adding only a way to
    get a *fresh* token emailed to an *already-existing* account (new
    `find_wp_user_by_email()`/`issue_password_reset_token()`, one new endpoint). Covers
    both "lost the one-time credential" and "an admin-provisioned account that was never
    auto-issued one at all." A related hygiene fix ships alongside it: repeat use no
    longer accumulates a new Application Password every time — the old one is revoked
    first.
- **`planning/` gained a new standing goal** (Core Aim 6, this session) — eventual
  commercial success with IP protection — plus two new open questions it surfaces
  (F-045: a community module store; F-046: the concrete IP-protection mechanism, entirely
  undesigned).

**Unchanged and stable:** the plan language/parser/renderer core, drag-and-drop sync,
undo/redo, connections (D-107), placement modes, module composition, the header/toolbar
(D-100–D-106), the SEO/site-structure work — all still live, all still passing the full
regression suite on every push.

**The test suite has more than doubled since the last snapshot:** 98 tests across 13 files
(was 44 across 8), still `pytest` + Playwright against a plain `file://` copy of `docs/`,
no server or build step. Every fix in this session was still verified live in a real
browser (and, for the backend fixes, against the real production WordPress/MySQL
instance) *before* being called done — this session's own two found-live bugs (the resize
handles' `NaN`/styleless-shape cases) were caught exactly that way, not by the automated
suite alone.

## What's decided but not built

**26 open `F-x` questions** (`open-questions.md`), roughly four groups:

- **Deliberately deferred by choice, not urgent:** F-030 (reusable components), F-034
  (sharing), F-008 (live AI integration), F-009's real-sandboxing half, F-016's remaining
  polygon/polyline-scale half.
- **Real, genuinely undesigned gaps:** F-024 (no rotation — a real domain-coverage gap for
  a floor-plan tool), F-029 (no multi-select), F-031 (grid-snapped dragging), F-041
  (selection/hover glow has no alternative treatment), F-042 (no general settings-toggle
  menu beyond Grid/Connections), F-037 (validation errors don't surface inline in the
  code pane).
- **Fresh, directly requested, nothing designed yet:** F-045 (a community module store —
  directly intersects F-009's trust model and F-046's new IP question); F-046 (how Core
  Aim 6 actually gets implemented — repo/source visibility, what's even the protectable
  asset, no monetization shape implied yet).
- `site-structure.md`'s own remaining items: deep-linking a cloud plan from Profile into
  the App; whether `test.planagonia.com` stays a staging mirror.

## Technical debt

**21 `S-x` entries** (`tech-debt.md`, down from 27), concentrated in the same two places
as last snapshot:

- **`docs/interactivity-module.js` (S-007, S-008, S-035)** — `handleRendered` is still a
  multi-responsibility function (S-007, one responsibility fewer than the last snapshot);
  a validation/collision-checking duplication (S-008); a `hidden` subtree still gets its
  geometry computed and validated even though nothing draws it (S-035, new this session,
  deliberately deferred when `hidden` was built).
- **Core (`docs/index.html`) and secondary modules** — smaller, independent items: an
  ad hoc storage try/catch pattern repeated across five call sites (S-018, considered and
  explicitly deferred during this session's own tech-debt pass); several "no enforced link
  between two things that must stay in sync by hand" cases (S-023/S-024/S-036 — the last
  one new: a small text-splice helper now duplicated between two modules, "wait for a
  third use" per this project's own stated refactor philosophy).
- **Project structure/process (S-031 through S-034)** — stale module docs, no CI/CD for
  *deploy* specifically (tests are automated, D-108; the five-target `scp` deploy is still
  manual and unverified by anything but a human/session remembering to check byte counts),
  physically duplicated static assets, a confusable `documentation/`-vs-`site-docs/`
  naming pair.

## What's going well, for balance

The live-verification habit keeps finding real bugs *this session's own new work exposes*
— not just legacy ones. The auth-backend chain (D-117–D-120) is the clearest example yet
of this project's own standing practice paying off outside the frontend entirely: every
fix there was root-caused and confirmed against the real, live WordPress/MySQL instance
(creating and cleaning up real test accounts and credentials along the way), not assumed
correct from reading the code. `planning/`'s current-state convention (an entry updated in
place rather than a chronological log) kept every one of these related fixes legible as a
single coherent thread rather than four scattered patches.

## Recommendation

**No single blocking gap dominates this snapshot the way "no test suite" or "no CI" did
the last two — the codebase and the live backend are both in a genuinely stable, verified
state.** Three real candidates, in the order they'd likely compound in value:

1. **F-046 (IP protection / commercial-success mechanism) is the one item that shapes
   everything after it, not just itself.** It's brand new, entirely undesigned, and every
   other candidate below (a module store, opening the repo further, any new public-facing
   feature) is a concrete instance of the exact question it raises. Not something to
   *build* yet — a short, direct conversation to at least scope the shape of an answer
   (repo visibility reconsidered? a license file added or deliberately withheld? is the
   hosted service vs. the language spec the actual asset?) would turn a standing principle
   into something the next feature decision can actually be checked against.
2. **If a concrete feature is preferred: F-037 (inline validation errors in the code
   pane)** is a real, bounded, user-facing gap — today a validation message names an
   element by id and leaves the reader to find it themselves. Its own prerequisite is
   already scoped precisely (the parser needs to start capturing per-property source
   spans generally, not a one-off fix), unlike the larger undertakings (rotation,
   multi-select) that would each need their own separate design pass first.
3. **If tech debt is preferred: S-018's storage try/catch duplication** is the most
   contained item left (one small shared helper, five call sites, no behavior change) —
   already scoped and explicitly deferred once this session in favor of higher-priority
   work, not because it was hard.

**If forced to pick one: F-046.** Not because it's urgent in the way CI or the auth bugs
were, but because it's the one open question every other choice from here on should
arguably be checked against — cheapest to resolve now, before more surface area (a module
store, more public pages, more of the language spec) accumulates on top of an
undecided IP posture.
