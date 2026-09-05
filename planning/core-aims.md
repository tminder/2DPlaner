# Core Aims

## Vision

A browser-based 2D plan generator: the plan is defined by code, and editing that code changes the plan. In a later stage, the user will also be able to edit the plan directly via drag-and-drop, with the underlying code updating to match.

## Core Aims

1. **Code and plan stay in sync** — editing either one updates the other; there is no view that can drift from the code that defines it.
2. **A purpose-built plan language** — the plan is written in its own optimized language, not general-purpose code.
3. **Extensible via modules** — the plan's view and interactivity can be extended by modules loaded from within the code (e.g. additional JS files).
4. **Built to last, not just to work** — the codebase stays technically sustainable as it grows: new work avoids introducing avoidable technical debt, and debt that does accumulate is tracked ([planning/tech-debt.md](tech-debt.md)) and paid down alongside ongoing feature work, not left to pile up indefinitely.
