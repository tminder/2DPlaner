// D-021's token flow: this service never trusts a client-presented user id directly — a
// session starts with verifyCredentials(), and every request after that carries a token
// this service itself signed, validated locally (no per-request round-trip to WordPress).
const jwt = require("jsonwebtoken");
const db = require("./db");

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET env var is required — copy .env.example to .env and fill it in.");
}
const SESSION_TTL_SECONDS = 60 * 60; // 1 hour — D-021's "short-lived"

// STUBBED — D-019's real WordPress instance doesn't exist yet, so this checks a single
// dev account from env vars instead of WP's REST API. Everything downstream (session
// tokens, ownership checks, the plans CRUD in ./plans.js) only depends on this returning
// a stable { id, username } or null — nothing else in this service needs to change once
// it's swapped. The real implementation (D-019/D-021), for when a WP instance exists:
//
//   async function verifyCredentials(username, password) {
//     const res = await fetch(`${process.env.WP_URL}/wp-json/wp/v2/users/me`, {
//       headers: { Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64") },
//     });
//     if (!res.ok) return null;
//     const wpUser = await res.json();
//     return ensureUser(String(wpUser.id), wpUser.slug); // WP's own id becomes this service's user id
//   }
//
// (`password` there is a WP Application Password, not the account's real login password —
// D-019's whole reason for using them.)
async function verifyCredentials(username, password) {
  const devUser = process.env.DEV_USERNAME, devPass = process.env.DEV_PASSWORD;
  if (devUser && devPass && username === devUser && password === devPass) {
    return ensureUser(devUser, devUser);
  }
  return null;
}

// A user row is created lazily on first successful login rather than via a separate
// register step — WP (once wired in) is the actual source of truth for who's a valid
// user at all; this service only needs a stable local id to own plans against.
function ensureUser(id, username) {
  const existing = db.prepare("SELECT id, username FROM users WHERE id = ?").get(id);
  if (existing) return existing;
  db.prepare("INSERT INTO users (id, username) VALUES (?, ?)").run(id, username);
  return { id, username };
}

function issueSessionToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, SESSION_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

// Express middleware: validates the bearer token locally and attaches req.userId, or
// responds 401 — every route below this in the chain can assume req.userId is a real,
// authenticated user with no further checking.
function requireSession(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing session token" });
  try {
    const payload = jwt.verify(token, SESSION_SECRET);
    req.userId = payload.sub;
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid or expired session token" });
  }
}

module.exports = { verifyCredentials, issueSessionToken, requireSession, SESSION_TTL_SECONDS };
