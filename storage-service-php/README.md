# Storage service (PHP)

D-021's minimal storage service — CRUD for plan text, scoped per user — implemented in
PHP against MySQL. This is the *second* implementation of the same design: see
[decisions.md D-048](../planning/decisions.md) for why. The original Node.js version
([storage-service/](../storage-service/)) stays in the repo as a valid design reference —
it's what this would look like on infrastructure with real Node.js support (e.g. a VPS) —
but this PHP version is what's actually being deployed, since that's what the target
hosting (shared, under Plesk, PHP-only) can run.

**Status: live and tested end to end**, on the real target server
(`test.planagonia.com`), over real HTTPS with a valid certificate: login, create, list,
get, update, delete, and the 401/400 error paths were all exercised directly via `curl`
against the deployed app, not just hand-traced. Two real deployment bugs were found and
fixed this way — see "Deploying" and "Troubleshooting" below — neither would have been
caught by code review alone. A real certificate has since been issued for the subdomain
(confirmed: `curl` without `-k` now succeeds) — the examples below no longer need it,
kept only as a note in case a future redeploy to a different subdomain hits the same
"HTTPS Optionen: Unverschlüsselt" state again.

## What's real vs. stubbed

Identical split to the Node version:

- **The storage CRUD itself (`app/src/plans_repo.php`, `httpdocs/plans.php`) is the real,
  intended design** — MySQL via PDO, plain SQL, no ORM.
- **Auth (`app/src/auth.php`) is stubbed.** `verify_credentials()` checks a single dev
  account from config instead of D-019's real WordPress instance. The real WP REST API
  call is written out as a comment right above it — nothing else needs to change once
  it's swapped in, since everything downstream only depends on `verify_credentials`
  returning a stable `['id' => ..., 'username' => ...]` or `null`.
- **Session tokens are real** — HMAC-SHA256 signed, hand-rolled rather than a JWT
  library (no Composer dependency needed for something this small, and it deliberately
  supports exactly one algorithm with no "alg" field to negotiate — sidesteps a whole
  class of real-world JWT bugs by construction, not just by being simple), 1 hour TTL.

## Why MySQL, not SQLite

The first draft used SQLite (PHP's `pdo_sqlite`, confirmed available on the target host)
since it needs zero provisioning — no database to create, no credentials to manage.
Switched to MySQL on request: this hosting's automatic backup coverage is understood to
apply to its provisioned databases, not necessarily to an arbitrary file sitting in a
webspace, and the hosting portal already offers database creation as a first-class
feature. The switch only touched `app/src/db.php` (the connection + schema) — every other
file talks to PDO through plain prepared statements and didn't need to change.

## Deploying

**1. Create the database** via the hosting portal's "Datenbanken" feature. Note the
database name, username, and password it gives you — for the host, use `127.0.0.1`
regardless of what the portal displays (see the `db_host` comment in
`config.example.php`: the literal string `"localhost"` makes PDO/mysqli attempt a Unix
socket connection, which failed against this hosting's actual socket path when tested —
confirmed via `SQLSTATE[HY000] [2002] No such file or directory` — `127.0.0.1` forces TCP
and works).

**2. Upload files** via FTP/SFTP, preserving structure:
- `httpdocs/*` (including `.htaccess` — see "Authorization header" below, confirmed
  needed on this hosting, not just a theoretical fallback) → the subdomain's web root
  (e.g. `subdomains/test/httpdocs/`)
- `app/*` → a **sibling** directory of that web root, e.g. `subdomains/test/app/` — must
  NOT be inside the web root, since `app/config.local.php` will hold real database
  credentials and must never be reachable over HTTP.

**3. Create `app/config.local.php` directly on the server** (never through git — it's
gitignored) by copying `app/config.example.php` and filling in real values: a random
`session_secret`, the dev login, and the MySQL details from step 1.

**4. Test:**
```
curl -X POST https://test.planagonia.com/session.php \
  -H "Content-Type: application/json" \
  -d '{"username":"<dev_username>","password":"<dev_password>"}'
```
Should return `{"token":"...","expiresIn":3600}`. Then:
```
curl https://test.planagonia.com/plans.php -H "Authorization: Bearer <token>"
```
Should return `{"plans":[]}`. If a fresh subdomain's certificate isn't issued yet (the
hosting portal's "HTTPS Optionen" would show "Unverschlüsselt, jetzt Sichern"), add `-k`
to skip verification temporarily until it is — don't rely on that for anything beyond
manual testing.

## Authorization header — confirmed needed, not just a theoretical fallback

On this hosting, the `Authorization` header was silently stripped before PHP ever saw it
— `GET /plans.php` with a genuinely valid token still returned `"Missing session token"`
until `httpdocs/.htaccess` (shipped in this directory, not optional) was added:
```apacheconf
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
```
`bearer_token_from_headers()` in `app/src/http.php` also checks `getallheaders()` and
`REDIRECT_HTTP_AUTHORIZATION` as further fallbacks, but on this specific hosting the
`.htaccess` rule above was the one that actually fixed it. If deploying somewhere else and
this still comes back "Missing session token" with a real token, check that `mod_rewrite`
is enabled there too — without it, this specific `.htaccess` line does nothing (Apache
ignores an unrecognized directive inside a conditionally-loaded module's own block, so no
error either — it just silently doesn't apply).

## API

Query-string based (`?id=...`), not path-based (`/plans/:id`) — deliberately avoids
depending on `mod_rewrite`/`.htaccess` being configured at all; every route here is a
directly-requested `.php` file. All `plans.php` requests require
`Authorization: Bearer <token>` from `session.php`.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/session.php` | `{ username, password }` | `{ token, expiresIn }` |
| GET | `/plans.php` | — | `{ plans: [{ id, name, updatedAt }, ...] }` |
| GET | `/plans.php?id=X` | — | `{ id, name, text, updatedAt }` |
| POST | `/plans.php` | `{ name, text }` | `{ id, name, text, updatedAt }` (201) |
| PUT | `/plans.php?id=X` | `{ name?, text? }` | `{ id, name, text, updatedAt }` |
| DELETE | `/plans.php?id=X` | — | 204, empty |

Same response shapes as the Node version — `GET /plans.php` omits `text` for the same
reason (matches what `docs/`'s plan-switcher, D-043, actually needs for its list); a 404
from any single-plan route doesn't distinguish "doesn't exist" from "not yours," so a
request can't be used to probe whether some other user's plan id exists.

## Not built yet

- Real WordPress auth (D-019) — see "What's real vs. stubbed" above.
- Rate limiting (still an open gap, see
  [decisions.md D-022](../planning/decisions.md#d-022-scraping-protection-content-not-the-language)).
- CORS headers — not needed yet since `docs/index.html` doesn't call this service at all;
  would need adding the moment that changes, since `docs/` and this service are different
  origins.
- Wiring `docs/index.html` to actually call this service — deliberately not attempted,
  matching this project's standing practice of validating a piece standalone first.
  `docs/` stays fully `localStorage`-only for now.
