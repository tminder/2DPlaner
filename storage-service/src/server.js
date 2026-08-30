require("dotenv").config();
const express = require("express");
const { verifyCredentials, issueSessionToken, requireSession, SESSION_TTL_SECONDS } = require("./auth");
const plans = require("./plans");

const app = express();
app.use(express.json());

// D-021's login step: verify once, issue a signed session token, no WP round-trip on
// every subsequent request. verifyCredentials is stubbed (see src/auth.js) until D-019's
// WordPress instance exists — this route itself doesn't change when that's swapped in.
// Wrapped in try/catch because Express 4 doesn't catch a rejected promise from an async
// handler on its own — an unexpected error in the real (future) WP-backed
// verifyCredentials would otherwise just hang the request with no response at all.
app.post("/session", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username and password are required" });
    const user = await verifyCredentials(username, password);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const token = issueSessionToken(user);
    res.json({ token, expiresIn: SESSION_TTL_SECONDS });
  } catch (e) {
    console.error("POST /session failed:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/plans", requireSession, (req, res) => {
  res.json({ plans: plans.listPlans(req.userId) });
});

app.get("/plans/:id", requireSession, (req, res) => {
  const plan = plans.getPlan(req.userId, req.params.id);
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  res.json(plan);
});

app.post("/plans", requireSession, (req, res) => {
  const { name, text } = req.body || {};
  if (!name || typeof text !== "string") return res.status(400).json({ error: "name and text are required" });
  res.status(201).json(plans.createPlan(req.userId, name, text));
});

app.put("/plans/:id", requireSession, (req, res) => {
  const { name, text } = req.body || {};
  const updated = plans.updatePlan(req.userId, req.params.id, { name, text });
  if (!updated) return res.status(404).json({ error: "Plan not found" });
  res.json(updated);
});

app.delete("/plans/:id", requireSession, (req, res) => {
  const deleted = plans.deletePlan(req.userId, req.params.id);
  if (!deleted) return res.status(404).json({ error: "Plan not found" });
  res.status(204).end();
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`storage-service listening on port ${PORT}`));
}

module.exports = app;
