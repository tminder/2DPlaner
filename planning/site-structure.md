# Site structure

**Working plan — the domain/subdomain mapping is now decided (see below); the remaining
sections marked "open" still need the user's input.** Scope: how the whole
`planagonia.com` presence is organized, not just the app. Written after `docs/` and the
backend (D-019/D-021/D-047–D-051) were both live and tested, and the root domain
(`planagonia.com`/`www.planagonia.com`) was confirmed still untouched — the stock
hostfactory.ch placeholder, same as `auth.`/`test.` were before this project touched them.

## What exists today

| Host | What's there | Built by |
|---|---|---|
| `planagonia.com` / `www.` | Nothing — stock hosting placeholder | — |
| `auth.planagonia.com` | WordPress, headless, REST-API-only, never rendered as UI | D-019 |
| `test.planagonia.com` | The app (`docs/`'s files) **and** the storage-service API (`session.php`/`plans.php`) sharing one `httpdocs/` | D-047–D-051 |
| `tminder.github.io/2DPlaner` | The app, auto-deployed from `git push` (GitHub Pages) | D-034 |

The `test.` naming was always meant as a staging label (D-047's original framing), not a
final production name — worth resolving as part of this plan, not left as-is by default.

## Sections the user named: Homepage, App, Documentation, Profile

**Homepage** — built and live (D-054): `homepage/index.html`, a single page at
`planagonia.com/`. Scoped deliberately to the "at minimum" reading of the open question
below — explains the three core aims, links to the App and the GitHub repo, no live
embedded demo (real added engineering — sandboxing, a demo-specific mode — for a first
version, not attempted). No pricing/checkout section, matching that nothing in
`core-aims.md`/`decisions.md` has ever indicated monetization.

**App** — exists and is live (`docs/`, D-034 onward). The only section of this list
that's actually built.

**Documentation** — exists, but written for a different audience than a website visitor.
`documentation/language.md`/`modules.md`/`architecture.md` are the plan *language*
specification, deliberately optimized for D-017's AI-authoring goal (low-ambiguity,
token-efficient) — precise but not written to be a friendly human-facing "how to use
Planagonia" page. **Open question: does the public site need a second, human-oriented
documentation surface** (a short tutorial, annotated examples, "what is this and how do I
use it"), separate from the existing AI-facing language spec — or does the same content
serve both audiences well enough once given a website layout? Untested either way; this
project has never had a real outside visitor to learn from.

**Profile** — doesn't exist. Ties directly to D-019's auth and D-021's storage, both live.
Per D-019's own design, WordPress "never renders any of the app's UI" — so a Profile
page/section should call WP's REST API and the storage service the same way `docs/`'s
own cloud sign-in already does (D-050), not be a page WordPress itself renders via a
theme. What it needs to show is open: at minimum, who's signed in and their saved cloud
plans (the "Cloud" group in the plan-switcher already covers the second half); anything
beyond that (renaming/deleting a WP account, changing the Application Password) is
unscoped.

**Not named by the user, but worth flagging as a likely missing section:** the storage
service's own API isn't really "a page" but does need *some* stable, sensibly-named home
if `test.planagonia.com` stops being just a staging label — see the domain question below.

## SEO — raised directly, and it actually decides the domain question below

Worth separating by *which* sections could plausibly want organic search traffic at all.
**Homepage and Documentation are the two that do** — someone searching for a floor-plan
tool should be able to land on Homepage; someone with a language-syntax question should
be able to land on Documentation. **The App and Profile don't** — nobody searches their
way into a signed-in tool or their own account page; they arrive already knowing the
product, or via a direct link/sign-in flow. `auth.`/`api.` are pure backend endpoints with
no human-readable content at all — there's nothing for a search engine to usefully index
there, and no reason to want it to.

**This is the actual argument against domain-mapping option A above, not just a stylistic
preference.** Splitting content across several subdomains (`app.`, `docs.`, the root)
fragments the same signals a single consolidated domain would otherwise pool — backlinks,
topical relevance, crawl budget. Modern search engines do crawl and index subdomains, but
the conventional, lower-risk structure for content that's meant to rank *together* (a
visitor reading Documentation should plausibly also find the Homepage, and vice versa) is
one domain with paths, not several subdomains that each start building authority from
zero. This doesn't apply at all to `auth.`/`api.` — genuinely backend, correctly excluded
from indexing either way (`robots.txt` disallow or a `noindex` response header on both,
not yet done — currently nothing stops either from being crawled).

**Revises the earlier lean: closer to a hybrid of A and B, not a clean pick of either.**
- `planagonia.com/` → Homepage, `planagonia.com/docs` → Documentation — same domain, own
  paths, so they can actually reinforce each other's search relevance.
- The App: no SEO reason to prefer either `app.planagonia.com` or `planagonia.com/app` —
  it has no unique content of its own worth ranking. Whichever is chosen, choose it for
  the other reasons already in the "Domain/subdomain mapping" discussion (URL memorability
  vs. one-certificate simplicity), not for SEO.
- `auth.`/`api.` stay subdomains regardless, in both the original A/B framing and here —
  never linked from anywhere a search engine would find, and should be actively excluded
  from indexing once real content exists elsewhere on the domain to distinguish them from.
- Profile: no SEO angle either way — it's a signed-in view, not discoverable content.

**One more real angle, not yet a live concern:** F-005 (public plan viewing) is still an
undecided *feature*, not a site-structure question — but if it's ever built, D-022
already worked out the right mechanism for a different reason (protecting a plan's
content from scraping): serve a public plan as a server-rendered static snapshot rather
than the raw client-rendered app. The same mechanism would also be what makes a public
plan indexable/shareable at all, since the App itself is a heavy client-rendered SPA with
nothing crawlable in its raw HTML. Noted here as a cross-reference, not a new decision —
F-005 itself is still open.

## Domain/subdomain mapping — open, needs a decision

Two shapes were considered, revised once by the SEO discussion above:

**A. Subdomain per section** (matches the pattern already set by `auth.`/the current
`test.`):
- `planagonia.com` → Homepage
- `app.planagonia.com` → The App (what `test.planagonia.com` and GitHub Pages both serve today)
- `docs.planagonia.com` → Documentation (if it ends up separate from the App)
- `auth.planagonia.com` → unchanged, stays headless WP
- `api.planagonia.com` → the storage service, split out of the App's own `httpdocs/`
  rather than continuing to share one directory with it
- Profile: a section/route inside `app.planagonia.com`, not its own subdomain — it's not
  a standalone product surface, just a signed-in view of the same app

**B. Path-based on the root domain**
- `planagonia.com/` → Homepage
- `planagonia.com/app` → The App
- `planagonia.com/docs` → Documentation
- `planagonia.com/profile` → Profile
- `auth.`/`api.` stay as subdomains regardless, since those are backend services a
  visitor never navigates to directly, not pages

**Decided: B, across the board** — Homepage/Documentation for the SEO reason above, and
the App/Profile too (the user's call, on a question the SEO analysis itself left open
either way). Concretely:
- `planagonia.com/` → Homepage
- `planagonia.com/app` → The App
- `planagonia.com/docs` → Documentation
- `planagonia.com/profile` → Profile
- `auth.planagonia.com` / `api.planagonia.com` → backend services, unchanged from the
  already-agreed part of both options

A is kept above for the record, not because it's still open — this project's own standing
practice (D-002 and every reversed decision since) is to preserve the reasoning behind a
rejected path, not delete it once superseded.

## Current state vs. target state

| Section | Target | Status |
|---|---|---|
| Homepage | `planagonia.com/` | **Done** — live at `www.planagonia.com/` (D-054), root `planagonia.com` pending its certificate like the App |
| App | `planagonia.com/app` | **Done** — live at `www.planagonia.com/app/` (root `planagonia.com` still needs its own certificate, see D-053), also still mirrored at `test.planagonia.com` and GitHub Pages |
| Documentation | `planagonia.com/docs` | **Done** — human-facing version live at `www.planagonia.com/docs/` (D-055, `site-docs/`); `documentation/` still exists separately for the AI-facing language spec, cross-referenced from the new page |
| Profile | `planagonia.com/profile` | **Done** — live at `www.planagonia.com/profile/` (D-055): sign-in, cloud plan list. No account management (rename/delete/rotate password) — flagged on the page itself as out of scope |
| Storage-service API | `api.planagonia.com` | **Done** — migrated off `test.planagonia.com` (D-053), confirmed working end to end (login, CRUD, CORS for the main domain) |
| SEO exclusion for `auth.`/`test.`(`api.`) | — | **Done** — `auth.planagonia.com` set to WordPress's own "discourage search engines" (confirmed: `noindex, nofollow` meta tag live); `test.planagonia.com` given a `Disallow: /` `robots.txt` |

## Open questions, collected here rather than scattered across the conversation

1. ~~Domain mapping~~ — **decided: B**, see above.
2. ~~Documentation audience~~ — **decided: humans, as a second surface (D-055)**, `documentation/` stays as-is for the AI-facing spec.
3. ~~What does Homepage need~~ — **built at the "explain + link" scope (D-054)**; a live embedded demo remains a possible later addition, not attempted.
4. ~~What does Profile need~~ — **built at "who's signed in + cloud plans" (D-055)**; account management stays out of scope, deferred to WordPress's own tools.
5. **Still open, real:** deep-linking a specific cloud plan from Profile into the App (`/app/?cloud=<id>`) isn't built — Profile can only send a visitor to the App generally, not to the exact plan they clicked. Whether `test.planagonia.com` stays a real staging environment or gets retired now that the main domain carries the real layout is also still undecided.
6. **Self-service registration — asked directly, deliberately deferred.** Right now every WordPress account is admin-provisioned (via WP-CLI) — there's no way for a visitor to create their own. Building it would mean a new endpoint holding an elevated, user-creating WP credential (a materially bigger security surface than anything built so far, which only ever verifies an *existing* account's own credentials) with no rate limiting yet to guard it (D-022's still-open gap). Decided: wait until rate limiting exists before opening registration up, rather than accept that risk now for a project still explicitly in prototype stage.
