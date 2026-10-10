<?php
// F-058: a signed-in user's own display name -- see update_wp_display_name's own comment
// (registration.php) for why this is the one piece of self-service account management
// that's actually achievable; a real username-change endpoint isn't offered because
// WordPress itself has no way to honor one, not because it was left out of scope here.
require __DIR__ . '/../app/src/http.php';
require __DIR__ . '/../app/src/db.php';
require __DIR__ . '/../app/src/auth.php';
require __DIR__ . '/../app/src/registration.php';
require __DIR__ . '/../app/src/rate_limit.php';

$config = require __DIR__ . '/../app/config.local.php';
apply_cors($config['allowed_origins']);

$token = bearer_token_from_headers();
if (!$token) {
    send_json(401, ['error' => 'Missing session token']);
}
$payload = verify_session_token($config, $token);
if (!$payload) {
    send_json(401, ['error' => 'Invalid or expired session token']);
}
$userId = $payload['sub'];

try {
    $db = get_db($config);
} catch (Throwable $e) {
    error_log('profile.php db connection: ' . $e->getMessage());
    send_json(500, ['error' => 'Internal error']);
}

// A profile edit is a rare, deliberate action, not something a UI ever calls in a loop --
// generous but real, same shape modules.php/plans.php's own limits already use.
enforce_rate_limit($db, 'profile:' . $userId, 60, 900);

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'PUT') {
        $body = read_json_body();
        $name = is_string($body['name'] ?? null) ? trim($body['name']) : '';
        if ($name === '') {
            send_json(400, ['error' => 'name is required']);
        }
        if (mb_strlen($name) > 60) {
            send_json(400, ['error' => 'name is too long']);
        }
        $updatedName = update_wp_display_name($config, $userId, $name);
        send_json(200, ['name' => $updatedName]);
    } else {
        send_json(400, ['error' => 'Invalid request']);
    }
} catch (RegistrationException $e) {
    send_json(400, ['error' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('profile.php: ' . $e->getMessage());
    send_json(500, ['error' => 'Internal error']);
}
