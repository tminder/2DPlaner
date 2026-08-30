<?php
// Same token flow as the original Node prototype's D-021 design — this service never
// trusts a client-presented user id directly; a session starts with verify_credentials(),
// and every later request carries a token this service itself signed, checked locally
// with no per-request round-trip to WordPress.
//
// Hand-rolled HMAC-signed token rather than a JWT library: no Composer dependency needed
// for something this small, and — a deliberate security property, not just a shortcut —
// it supports exactly one algorithm (HMAC-SHA256) with no "alg" field to negotiate at
// all, sidestepping the whole class of real-world JWT bugs where a verifier ends up
// trusting a client-supplied algorithm choice (e.g. "alg: none").

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
}

function session_ttl_seconds(): int { return 60 * 60; } // 1 hour — D-021's "short-lived"

function issue_session_token(array $config, array $user): string {
    $payload = ['sub' => $user['id'], 'username' => $user['username'], 'exp' => time() + session_ttl_seconds()];
    $body = base64url_encode(json_encode($payload));
    $sig = base64url_encode(hash_hmac('sha256', $body, $config['session_secret'], true));
    return $body . '.' . $sig;
}

function verify_session_token(array $config, string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 2) return null;
    [$body, $sig] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', $body, $config['session_secret'], true));
    if (!hash_equals($expected, $sig)) return null; // constant-time comparison
    $payload = json_decode(base64url_decode($body), true);
    if (!is_array($payload) || !isset($payload['exp']) || $payload['exp'] < time()) return null;
    return $payload;
}

// STUBBED — D-019's real WordPress instance doesn't exist yet, so this checks a single
// dev account from config instead of WP's REST API. Everything downstream only depends
// on this returning a stable ['id' => ..., 'username' => ...] or null — nothing else
// needs to change once it's swapped. The real implementation, for when a WP instance
// exists:
//
//   function verify_credentials(array $config, PDO $db, string $username, string $password): ?array {
//       $ch = curl_init(rtrim($config['wp_url'], '/') . '/wp-json/wp/v2/users/me');
//       curl_setopt_array($ch, [
//           CURLOPT_RETURNTRANSFER => true,
//           CURLOPT_USERPWD => "$username:$password", // a WP Application Password, not the account's real login password
//       ]);
//       $body = curl_exec($ch);
//       $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
//       curl_close($ch);
//       if ($status !== 200) return null;
//       $wpUser = json_decode($body, true);
//       return ensure_user($db, (string) $wpUser['id'], $wpUser['slug']); // WP's own id becomes this service's user id
//   }
function verify_credentials(array $config, PDO $db, string $username, string $password): ?array {
    if ($username === $config['dev_username'] && $password === $config['dev_password']) {
        return ensure_user($db, $username, $username);
    }
    return null;
}

// A user row is created lazily on first successful login rather than via a separate
// register step — WordPress (once wired in) is the actual source of truth for who's a
// valid user at all; this service only needs a stable local id to own plans against.
function ensure_user(PDO $db, string $id, string $username): array {
    $stmt = $db->prepare('SELECT id, username FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($existing) return $existing;
    $db->prepare('INSERT INTO users (id, username) VALUES (?, ?)')->execute([$id, $username]);
    return ['id' => $id, 'username' => $username];
}
