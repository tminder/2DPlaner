# Storage service

D-021's minimal storage service: CRUD for plan text, scoped per user. The first piece of
[D-019](../planning/decisions.md#d-019-user-auth--data-hosting)/[D-021](../planning/decisions.md#d-021-plan-storage-backend)'s
backend to actually be built, as code — see
[decisions.md D-047](../planning/decisions.md) for the full design/status writeup.

**Status: untested.** No Node.js is available in the environment this was written in — every
line here was written and hand-traced carefully (this project's standing practice when no
execution environment exists), but nothing has actually been run yet. Please `npm install`
and exercise it for real before trusting it with anything.

## What's real vs. stubbed

- **The storage CRUD itself (`src/plans.js`, `src/server.js`) is the real, intended
  design** — SQLite via `better-sqlite3`, plain SQL, no ORM.
- **Auth (`src/auth.js`) is stubbed.** `verifyCredentials()` checks a single dev account
  from `.env` instead of D-019's real WordPress instance, since none exists yet. Once one
  does, swap that one function's body for a real call to WP's REST API (the exact shape
  is written out as a comment right above it) — nothing else in this service needs to
  change, since everything downstream only depends on `verifyCredentials` returning a
  stable `{ id, username }` or `null`.
- **Session tokens are real** — HMAC-signed (`jsonwebtoken`), 1 hour TTL, validated
  locally on every request with no per-request round-trip to WP, matching D-021's token
  flow exactly.

## Running it

```
npm install
cp .env.example .env      # then fill in SESSION_SECRET, DEV_USERNAME, DEV_PASSWORD
npm start                  # or: npm run dev (auto-restarts on file changes)
```

A SQLite file (`data.db` by default, gitignored) is created automatically on first run —
no separate database server to install or configure.

## API

All `/plans*` routes require `Authorization: Bearer <token>` from `/session`.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/session` | `{ username, password }` | `{ token, expiresIn }` |
| GET | `/plans` | — | `{ plans: [{ id, name, updatedAt }, ...] }` |
| GET | `/plans/:id` | — | `{ id, name, text, updatedAt }` |
| POST | `/plans` | `{ name, text }` | `{ id, name, text, updatedAt }` (201) |
| PUT | `/plans/:id` | `{ name?, text? }` | `{ id, name, text, updatedAt }` |
| DELETE | `/plans/:id` | — | 204, empty |

`GET /plans` deliberately omits `text` — it returns exactly what `docs/`'s own
plan-switcher (D-043) needs to render its list, not every plan's full source on every
request. The shape (`{id, name, text, updatedAt}`) is the same one D-043 already uses
client-side in `localStorage` — this service persists the identical structure server-side
rather than inventing a second one.

A 404 from `GET/PUT/DELETE /plans/:id` means either the plan doesn't exist or isn't owned
by the requesting user — the two are deliberately indistinguishable from the response, so
a request can't be used to probe whether some other user's plan id exists.

## Not built yet

- Real WordPress auth (D-019) — see "What's real vs. stubbed" above.
- Rate limiting (flagged as an open gap in
  [decisions.md D-022](../planning/decisions.md#d-022-scraping-protection-content-not-the-language)
  and never actually built).
- Wiring `docs/index.html` to actually call this service — deliberately not attempted yet,
  matching this project's established practice of validating a piece standalone before
  wiring it into the live product. `docs/` stays fully `localStorage`-only for now.

## Deploying to Plesk (shared hosting)

The target for this project's first real deployment (`test.planagonia.com`) is shared
hosting under Plesk — no root/systemd access, Node.js apps run through Plesk's own
extension (Phusion Passenger under the hood). This couldn't be done from the environment
this was written in: it has no outbound access on port 22 at all (confirmed — plain HTTPS
to the same host works, SSH to it times out), so deployment has to be done by hand rather
than scripted from here.

**A real risk worth checking early: `better-sqlite3` is a native module** (compiled C++,
via `node-gyp`). Shared hosting frequently lacks the build toolchain `npm install` would
need to compile it, even though it ships prebuilt binaries for common platforms that often
avoid needing to compile at all. If `npm install` fails on it, the fix is swapping to a
pure-JS alternative (Node 22+'s built-in `node:sqlite`, if the host's Node version supports
it, or `sql.js` otherwise) — `src/db.js` is the only file that would need to change, since
`src/plans.js`/`src/auth.js` only ever call plain `.prepare()/.get()/.all()/.run()`.

**Steps:**

1. **Subdomain**: Websites & Domains → Add Subdomain → `test.planagonia.com`, if it isn't
   already set up.
2. **Node.js tab** on that domain in Plesk. If it's missing, the hosting provider needs to
   enable the Node.js extension for the account first.
3. **Application Root**: a subdirectory (e.g. `storage-service`) to hold the app's files.
4. **Upload this directory's contents** via FTP/SFTP — everything except `node_modules/`,
   `.env`, and `*.db` (already gitignored; don't need to be uploaded, `npm install` and
   first run recreate them).
5. **Application Startup File**: `src/server.js`.
6. **Environment variables**, set in Plesk's Node.js panel rather than uploading a real
   `.env` file, if Plesk offers that field:
   - `SESSION_SECRET` — a long random string (generate locally: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `DEV_USERNAME` / `DEV_PASSWORD` — credentials for the stubbed dev login
7. Click **"NPM install"** in Plesk's panel — runs server-side, no shell access needed.
8. Click **"Enable Node.js"** / restart — Plesk/Passenger starts the process. `PORT` from
   `.env` is likely irrelevant here; Passenger manages the actual socket/port itself, and
   `src/server.js`'s `app.listen(process.env.PORT || 3001, ...)` defers to whatever it's
   given either way.
9. **Verify**: `GET https://test.planagonia.com/plans` should return
   `401 {"error":"Missing session token"}` — confirms the app is actually running, not
   404ing at Plesk's own level. Then `POST /session` with the dev credentials to confirm
   the full login → token → CRUD path works end to end.
