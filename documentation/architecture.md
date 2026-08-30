# Architecture

Reference documentation for how Planagonia's pieces fit together. Unlike
[planning/](../planning/), which records *why* each choice was made, this document
describes *what the system is* — components, how they connect, what talks to what. Companion
to [language.md](language.md) (the plan language itself). Keep in sync with
[planning/decisions.md](../planning/decisions.md), which is the source of truth if the two
disagree.

**Status:** mixed — the frontend box below is real and deployed
([docs/](../docs/), live at [tminder.github.io/2DPlaner](https://tminder.github.io/2DPlaner/),
D-034); the two backend boxes (auth, storage) are individually decided (see the D-numbers
throughout) but not built — no accounts exist yet, only local persistence (D-007). Read the
Frontend section as describing what's running today; the Backend sections as the plan for
when that starts.

## Components

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (the product)                                       │
│  ┌───────────────┐  ┌─────────────────────────────────────┐  │
│  │ Code editor    │  │ SVG renderer + drag-and-drop        │  │
│  │ (Monaco/       │  │ (parser, Node/Connection tree,      │  │
│  │  CodeMirror)   │  │  live re-render on every edit)      │  │
│  │  ~1/3 width    │  │  ~2/3 width                         │  │
│  └───────────────┘  └─────────────────────────────────────┘  │
│  Local persistence: localStorage + file export/import         │
│  Login UI, "my plans" UI                                       │
│  External modules: fetched + run directly, no proxy            │
└───────────────┬──────────────────────────┬────────────────────┘
                │                           │
                │ login (Application        │ save/load plan
                │ Password, one-time)       │ (session token)
                ▼                           ▼
      ┌───────────────────┐       ┌─────────────────────┐
      │ Auth backend       │       │ Storage backend      │
      │ self-hosted         │◄─────┤ separate, minimal     │
      │ WordPress, headless │ once,│ service: CRUD for      │
      │ core only            │ at  │ plan text per user     │
      │ (Application         │login│ issues its own          │
      │  Passwords)           │    │ short-lived session     │
      └───────────────────┘       │ token after verifying   │
                                    │ with WP                 │
                                    └─────────────────────┘

  (separate, not pictured: an AI conversation — e.g. Claude.ai — where the human
   gets plan code written, then pastes it into the code editor above. No live
   connection between the app and the AI yet. See "AI authoring" below.)
```

Everything in the top box runs entirely client-side. The two backend boxes are the *only*
server-side pieces, and they don't talk to each other except at login — though physically
they sit on the same server, same domain (D-025), not separate hosts.

The diagram's top box is still this decision's original target shape, not a description of
`docs/` today: the code editor built so far is a plain `<textarea>` (matching D-034's "no
build step, zero dependencies" scope cut, not Monaco/CodeMirror), and there's no login/"my
plans" UI since the backend boxes below aren't built. Only "SVG renderer + drag-and-drop"
and "local persistence" are real right now.

## Frontend

A single-page app, no server-side rendering for the editing experience itself.

- **Code editor + SVG renderer**, side by side, both always live (D-006). The parser,
  Element/Connection tree, and renderer all run in the browser (D-004: SVG; D-013: the two
  core primitives) — this is required for instant feedback while typing and dragging
  (D-009), not a preference.
- **Core + module split** (D-031): `docs/index.html` only parses and renders geometry —
  every interactive behavior (drag, selection, connect/disconnect, hover, zoom/pan) lives in
  `docs/interactivity-module.js`, and every computed display annotation (label, dimensions,
  edge lengths) lives in a second, independently loadable module, `docs/annotations-module.js`
  (D-039) — both built against the `window.PlanCore` API. See [modules.md](modules.md) for
  the full API surface and how modules load.
- **Drag-and-drop** rewrites the source text directly via span-splicing (D-012, D-014,
  D-018), not a full re-serialization — implemented in the interactivity module above.
- **Local persistence** (D-007): `localStorage` (autosaved on every change, D-034) and file
  export/import work with no backend at all. This is the baseline — logged-out use is fully
  functional, and it's the *only* thing currently built (no accounts exist yet).
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

Self-hosted WordPress, **headless and core-only** — no theme, no plugins at all (D-019).
It never renders any of the app's UI; it exists purely so the app has somewhere to verify
credentials that the operator controls and hosts themselves.

- Credential verification uses WP's built-in **Application Passwords** (core since 5.6),
  checked via HTTP Basic Auth against WP's own REST API.
- Chosen specifically for WP core's mature automatic-update track record — the requirement
  was self-hosted + secure + auto-updating, and running *zero* plugins keeps the entire
  auth-relevant surface limited to the one piece of this stack that actually gets that
  treatment.
- WP is contacted **once per login** (or token refresh), not on every request — see Storage
  below for why.

## Backend: storage

A separate, minimal, custom service (D-021) — deliberately *not* WordPress, to keep D-019's
WP instance down to zero plugins.

- Essentially CRUD for "plan text under `{userId, name}`": save, load, list, delete.
  Nothing else — no revisions, no taxonomies, no media handling.
- **Token flow:** the app verifies the user's credentials against WP once, at login. The
  storage service then issues its **own** short-lived, self-signed session token for that
  session. Every subsequent save/load validates that token locally (signature check), with
  no round-trip to WP — WP is only ever contacted again at token refresh.
- This means WP and the storage service are only coupled at the login moment; the storage
  service doesn't depend on WP being reachable for ongoing use within a session.
- Rate-limiting against bulk scraping of other users' plans is an **intent, not yet a
  decided feature** (see the correction on D-022) — needs its own design pass.

## Embeddability

The app is standalone (D-019), but a single plan is meant to stay embeddable elsewhere —
a web component or iframe snippet a third-party site (a real-estate listing, a campervan
seller's page) can drop in without a custom integration (D-024). Not built now, and no
concrete mechanism chosen yet, but a live constraint on the frontend split: the
rendered-plan piece needs to stay separable from the code-editor chrome around it, not
tightly fused to it.

## Deployment topology

WordPress and the storage service run on the **same server, same domain** (D-025) — not
separate subdomains. No CORS configuration needed anywhere; the storage service's
session-token signing key is shared locally rather than fetched over the network, since
both processes are on the same machine.

## What's still genuinely open

- **Storage service API shape.** Endpoint names, request/response format, error handling —
  none of this has been designed, only the responsibility ("CRUD for plan text").
- **Rate-limiting mechanics** (per-user? per-IP? what limits?) — flagged but not designed,
  see D-022's correction.
- **F-008 Live AI integration** — see [open-questions.md](../planning/open-questions.md).
- **F-005 Public plan viewing** — not decided as a feature at all yet; if it is, the
  server-rendered-snapshot approach is already worked out (see F-005).
