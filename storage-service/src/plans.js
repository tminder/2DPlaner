// D-021: "essentially CRUD for plan text under {userId, name}." Shape deliberately mirrors
// docs/'s own client-side model (D-043's {id, name, text, updatedAt} plan list) rather than
// inventing a new one — the same data, just persisted server-side instead of localStorage.
const crypto = require("crypto");
const db = require("./db");

// Excludes `text` on purpose — matches what docs/'s plan-switcher actually needs to render
// its list (id/name/updatedAt), without shipping every plan's full source on every list
// request.
function listPlans(userId) {
  return db.prepare("SELECT id, name, updated_at AS updatedAt FROM plans WHERE user_id = ? ORDER BY updated_at DESC").all(userId);
}

function getPlan(userId, id) {
  return db.prepare("SELECT id, name, text, updated_at AS updatedAt FROM plans WHERE user_id = ? AND id = ?").get(userId, id);
}

function createPlan(userId, name, text) {
  const id = crypto.randomUUID();
  const updatedAt = Date.now();
  db.prepare("INSERT INTO plans (id, user_id, name, text, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, userId, name, text, updatedAt);
  return { id, name, text, updatedAt };
}

// Returns the updated plan, or null if it doesn't exist / isn't owned by this user —
// callers turn that into a plain 404 rather than distinguishing "no such plan" from "not
// yours," the same way any resource-scoped API avoids confirming an id exists at all to
// someone who doesn't own it.
function updatePlan(userId, id, { name, text }) {
  const existing = getPlan(userId, id);
  if (!existing) return null;
  const newName = name !== undefined ? name : existing.name;
  const newText = text !== undefined ? text : existing.text;
  const updatedAt = Date.now();
  db.prepare("UPDATE plans SET name = ?, text = ?, updated_at = ? WHERE user_id = ? AND id = ?")
    .run(newName, newText, updatedAt, userId, id);
  return { id, name: newName, text: newText, updatedAt };
}

function deletePlan(userId, id) {
  const result = db.prepare("DELETE FROM plans WHERE user_id = ? AND id = ?").run(userId, id);
  return result.changes > 0;
}

module.exports = { listPlans, getPlan, createPlan, updatePlan, deletePlan };
