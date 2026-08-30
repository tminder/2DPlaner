# 2DPlaner

A browser-based 2D plan generator where the plan is defined by code: editing the code changes the plan, and (later) editing the plan visually via drag-and-drop changes the code back. See [planning/core-aims.md](planning/core-aims.md) for the full vision and core aims.

## Status

The language, renderer, drag-and-drop sync, connections, and module loading were each
validated in throwaway prototypes (see [Prototypes/](Prototypes/)) before [docs/](docs/)
turned that into the first real, hosted app (D-034) — frontend-only, no backend yet
(auth/storage stay decisions-only, D-019/D-021).

- **[docs/](docs/)** — the app itself, meant to be used, not thrown away. Hosted via GitHub
  Pages once enabled in this repo's Settings (Pages → Deploy from a branch →
  `main` / `/docs`).
- [planning/core-aims.md](planning/core-aims.md) — vision and core aims
- [planning/decisions.md](planning/decisions.md) — numbered decisions (D-001...)
- [planning/open-questions.md](planning/open-questions.md) — numbered open questions (F-001...)
- [documentation/](documentation/) — reference docs: [language.md](documentation/language.md) (the plan language), [architecture.md](documentation/architecture.md) (system components)
- [Prototypes/](Prototypes/) — throwaway experiments/sketches, not a staged build plan; superseded by [docs/](docs/) as the thing to actually run
