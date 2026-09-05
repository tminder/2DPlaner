# Tests

A committed regression suite (S-030) — the app's own zero-build-step principle (D-034)
applies only to what's shipped; this is dev-time tooling, not part of any deployed page.

## Setup

```
pip install -r tests/requirements.txt
playwright install chromium
```

## Running

From the repo root:

```
pytest tests/
```

Add `-v` for per-test names, `-k <substring>` to run a subset. Every test loads
`docs/index.html` directly via a `file://` URL — no dev server, no build step.

## Scope

Covers the areas most exercised and most fragile by the project's own history so far:
loading the shipped examples, dragging and undo/redo, containment/placement/flush
(including the right-click menu actions that set them), the load-time validation pass,
the stacked-element subsystem (click-cycling, the stack-hint badge, hover-dim), and the
context menu's structural actions (Duplicate, Delete, Bring to Front/Send to Back).

Not exhaustive — see `planning/tech-debt.md` (S-030) for what prompted this and
`planning/decisions.md` for the decision that scoped this first pass.
