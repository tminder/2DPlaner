# Planagonia

A browser-based 2D plan generator where the plan is defined by code: editing the code changes the plan, and (later) editing the plan visually via drag-and-drop changes the code back. See [planning/core-aims.md](planning/core-aims.md) for the full vision and core aims.

**Live:** [tminder.github.io/2DPlaner](https://tminder.github.io/2DPlaner/) — still under the repo's old name; renaming the GitHub repo itself (and its URL) is a separate, more disruptive step not done as part of this working-title change.

## Status

The language, renderer, drag-and-drop sync, connections, and module loading were each
validated in throwaway prototypes (see [Prototypes/](Prototypes/)) before [docs/](docs/)
turned that into the first real, hosted app (D-034) — still frontend-only and
`localStorage`-only in production. A real backend now exists separately and is fully live
and tested — auth (D-019, a self-hosted WordPress instance at `auth.planagonia.com`) and
storage (D-021, [storage-service-php/](storage-service-php/) at `test.planagonia.com`) —
but neither is wired to `docs/` yet.

- **[docs/](docs/)** — the app itself, meant to be used, not thrown away. Hosted via GitHub
  Pages (Settings → Pages → Deploy from a branch → `master` / `/docs`), live at the link
  above.
- **[storage-service-php/](storage-service-php/)** — D-021's storage backend, live and
  tested: CRUD for plan text per user, PHP/MySQL, authenticating real users against the
  WordPress instance below. Not yet connected to `docs/`; see its own README for status.
- [storage-service/](storage-service/) — the original Node.js version of the same design.
  Kept as a reference for a future VPS-hosted scenario — the actual deployment target
  turned out to have no Node.js runtime support at all (D-048), so this isn't what's live.
- [planning/core-aims.md](planning/core-aims.md) — vision and core aims
- [planning/decisions.md](planning/decisions.md) — numbered decisions (D-001...)
- [planning/open-questions.md](planning/open-questions.md) — numbered open questions (F-001...)
- [planning/project-overview.md](planning/project-overview.md) — point-in-time project
  overview and independent risk assessment
- [documentation/](documentation/) — reference docs: [language.md](documentation/language.md) (the plan language), [architecture.md](documentation/architecture.md) (system components)
- [Prototypes/](Prototypes/) — throwaway experiments/sketches, not a staged build plan; superseded by [docs/](docs/) as the thing to actually run
