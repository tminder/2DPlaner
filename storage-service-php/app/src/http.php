<?php
// Small shared helpers — no framework, matching D-021's "essentially CRUD... nothing
// more" scope and this project's standing preference for plain code over dependencies
// at this size.

function send_json(int $status, array $body): never {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($body);
    exit;
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// Reads the bearer token from the Authorization header. Deliberately checks three
// places, not just $_SERVER['HTTP_AUTHORIZATION'] — a known, common gotcha on shared
// Apache/PHP-FPM hosting is that the Authorization header isn't passed through to PHP by
// default at all (stripped before PHP ever sees it), needing either
// REDIRECT_HTTP_AUTHORIZATION (set when a .htaccess rewrite rule captures it) or
// getallheaders() as a fallback — see README's troubleshooting note if this still comes
// back null on the actual server.
function bearer_token_from_headers(): ?string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
    if ($header === null && function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) { $header = $value; break; }
        }
    }
    if ($header === null || !str_starts_with($header, 'Bearer ')) return null;
    return substr($header, 7);
}
