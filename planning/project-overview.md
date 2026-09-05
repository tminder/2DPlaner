# Project Overview

**Snapshot as of 2026-09-05 — a point-in-time status summary, not a living document.**
Unlike [core-aims.md](core-aims.md), [decisions.md](decisions.md), and
[open-questions.md](open-questions.md), which are kept continuously in sync with the
project, this file describes where things stood when it was written and will drift out of
date. Supersedes the 2026-09-03 revision: every item that snapshot recommended or flagged
as high-severity is now built — the load-time validation pass, the click-cycling fix, the
`childPlacement` ancestor search, the label-overlap nudge, and image export — plus a
favicon, a link from the App back to the marketing site, a second blog post, and three more
open questions recorded. Prefer `decisions.md`/`open-questions.md` for current state; treat
this file as a snapshot of where things stand and what's worth doing next, not a standing
to-do list that updates itself.

## What the project is

A browser-based 2D plan generator: plans are defined in a purpose-built language as code,
and the code and the rendered plan stay in sync — editing the code updates the plan;
dragging the plan writes the code back (D-013, D-012). Three core aims
([core-aims.md](core-aims.md)):

1. Code and plan never drift apart.
2. A purpose-built language, not general-purpose code.
3. Extensible via modules loaded from within the plan itself.

The plan's code is meant to be primarily *authored by an AI* (D-003), with a technical
human reviewing and directing — this shapes the language toward low-ambiguity,
token-efficient generation over hand-typing ergonomics (D-017).

## What's actually built and live

The whole site is live and public at [planagonia.com](https://www.planagonia.com/) —
homepage, `/app/`, `/docs/`, `/profile/`, `/blog/` (now two posts), and `/impressum/`.
Everything the 2026-09-03 snapshot flagged as unresolved has since been built:

- **All three placement modes** (free, outside-attached, inside-flush) and **both of
  F-002's module promises** (new rendering/interactivity, and drag-editable
  module-generated compositions) — closed out before this stretch began, unchanged since.
- **Undo/redo and Duplicate** — also unchanged since the last snapshot; Scale remains
  deliberately deferred.
- **A load-time validation pass (F-022/F-028, D-075).** Collision and containment are no
  longer only checked mid-drag — the same already-correct checks now also run once against
  every freshly loaded plan's own resting layout, surfacing every violation (including
  duplicate element ids) in a dedicated panel. Re-run against this session's own
  independently-AI-generated comparison plan, it found 36 real overlaps, not the two
  originally spot-checked by hand.
