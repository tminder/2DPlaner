# Architecture

Reference documentation for how Planagonia's pieces fit together. Unlike
[planning/](../planning/), which records *why* each choice was made, this document
describes *what the system is* — components, how they connect, what talks to what. Companion
to [language.md](language.md) (the plan language itself). Keep in sync with
[planning/decisions.md](../planning/decisions.md), which is the source of truth if the two
disagree.

**Status:** all three boxes below are real and deployed. The frontend
([docs/](../docs/), live at [www.planagonia.com/app/](https://www.planagonia.com/app/) and
mirrored on [tminder.github.io/2DPlaner](https://tminder.github.io/2DPlaner/), D-034) and
both backends — auth at `auth.planagonia.com` (D-019, D-049) and storage at
`api.planagonia.com` (D-021, D-047–D-053) — have been live since D-053's domain split, with
accounts, cloud save/load, self-service registration (D-058), and rate limiting (D-056) all
built and verified against the real server. Local persistence (D-007) remains the baseline
that works with no account at all; accounts are an optional addition on top of it, not a
replacement.

## Components

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (the product)                                       │
│  ┌───────────────┐  ┌─────────────────────────────────────┐  │
│  │ Code editor    │  │ SVG renderer + drag-and-drop        │  │
│  │ (plain          │  │ (parser, Element/Connection tree,   │  │
│  │  <textarea>)    │  │  live re-render on every edit)      │  │
│  │  ~1/3 width    │  │  ~2/3 width                         │  │
│  └───────────────┘  └─────────────────────────────────────┘  │
│  Local persistence: localStorage + file export/import         │
│  Sign-in form, "my plans" UI (App header + profile/)            │
│  External modules: fetched + run directly, no proxy            │
└───────────────┬──────────────────────────┬────────────────────┘
                │                           │
                │ login (Application        │ save/load/list plans,
                │ Password, one-time)       │ own modules (session token)
                ▼                           ▼
      ┌───────────────────┐       ┌─────────────────────┐
      │ Auth backend       │       │ Storage backend      │
      │ auth.planagonia.com │◄─────┤ api.planagonia.com    │
      │ self-hosted         │ once,│ separate PHP/MySQL     │
      │ WordPress, headless │ at  │ service: CRUD for      │
      │ core only            │login│ plan text + user       │
      │ (Application         │    │ modules, per user       │
      │  Passwords)           │    │ issues its own          │
      └───────────────────┘       │ short-lived session     │
                                    │ token after verifying   │
                                    │ with WP; rate-limited    │
                                    │ (D-056)                  │
                                    └─────────────────────┘

  (separate, not pictured: an AI conversation — e.g. Claude.ai — where the human
   gets plan code written, then pastes it into the code editor above. No live
   connection between the app and the AI yet. See "AI authoring" below.)
```

Everything in the top box runs entirely client-side. The two backend boxes are the *only*
server-side pieces, and they don't talk to each other except at login — and, unlike this
decision's original target shape (D-025), they're no longer on the same domain: D-053 split
them onto their own subdomains (`auth.planagonia.com`/`api.planagonia.com`), so the
same-origin assumption that used to make CORS unnecessary no longer holds — see Deployment
topology below.

Every piece of the top box is real and live today: the code editor is a plain `<textarea>`
(matching D-034's "no build step, zero dependencies" scope cut, never Monaco/CodeMirror —
not a placeholder for one), sign-in exists both in the App's own header (D-050) and as a
dedicated form on `profile/` (D-055), and "my plans" is both the App's plan-switcher's own
Cloud group and Profile's own list. Local persistence remains the one piece that needs no
account at all.

## Frontend

A single-page app, no server-side rendering for the editing experience itself.

- **Code editor + SVG renderer**, side by side, both always live (D-006). The parser,
  Element/Connection tree, and renderer all run in the browser (D-004: SVG; D-013: the two
  core primitives) — this is required for instant feedback while typing and dragging
  (D-009), not a preference.
- **Core + module split** (D-031): `docs/index.html` only parses and renders geometry —
  every interactive behavior (drag, selection, connect/disconnect, hover) lives in
  `docs/interactivity-module.js`; zoom/pan/pinch/the scale bar/Fit live in their own
  `docs/view-module.js` (D-198, split out of the interactivity module); every computed
  display annotation (label, dimensions, edge lengths) lives in
  `docs/annotations-module.js` (D-039); the code pane's syntax colors and selected-element
  highlight live in `docs/code-highlight-module.js` (D-043) — independently loadable
  modules, all built against the `window.PlanCore` API. See [modules.md](modules.md) for
  the full API surface, the complete module list, and how modules load.
- **Drag-and-drop** rewrites the source text directly via span-splicing (D-012, D-014,
  D-018), not a full re-serialization — implemented in the interactivity module above.
- **Local persistence** (D-007): `localStorage` (autosaved on every change, D-034) and file
  export/import work with no backend at all. This is the baseline — logged-out use is fully
  functional, independent of the accounts/cloud-sync layer described in the Backend
  sections below, which is real but strictly optional on top of it.
- **Modules** (D-020): loaded by the browser directly, either from a built-in registry
  (internal, by name) or fetched from an arbitrary URL (external) — no backend proxy, no
  sandboxing. See [modules.md](modules.md) for the mechanism and trust model; the open
  question of whether that model still holds if the audience broadens is
  [open-questions.md](../planning/open-questions.md) F-009.
- **AI authoring** (D-023): currently copy-paste. The human writes/edits the plan by
  conversing with an AI in a separate session, then pastes the result into the code
  editor. No API calls to an LLM happen from within the app. See F-008 for what a live
  integration would need.

## Backend: auth

Self-hosted WordPress at `auth.planagonia.com`, **headless and core-only** — no theme, no
plugins at all (D-019). It never renders any of the app's UI; it exists purely so the app
has somewhere to verify credentials that the operator controls and hosts themselves.

- Credential verification uses WP's built-in **Application Passwords** (core since 5.6),
  checked via HTTP Basic Auth against WP's own REST API.
- Chosen specifically for WP core's mature automatic-update track record — the requirement
  was self-hosted + secure + auto-updating, and running *zero* plugins keeps the entire
  auth-relevant surface limited to the one piece of this stack that actually gets that
  treatment.
- WP is contacted **once per login** (or token refresh), not on every request — see Storage
  below for why.
- **Self-service registration is built (D-058)**, not just a design target: a dedicated
  bot-Administrator WordPress account (`planagonia-bot`, isolated from the site owner's own
  login) creates the new user via the REST API — WP core has no role narrower than
  Administrator that can do this, so this one credential carries meaningfully more
  privilege than anything else in the stack verifies ([open-questions.md](../planning/open-questions.md)
  F-059 tracks this as a standing, accepted risk). A registered account can't sign in until
  it clicks an emailed verification link (`verify.php`), at which point the bot account also
  generates and shows the Application Password the visitor actually signs in with — a
  self-registered account's own chosen password is never usable against WP's REST API at
  all (Basic Auth there only ever accepts an Application Password), so it's discarded
  rather than stored for that purpose.

## Backend: storage

A separate, minimal, custom PHP/MySQL service at `api.planagonia.com` (D-021, D-048) —
deliberately *not* WordPress, to keep D-019's WP instance down to zero plugins.

- CRUD for "plan text under `{userId, name}`" (`plans.php`: save, load, list, delete) and,
  since F-056/D-201, the same shape for a signed-in user's own authored modules
  (`modules.php` for the authenticated CRUD, `module-code.php` for the actual unauthenticated
  `<script src>` fetch any plan's `module "..."` declaration hits). No revisions, no
  taxonomies, no media handling in either case.
- **Token flow:** the app verifies the user's credentials against WP once, at login
  (`session.php`). The storage service then issues its **own** short-lived, self-signed
  session token for that session. Every subsequent save/load validates that token locally
  (signature check), with no round-trip to WP — WP is only ever contacted again at token
  refresh or registration/password-reset.
- This means WP and the storage service are only coupled at the login moment; the storage
  service doesn't depend on WP being reachable for ongoing use within a session.
- **Rate limiting is built (D-056)**, not just an intent — a fixed-window counter in the
  same MySQL database (a `rate_limits` table), keyed by IP for the unauthenticated login
  endpoint (10 attempts / 15 min) and by user id for everything already holding a validated
  token (300 requests / 15 min), confirmed against the live server rather than only reasoned
  through.

## Embeddability

The app is standalone (D-019), but a single plan is meant to stay embeddable elsewhere —
a web component or iframe snippet a third-party site (a real-estate listing, a campervan
seller's page) can drop in without a custom integration (D-024). Not built now, and no
concrete mechanism chosen yet, but a live constraint on the frontend split: the
rendered-plan piece needs to stay separable from the code-editor chrome around it, not
tightly fused to it.

## Deployment topology

**Superseded by D-053 — no longer the same domain.** D-025 originally planned WordPress and
the storage service on the same server/domain specifically to avoid CORS entirely; D-053
split them onto their own subdomains instead (`auth.planagonia.com`, `api.planagonia.com`),
as part of the site-wide path-based domain mapping decided for the whole product
([site-structure.md](../planning/site-structure.md)). Both still happen to run on the same
physical server (so the session-token signing key is still shared locally, not fetched over
the network), but requests from the App/Profile (`www.planagonia.com`) to the storage
service now genuinely cross an origin boundary — `api.planagonia.com`'s own
`allowed_origins` config explicitly lists the main domain and GitHub Pages, confirmed
working end to end (D-053), not assumed.

## What's still genuinely open

- **F-008 Live AI integration** — see [open-questions.md](../planning/open-questions.md).
- **F-005 Public plan viewing** — not decided as a feature at all yet; if it is, the
  server-rendered-snapshot approach is already worked out (see F-005).
- **F-059 The registration bot-admin credential is a single, maximally-privileged point of
  compromise** — WP core's lack of a narrower role than Administrator means this one
  credential's blast radius, if ever compromised, is full control of `auth.planagonia.com`,
  not just "create a subscriber account." Accepted so far, not resolved.
- **F-057 No automated test coverage at all for this whole backend** — every correctness
  claim above rests on manual `curl`/live-browser verification recorded in
  [decisions.md](../planning/decisions.md), with no regression safety net.
