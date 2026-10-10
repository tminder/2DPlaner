<?php
// F-056: serves one user-authored module's raw JS, for a plan's own `module "..."`
// declaration to load via a plain <script src> tag — which can't attach an Authorization
// header at all, so this deliberately has NO auth check, by design: a module's own `id`
// (a random 32-hex-char string, same shape as a plan id) is the only thing that gates
// access, exactly like today's external-module model is already "unlisted by default."
// Kept as its own small file rather than a branch inside modules.php specifically so this
// one "no auth at all" path stays trivially auditable on its own, the same reasoning
// verify.php (the other no-auth endpoint in this service) was already kept separate for.
//
// No apply_cors() either -- a <script src> load isn't subject to CORS the way fetch/XHR
// is, confirmed by how every other external module already loads today with no CORS
// handling on its own host.
require __DIR__ . '/../app/src/http.php';
require __DIR__ . '/../app/src/db.php';
require __DIR__ . '/../app/src/user_modules_repo.php';
require __DIR__ . '/../app/src/rate_limit.php';

$config = require __DIR__ . '/../app/config.local.php';

$id = $_GET['id'] ?? '';
if ($id === '') {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo '// Missing id';
    exit;
}

try {
    $db = get_db($config);
    // By IP, not module id -- there's no authenticated identity here at all, and a
    // single plan load fetches at most a handful of declared modules, same shape as
    // session.php's own pre-auth IP bucket.
    enforce_rate_limit($db, 'module-code:' . client_ip(), 300, 900);
    $code = get_module_code_by_id($db, $id);
} catch (Throwable $e) {
    error_log('module-code.php: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo '// Internal error';
    exit;
}

if ($code === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo '// Module not found';
    exit;
}

header('Content-Type: application/javascript; charset=utf-8');
echo $code;
