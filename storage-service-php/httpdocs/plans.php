<?php
// Query-string-based routing (?id=...) rather than path-based (/plans/:id) — deliberately
// avoids depending on mod_rewrite/.htaccess being configured on this account at all;
// every route in this file is reachable as a plain, directly-requested .php file.
require __DIR__ . '/../app/src/http.php';
require __DIR__ . '/../app/src/db.php';
require __DIR__ . '/../app/src/auth.php';
require __DIR__ . '/../app/src/plans_repo.php';

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
    error_log('plans.php db connection: ' . $e->getMessage());
    send_json(500, ['error' => 'Internal error']);
}

$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

try {
    if ($method === 'GET' && $id === null) {
        send_json(200, ['plans' => list_plans($db, $userId)]);
    } elseif ($method === 'GET') {
        $plan = get_plan($db, $userId, $id);
        if (!$plan) send_json(404, ['error' => 'Plan not found']);
        send_json(200, $plan);
    } elseif ($method === 'POST') {
        $body = read_json_body();
        $name = $body['name'] ?? null;
        $text = $body['text'] ?? null;
        if (!$name || !is_string($text)) send_json(400, ['error' => 'name and text are required']);
        send_json(201, create_plan($db, $userId, $name, $text));
    } elseif ($method === 'PUT' && $id !== null) {
        $body = read_json_body();
        $updated = update_plan($db, $userId, $id, $body['name'] ?? null, $body['text'] ?? null);
        if (!$updated) send_json(404, ['error' => 'Plan not found']);
        send_json(200, $updated);
    } elseif ($method === 'DELETE' && $id !== null) {
        $deleted = delete_plan($db, $userId, $id);
        if (!$deleted) send_json(404, ['error' => 'Plan not found']);
        http_response_code(204); // no body on a 204, unlike every other response here
        exit;
    } else {
        send_json(400, ['error' => 'Invalid request']);
    }
} catch (Throwable $e) {
    error_log('plans.php: ' . $e->getMessage());
    send_json(500, ['error' => 'Internal error']);
}