- **Click-cycling through stacked elements (F-019 + F-021's core case, D-077).** A container
  fully hidden behind its own children — or any two elements that merely happen to overlap
  — can now be reached by clicking the same point again, stepping through everything
  actually painted there via the browser's own paint order, wrapping back to the top.
- **`childPlacement` now searches every ancestor, not just the immediate parent
  (F-020, D-078).** A grandchild nested two levels under a container could previously
  escape its bounds with zero warning; both the drag-time clamp and the load-time
  validation pass shared this exact bug and are now both fixed via one shared function.
- **Always-shown labels nudge apart instead of overlapping (F-018, D-079).** Measures each
  label's real rendered size and separates any two that collide, a few iterations,
  leaving per-edge length labels (a separate concern, sharing the same markup group until
  this fix) untouched.
- **Export as image (F-033, D-080).** Two new buttons, `Export PNG…`/`Export SVG…`, always
  capturing the full plan regardless of the editor's current pan/zoom, with editor-only
  chrome (icons, selection state, hover-only labels) stripped from the output.
- **A real favicon and a link back to the marketing site (D-076).** Designed from the
  site's own existing visual language rather than borrowed; the App's own header title now
  links to `planagonia.com`.
- **A second blog post**, a non-technical rewrite of this stretch's own work — leading with
  the deliberate campervan/independent-AI comparison test and the six bugs it surfaced,
  not a trimmed changelog.
- **Backend, live and tested, unchanged since the last snapshot**: self-hosted WordPress
  auth plus a PHP/MySQL storage service, both exercised against the real, running
  infrastructure.
- **Zero automated tests, zero CI, zero build step**, still deliberate (D-034). Every fix
  this stretch was verified with Playwright against a real, running browser (or the live
  deployed site directly) before being called done — no exceptions.

## What's decided but not built

- **D-025** — deployment topology as originally scoped, overtaken by what actually
  happened (separate subdomains rather than one shared domain) — still not written up as
  a formal decision update.
- **F-016's Scale** — explicitly deferred by choice.
- **F-032** (a Word-like icon menu for the App's toolbar) — recorded only, per direct
  request, not designed.

## Open questions: down to eleven from the language review, three new ones added

Fourteen findings came out of the 2026-09-03 language review (F-018–F-031); six of the
highest-severity ones are now built (F-018, F-019, F-020, F-021's core case, F-022, F-028).
Three further requests were logged this stretch, unrelated to that review: F-032 (the icon
menu above), **F-033** (export as image — now built, see above), and **F-034** (sharing a
plan with someone else, split explicitly into a static view vs. handing over the editable
plan+code — generalizes F-005's older "public viewing" question to a specific recipient).

**Still open, roughly by size:**

- **Cheap, well-scoped:** F-025 (no version marker on the plan format — costless today,
  expensive to retrofit once real saved plans exist outside `localStorage`), F-021's
  remaining half (no persistent visual indicator that a point even *has* more than one
  candidate to cycle through — the fix above only helps once you already suspect it).
- **Real, but genuinely undesigned:** F-023 (no formal schema — the parser is the only
  spec, which is exactly why an unrecognized `shape` or an orphaned `flush` fail silently),
  F-024 (no rotation, domain coverage never audited against a real floor plan's needs),
  F-026 (the same "pinned to an edge, slides, clamps" logic independently rebuilt four
  times, no shared code), F-027 (no property/style reuse — a `styles: {}` preset direction
  is sketched, not built), F-029 (no multi-select).
- **Deliberately deferred, least developed:** F-030 (a reusable component/sub-plan
  concept), F-031 (discrete/grid-snapped dragging, paired with F-014's still-unbuilt visual
  grid), F-034 (sharing), F-032 (the icon menu), F-016's Scale.

## What's going well, for balance

The habit that made the 2026-09-03 review worth doing — testing a decision against reality
rather than defending it once made — kept paying off through the fixes themselves, not just
the review that found them. Two of the six fixes (D-078, D-079) surfaced a *second*, real
bug while being built, not while being debugged afterward: fixing `childPlacement` revealed
the exact same one-level gap already existed in the just-built validation pass; fixing
label overlap revealed label text and edge-length text had always shared one markup group,
so an early version of the nudge silently mispositioned edge labels too. Both were caught
and fixed in the same pass specifically because every fix was checked in a real browser
before being called done, not assumed correct from reading the diff.

## Recommendation

**No single item stands out as urgently as F-022/F-028 did last time — the highest-severity
findings from the language review are now cleared.** What's left splits cleanly into "cheap
and clear" versus "real but needs its own concept pass first," and which to pick is
genuinely a matter of preference now rather than a severity call:

1. **F-025 (a version marker) is close to a free action.** A single `settings { version }`
   field, ignored until it's ever actually needed, costs nothing today and becomes
   expensive to retrofit the moment a real plan is saved somewhere outside the authoring
   browser's own `localStorage` (which the cloud storage service already makes possible).
   Worth doing opportunistically rather than waiting for a reason.
2. **F-023 (a real schema) is the highest-leverage item left, but it's a real design
   project, not a quick fix** — it would retroactively explain three separate silent
   failures found this session (an unrecognized `shape`, an ignored `rotation`, an orphaned
   `flush`) with one mechanism instead of three ad-hoc checks, but deserves its own
   concept pass rather than being started under momentum from smaller fixes.
3. **Everything else is either explicitly your call to defer** (Scale, F-030, F-031,
   F-032, F-034) **or a real but not urgent cleanup** (F-026's refactor, F-029's
   multi-select, F-024's rotation/domain-coverage question) — none blocked, none pressing.

If forced to pick one: F-025, purely on cost — it's minutes of work now against a real,
if not urgent, cost later. But this is a genuinely open choice this time, not a severity
call like last round's.
