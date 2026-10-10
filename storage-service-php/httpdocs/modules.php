<?php
// F-056: CRUD for a signed-in user's own modules, for profile/index.html's dashboard —
// structurally copied from plans.php (same auth gate, same query-string routing, same
// rate-limit shape) since this is the same kind of per-user-scoped resource plans already
// are. The actual public serving of a module's own code (no auth at all, by design) is a
// deliberately separate file, module-code.php — see its own comment for why.
require __DIR__ . '/../app/src/http.php';
require __DIR__ . '/../app/src/db.php';
require __DIR__ . '/../app/src/auth.php';
require __DIR__ . '/../app/src/user_modules_repo.php';
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
    error_log('modules.php db connection: ' . $e->getMessage());
    send_json(500, ['error' => 'Internal error']);
}

// Same generosity as plans.php's own limit — this is only ever called from the profile
// dashboard (list/create/edit/delete), never on every keystroke.
enforce_rate_limit($db, 'modules:' . $userId, 300, 900);

function valid_visibility(?string $v): bool {
    return $v === null || $v === 'private' || $v === 'public';
}

$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

try {
    if ($method === 'GET' && $id === null) {
        send_json(200, ['modules' => list_modules($db, $userId)]);
    } elseif ($method === 'GET') {
        $module = get_module($db, $userId, $id);
        if (!$module) send_json(404, ['error' => 'Module not found']);
        send_json(200, $module);
    } elseif ($method === 'POST') {
        $body = read_json_body();
        $name = is_string($body['name'] ?? null) ? trim($body['name']) : '';
        $code = $body['code'] ?? null;
        $visibility = is_string($body['visibility'] ?? null) ? $body['visibility'] : 'private';
        if ($name === '' || !is_string($code) || $code === '') {
            send_json(400, ['error' => 'name and code are required']);
        }
        if (strlen($code) > 200000) {
            send_json(400, ['error' => 'Module code is too large']);
        }
        if (!valid_visibility($visibility)) {
            send_json(400, ['error' => 'visibility must be "private" or "public"']);
        }
        send_json(201, create_module($db, $userId, $name, $code, $visibility));
    } elseif ($method === 'PUT' && $id !== null) {
        $body = read_json_body();
        $name = isset($body['name']) ? (string) $body['name'] : null;
        $code = isset($body['code']) ? (string) $body['code'] : null;
        $visibility = isset($body['visibility']) ? (string) $body['visibility'] : null;
        if ($code !== null && strlen($code) > 200000) {
            send_json(400, ['error' => 'Module code is too large']);
        }
        if ($visibility !== null && !valid_visibility($visibility)) {
            send_json(400, ['error' => 'visibility must be "private" or "public"']);
        }
        $updated = update_module($db, $userId, $id, $name, $code, $visibility);
        if (!$updated) send_json(404, ['error' => 'Module not found']);
        send_json(200, $updated);
    } elseif ($method === 'DELETE' && $id !== null) {
        $deleted = delete_module($db, $userId, $id);
        if (!$deleted) send_json(404, ['error' => 'Module not found']);
        http_response_code(204);
        exit;
    } else {
        send_json(400, ['error' => 'Invalid request']);
    }
} catch (Throwable $e) {
    error_log('modules.php: ' . $e->getMessage());
    send_json(500, ['error' => 'Internal error']);
}
