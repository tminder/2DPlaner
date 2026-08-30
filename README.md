# Planagonia

A browser-based 2D plan generator where the plan is defined by code: editing the code changes the plan, and (later) editing the plan visually via drag-and-drop changes the code back. See [planning/core-aims.md](planning/core-aims.md) for the full vision and core aims.

**Live:** [www.planagonia.com](https://www.planagonia.com/) — homepage, with the app at
[/app](https://www.planagonia.com/app/). Also still at
[tminder.github.io/2DPlaner](https://tminder.github.io/2DPlaner/) (the repo's old name)
and mirrored to [test.planagonia.com](https://test.planagonia.com/), a staging copy.
The bare `planagonia.com` (no `www.`) is pending its own SSL certificate.

## Status

The language, renderer, drag-and-drop sync, connections, and module loading were each
validated in throwaway prototypes (see [Prototypes/](Prototypes/)) before [docs/](docs/)
turned that into the first real, hosted app (D-034). `localStorage` is still the default,
but `docs/` now has an optional, minimal connection to a real backend (D-050, confirmed
working end to end in a real browser): sign in with a WordPress account, explicitly
save/load the active plan to the cloud. Auth (D-019, a self-hosted WordPress instance at
`auth.planagonia.com`) and storage (D-021, [storage-service-php/](storage-service-php/)
at `api.planagonia.com`) are both live and tested too — the full backend arc (D-047
through D-050) is built and genuinely exercised, not just designed. The main domain now
carries the real site structure (D-051, D-053, D-054, D-055) — decided in
[site-structure.md](planning/site-structure.md) — and all four sections it named are now
built: a homepage at the root, the app under `/app`, human-facing documentation under
`/docs`, and a profile page under `/profile`, with the storage API on its own subdomain.

- **[homepage/](homepage/)** — the public landing page, live at
  [www.planagonia.com](https://www.planagonia.com/) (D-054).
- **[site-docs/](site-docs/)** — human-facing documentation, live at
  [www.planagonia.com/docs/](https://www.planagonia.com/docs/) (D-055). Not to be
  confused with [documentation/](documentation/) below, the AI-facing language spec.
- **[profile/](profile/)** — sign in, see your cloud-saved plans, live at
  [www.planagonia.com/profile/](https://www.planagonia.com/profile/) (D-055).
- **[docs/](docs/)** — the app itself, meant to be used, not thrown away. Auto-deployed to
  GitHub Pages on push (Settings → Pages → Deploy from a branch → `master` / `/docs`);
  manually mirrored to `www.planagonia.com/app/` and `test.planagonia.com`.
- **[storage-service-php/](storage-service-php/)** — D-021's storage backend, live and
  tested at `api.planagonia.com`: CRUD for plan text per user, PHP/MySQL, authenticating
  real users against the WordPress instance below, CORS-enabled for the app to call it
  from any of its hosts. See its own README.
- [storage-service/](storage-service/) — the original Node.js version of the same design.
  Kept as a reference for a future VPS-hosted scenario — the actual deployment target
  turned out to have no Node.js runtime support at all (D-048), so this isn't what's live.
- [planning/core-aims.md](planning/core-aims.md) — vision and core aims
- [planning/decisions.md](planning/decisions.md) — numbered decisions (D-001...)
- [planning/open-questions.md](planning/open-questions.md) — numbered open questions (F-001...)
- [planning/project-overview.md](planning/project-overview.md) — point-in-time project
  overview and independent risk assessment
- [planning/site-structure.md](planning/site-structure.md) — the `planagonia.com` site
  plan; all four named sections are now built, a couple of small follow-ups remain open
- [documentation/](documentation/) — reference docs: [language.md](documentation/language.md) (the plan language), [architecture.md](documentation/architecture.md) (system components)
- [Prototypes/](Prototypes/) — throwaway experiments/sketches, not a staged build plan; superseded by [docs/](docs/) as the thing to actually run
