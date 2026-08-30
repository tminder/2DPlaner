<?php
require __DIR__ . '/../app/src/http.php';
require __DIR__ . '/../app/src/db.php';
require __DIR__ . '/../app/src/auth.php';

$config = require __DIR__ . '/../app/config.local.php';
apply_cors($config['allowed_origins']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(405, ['error' => 'Method not allowed']);
}

$body = read_json_body();
$username = $body['username'] ?? null;
$password = $body['password'] ?? null;
if (!$username || !$password) {
    send_json(400, ['error' => 'username and password are required']);
}

try {
    $db = get_db($config);
    $user = verify_credentials($config, $db, $username, $password);
    if (!$user) {
        send_json(401, ['error' => 'Invalid credentials']);
    }
    $token = issue_session_token($config, $user);
    send_json(200, ['token' => $token, 'expiresIn' => session_ttl_seconds()]);
} catch (Throwable $e) {
    error_log('session.php: ' . $e->getMessage());
    send_json(500, ['error' => 'Internal error']);
}
