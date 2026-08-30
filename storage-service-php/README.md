# Storage service (PHP)

D-021's minimal storage service — CRUD for plan text, scoped per user — implemented in
PHP against MySQL. This is the *second* implementation of the same design: see
[decisions.md D-048](../planning/decisions.md) for why. The original Node.js version
([storage-service/](../storage-service/)) stays in the repo as a valid design reference —
it's what this would look like on infrastructure with real Node.js support (e.g. a VPS) —
but this PHP version is what's actually being deployed, since that's what the target
hosting (shared, under Plesk, PHP-only) can run.

**Status: live and fully tested end to end, auth included** — no stub remains. Real
WordPress-issued Application Password → storage-service session token → full CRUD, over
real HTTPS with a valid certificate, all exercised directly via `curl` against the
deployed app, not just hand-traced. Multi-user isolation was verified directly too (a
second WP account confirmed unable to see, read, or delete the first account's plan) —
see [decisions.md D-049](../planning/decisions.md) for the full writeup. Several real
deployment bugs were found and fixed this way — see "Deploying" and "Troubleshooting"
below — none of which would have been caught by code review alone.

## What's real — nothing stubbed anymore

- **The storage CRUD (`app/src/plans_repo.php`, `httpdocs/plans.php`)** — MySQL via PDO,
  plain SQL, no ORM.
- **Auth (`app/src/auth.php`) is real, not a stub.** `verify_credentials()` calls a live
  WordPress instance's REST API (`auth.planagonia.com`, D-019) via HTTP Basic Auth with a
  WordPress Application Password, trusting a `200` response from `/wp-json/wp/v2/users/me`
  and mapping WP's own user id/slug onto this service's local `users` table.
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

**1. Set up the WordPress side (D-019) first**, since `verify_credentials()` needs a live
instance to call: install WordPress via the hosting portal's one-click installer on its
own subdomain (`auth.planagonia.com` in this project). Delete the stock `akismet`/`hello`
plugins outright (`wp plugin delete akismet hello --allow-root`) — D-019 requires zero
installed plugins, not just zero active ones. Switch to pretty permalinks
(`wp rewrite structure "/%postname%/"` then `wp rewrite flush --hard`) — WordPress's
default *plain* permalinks redirect `/wp-json/...` to the homepage instead of routing to
the REST API at all, confirmed by testing, not assumed. Create a dedicated low-privilege
account for the app to authenticate as — **not** the account holder's own admin login —
e.g. `wp user create dev-test dev-test@example.com --role=subscriber`, then generate its
Application Password: `wp user application-password create dev-test "storage-service"`.

**2. Create the database** via the hosting portal's "Datenbanken" feature. Note the
database name, username, and password it gives you — for the host, use `127.0.0.1`
regardless of what the portal displays (see the `db_host` comment in
`config.example.php`: the literal string `"localhost"` makes PDO/mysqli attempt a Unix
socket connection, which failed against this hosting's actual socket path when tested —
confirmed via `SQLSTATE[HY000] [2002] No such file or directory` — `127.0.0.1` forces TCP
and works).

**3. Upload files** via FTP/SFTP, preserving structure:
- `httpdocs/*` (including `.htaccess` — see "Authorization header" below, confirmed
  needed on this hosting, not just a theoretical fallback) → the subdomain's web root
  (e.g. `subdomains/test/httpdocs/`)
- `app/*` → a **sibling** directory of that web root, e.g. `subdomains/test/app/` — must
  NOT be inside the web root, since `app/config.local.php` will hold real database
  credentials and must never be reachable over HTTP.

**4. Create `app/config.local.php` directly on the server** (never through git — it's
gitignored) by copying `app/config.example.php` and filling in real values: a random
`session_secret`, the WordPress instance's URL from step 1, and the MySQL details from
step 2.

**5. Test**, using the WordPress account and Application Password from step 1:
```
curl -X POST https://test.planagonia.com/session.php \
  -H "Content-Type: application/json" \
  -d '{"username":"<wp_username>","password":"<wp_application_password>"}'
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

- Rate limiting (still an open gap, see
  [decisions.md D-022](../planning/decisions.md#d-022-scraping-protection-content-not-the-language)).
- CORS headers — not needed yet since `docs/index.html` doesn't call this service at all;
  would need adding the moment that changes, since `docs/` and this service are different
  origins.
- Wiring `docs/index.html` to actually call this service — deliberately not attempted,
  matching this project's standing practice of validating a piece standalone first.
  `docs/` stays fully `localStorage`-only for now.
