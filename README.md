# Planagonia

A browser-based 2D plan generator where the plan is defined by code: editing the code changes the plan, and (later) editing the plan visually via drag-and-drop changes the code back. See [planning/core-aims.md](planning/core-aims.md) for the full vision and core aims.

**Live:** [tminder.github.io/2DPlaner](https://tminder.github.io/2DPlaner/) — still under the repo's old name; renaming the GitHub repo itself (and its URL) is a separate, more disruptive step not done as part of this working-title change.

## Status

The language, renderer, drag-and-drop sync, connections, and module loading were each
validated in throwaway prototypes (see [Prototypes/](Prototypes/)) before [docs/](docs/)
turned that into the first real, hosted app (D-034) — still frontend-only and
`localStorage`-only in production. A first backend piece, [storage-service/](storage-service/)
(D-021, D-047), now exists as code but isn't wired to `docs/` yet and hasn't been run —
auth (D-019) is still decisions-only, stubbed in the storage service pending a real
WordPress instance.

- **[docs/](docs/)** — the app itself, meant to be used, not thrown away. Hosted via GitHub
  Pages (Settings → Pages → Deploy from a branch → `master` / `/docs`), live at the link
  above.
- **[storage-service/](storage-service/)** — D-021's storage backend: CRUD for plan text
  per user, Node.js/Express/SQLite. Not deployed, not connected to `docs/`; see its own
  README for status and what's stubbed.
- [planning/core-aims.md](planning/core-aims.md) — vision and core aims
- [planning/decisions.md](planning/decisions.md) — numbered decisions (D-001...)
- [planning/open-questions.md](planning/open-questions.md) — numbered open questions (F-001...)
- [planning/project-overview.md](planning/project-overview.md) — point-in-time project
  overview and independent risk assessment
- [documentation/](documentation/) — reference docs: [language.md](documentation/language.md) (the plan language), [architecture.md](documentation/architecture.md) (system components)
- [Prototypes/](Prototypes/) — throwaway experiments/sketches, not a staged build plan; superseded by [docs/](docs/) as the thing to actually run
