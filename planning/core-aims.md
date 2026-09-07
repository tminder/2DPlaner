# Core Aims

## Vision

A browser-based 2D plan generator: the plan is defined by code, and editing that code changes the plan. In a later stage, the user will also be able to edit the plan directly via drag-and-drop, with the underlying code updating to match.

## Core Aims

1. **Code and plan stay in sync** — editing either one updates the other; there is no view that can drift from the code that defines it.
2. **A purpose-built plan language** — the plan is written in its own optimized language, not general-purpose code.
3. **Extensible via modules, core kept as lean as possible** — the plan's view and interactivity can be extended by modules loaded from within the code (e.g. additional JS files); new capability defaults to living in a module rather than growing `docs/index.html`'s own inline core (parser/renderer/`PlanCore`), even when the module in question is one of the always-auto-loaded ones (`interactivity-module.js` and friends, `AUTO_MODULES` in `index.html`) rather than an opt-in extra — the boundary that matters is core vs. module, not auto-loaded vs. declared.
4. **Built to last, not just to work** — the codebase stays technically sustainable as it grows: new work avoids introducing avoidable technical debt, and debt that does accumulate is tracked ([planning/tech-debt.md](tech-debt.md)) and paid down alongside ongoing feature work, not left to pile up indefinitely.
5. **Findable by search engines** — the public-facing pages (Homepage, Documentation, Blog, the App) are built to actually rank, not just to exist: a single consolidated domain instead of fragmented subdomains, real per-page metadata, a maintained sitemap and `robots.txt`, and signed-in-only or backend-only surfaces (Profile, `auth.`, `api.`) deliberately excluded from indexing rather than left ambiguous ([planning/site-structure.md](site-structure.md#seo--raised-directly-and-it-actually-decides-the-domain-question-below)).
6. **Built toward eventual commercial success, with intellectual property protected accordingly** — this isn't purely an open experiment; a later commercial path is a real, standing goal, so a choice that would freely give away replicable value (repo/source visibility, licensing, a community module ecosystem's own ownership terms) gets made deliberately, not by default just because the opposite was easier or already in place. Not yet designed: the concrete mechanism ([planning/open-questions.md#f-046-how-ip-protection-and-eventual-commercial-success-actually-get-implemented](open-questions.md#f-046-how-ip-protection-and-eventual-commercial-success-actually-get-implemented)).
