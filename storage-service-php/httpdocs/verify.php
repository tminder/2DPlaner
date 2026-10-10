<?php
// The one HTML-rendering endpoint in an otherwise pure-JSON API — a verification link
// is clicked directly from an email client, so it has to be a real page, not a fetch()
// response. Deliberately minimal, not styled to match the main site's own pages (D-055's
// shared header/footer chrome) — this lives on api.planagonia.com, a different origin
// entirely, and a visitor only ever sees it once, for a few seconds.
require __DIR__ . '/../app/src/db.php';
require __DIR__ . '/../app/src/auth.php';
require __DIR__ . '/../app/src/registration.php';

$config = require __DIR__ . '/../app/config.local.php';
$token = $_GET['token'] ?? '';

$verified = null;
$appPassword = null;
$appPasswordError = null;
$sessionToken = null;
if ($token !== '') {
    try {
        $db = get_db($config);
        $verified = consume_verify_token($db, $token);
        if ($verified) {
            // Generated here, not at registration time, and shown exactly once — the
            // real credential going forward, since a self-registered account's own WP
            // password can never authenticate against the REST API (Basic Auth there
            // only ever accepts an Application Password). See registration.php's own
            // comment on this function for the full reasoning.
            try {
                $appPassword = create_application_password_for_user($config, $verified['id']);
            } catch (RegistrationException $e) {
                $appPasswordError = $e->getMessage();
            }
            // F-063: sign the visitor in directly too, not just hand them a credential to
            // carry over and type into the sign-in form themselves -- the whole point of
            // reaching this page at all was proving they own this email/account, exactly
            // what signing in also requires. Needs no extra WP round-trip beyond what's
            // already happened above; issue_session_token's own 'name' fallback (username)
            // covers a brand-new account correctly, since WordPress gives a fresh user no
            // display name of its own yet. The Application Password above is kept, not
            // replaced -- still the one real credential for typing into the sign-in form
            // by hand later, or for any non-browser use; this just means nobody is ever
            // *forced* to do that the very first time.
            $sessionToken = issue_session_token($config, $verified);
        }
    } catch (Throwable $e) {
        error_log('verify.php: ' . $e->getMessage());
    }
}

$accountUrl = rtrim($config['site_url'], '/') . '/account/';
$accountSignInUrl = $sessionToken ? $accountUrl . '?session=' . urlencode($sessionToken) : $accountUrl;
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title><?= $verified ? 'Account confirmed' : 'Verification failed' ?> — Planagonia</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #f7f4ee; color: #221f1c; font-family: system-ui, sans-serif; text-align: center; padding: 1.5rem; }
  main { max-width: 28rem; }
  h1 { font-size: 1.3rem; }
  a { color: #1e4457; }
  .credentials { background: #fff; border: 1px solid #d8d2c6; border-radius: 10px; padding: 1.2rem;
    margin: 1.2rem 0; text-align: left; font-size: 0.92rem; }
  .credentials dt { color: #5b5650; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.7rem; }
  .credentials dt:first-child { margin-top: 0; }
  .credentials dd { margin: 0.15rem 0 0; font-family: ui-monospace, Consolas, monospace; word-break: break-all; }
  .warn { font-size: 0.82rem; color: #a63d34; margin-top: 0.9rem; }
</style>
</head>
<body>
<main>
<?php if ($verified && $appPassword): ?>
  <h1>You're confirmed and signed in</h1>
  <p>Continue to your profile — or save this password first, if you'd rather sign in by hand another time (shown only once):</p>
  <dl class="credentials">
    <dt>Username</dt>
    <dd><?= htmlspecialchars($verified['username']) ?></dd>
    <dt>Password</dt>
    <dd><?= htmlspecialchars($appPassword) ?></dd>
  </dl>
  <p><a href="<?= htmlspecialchars($accountSignInUrl) ?>">Continue to Account →</a></p>
<?php elseif ($verified): ?>
  <h1>You're confirmed and signed in</h1>
  <p>One thing didn't work: <?= htmlspecialchars($appPasswordError) ?> — you're still signed in for now, but if you sign out, getting back in by hand may not work until this is looked into. Contact support if that happens.</p>
  <p><a href="<?= htmlspecialchars($accountSignInUrl) ?>">Continue to Account →</a></p>
<?php else: ?>
  <h1>This link isn't valid</h1>
  <p>It may have already been used, or it's expired (verification links are valid for 24 hours).</p>
<?php endif; ?>
</main>
</body>
</html>
