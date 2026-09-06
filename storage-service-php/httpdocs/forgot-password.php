<?php
// D-058's own follow-up: reissue a sign-in credential for an *existing* WP account,
// reusing the whole register->verify machinery unchanged (verify.php's consume_verify_token
// already marks an account verified and generates a fresh Application Password
// regardless of prior state -- the only missing piece was a way to get a fresh token
// emailed to an account that already exists, whether it lost its one-time password or
// never had one at all, e.g. a WP-CLI-provisioned account).
require __DIR__ . '/../app/src/http.php';
require __DIR__ . '/../app/src/db.php';
require __DIR__ . '/../app/src/auth.php';
require __DIR__ . '/../app/src/registration.php';
require __DIR__ . '/../app/src/rate_limit.php';

$config = require __DIR__ . '/../app/config.local.php';
apply_cors($config['allowed_origins']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(405, ['error' => 'Method not allowed']);
}

$body = read_json_body();
$email = trim($body['email'] ?? '');
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    send_json(400, ['error' => 'That doesn\'t look like a valid email address']);
}

try {
    $db = get_db($config);
    enforce_rate_limit($db, 'forgot:' . client_ip(), 5, 3600); // same shape as register.php's own limit

    $wpUser = find_wp_user_by_email($config, $email);
    if ($wpUser) {
        // Guarantees a local row exists even for an account that never had one (a
        // WP-CLI-provisioned account that's never signed in here before) -- verified
        // defaults to 1 there (D-019's own "admin-provisioned, already trusted" rule),
        // which is fine: this request already proves ownership of the account's email.
        ensure_user($db, $wpUser['id'], $wpUser['username']);
        $token = issue_password_reset_token($db, $wpUser['id']);
        send_verification_email($config, $email, $wpUser['username'], $token);
    }
    // Identical response whether or not the email was found -- never reveal which
    // emails are registered.
    send_json(200, ['message' => 'If that email is registered, we\'ve sent a link to get a fresh sign-in credential.']);
} catch (Throwable $e) {
    error_log('forgot-password.php: ' . $e->getMessage());
    send_json(500, ['error' => 'Internal error']);
}
