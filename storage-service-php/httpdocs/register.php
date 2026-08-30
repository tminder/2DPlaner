<?php
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
$password = (string) ($body['password'] ?? '');

// No username field — WordPress needs one internally, but there's no reason a visitor
// should have to invent it; create_wp_user() derives one from the email and handles any
// collision itself (see registration.php's own comment on derive_username()).
if ($email === '' || $password === '') {
    send_json(400, ['error' => 'email and password are required']);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    send_json(400, ['error' => 'That doesn\'t look like a valid email address']);
}
if (strlen($password) < 8) {
    send_json(400, ['error' => 'Password must be at least 8 characters']);
}

try {
    $db = get_db($config);
    // Strict and IP-based — there's no account yet to key off of, and this is exactly
    // the endpoint D-055 flagged as needing rate limiting before it could exist at all.
    enforce_rate_limit($db, 'register:' . client_ip(), 5, 3600); // 5 registrations / hour

    $wpUser = create_wp_user($config, $email, $password);
    $token = create_unverified_user($db, $wpUser['id'], $wpUser['slug']);
    send_verification_email($config, $email, $wpUser['slug'], $token);

    send_json(201, ['message' => 'Check your email to confirm your account before signing in.']);
} catch (RegistrationException $e) {
    send_json(400, ['error' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('register.php: ' . $e->getMessage());
    send_json(500, ['error' => 'Internal error']);
}
