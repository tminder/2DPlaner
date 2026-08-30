<?php
// D-058: self-service registration, deferred until rate limiting existed (D-055/D-056)
// to guard exactly this endpoint. Two steps, not one: create the WordPress account (via
// the bot-admin credential, D-019's "no plugin" constraint means this needs a full
// Administrator, not a narrower role — see config.example.php), then require email
// verification before the account can actually sign in (checked in auth.php's
// verify_credentials, not here) — this endpoint only ever creates an *unverified* row.

// Thrown for anything that should surface as a specific, user-facing error rather than a
// generic 500 — invalid input, WordPress rejecting the username/email as taken, etc.
class RegistrationException extends Exception {}

// WordPress needs *some* username internally (its own core concept, distinct from email
// or display name) — but there's no reason a visitor should have to invent one just to
// register. Derived from the email's own local part instead: lowercased, stripped to
// what WP's own username rules accept, "user" as a fallback if that leaves nothing
// usable (an email starting with only symbols, say). Collisions are handled by the
// retry loop in create_wp_user() below, not here — this only ever proposes a first guess.
function derive_username(string $email): string {
    $local = strstr($email, '@', true);
    if ($local === false) $local = $email;
    $base = strtolower(preg_replace('/[^a-z0-9._-]+/i', '', $local));
    return $base !== '' ? $base : 'user';
}

// Creates the WordPress account itself, as the bot-admin, forcing role=subscriber
// server-side — never accepts a role from the caller. The username is derived from the
// email (derive_username() above) and retried with a numeric suffix on collision — WP's
// own REST API returns the specific error code "existing_user_login" for that case,
// checked for by name rather than treating every rejection as retryable, since an
// "existing_user_email" (a genuine duplicate account) or an invalid password should fail
// immediately, not loop. Returns WP's own {id, slug} — the slug is what actually got
// used, which may carry a suffix the caller (and the visitor, on the confirmation page)
// needs to know about.
function create_wp_user(array $config, string $email, string $password): array {
    $base = derive_username($email);
    for ($suffix = 0; $suffix <= 20; $suffix++) {
        $username = $suffix === 0 ? $base : "{$base}{$suffix}";

        $ch = curl_init(rtrim($config['wp_url'], '/') . '/wp-json/wp/v2/users');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_USERPWD => $config['bot_username'] . ':' . $config['bot_password'],
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode([
                'username' => $username,
                'email' => $email,
                'password' => $password,
                'roles' => ['subscriber'],
            ]),
            CURLOPT_TIMEOUT => 10,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if (curl_errno($ch)) {
            error_log('create_wp_user: WP request failed: ' . curl_error($ch));
            curl_close($ch);
            throw new RegistrationException('Could not reach the account service — try again shortly');
        }
        curl_close($ch);

        $data = json_decode($body, true);
        if ($status === 201) {
            if (!is_array($data) || !isset($data['id'], $data['slug'])) {
                throw new RegistrationException('Unexpected response from the account service');
            }
            return ['id' => (string) $data['id'], 'slug' => $data['slug']];
        }

        $code = is_array($data) ? ($data['code'] ?? '') : '';
        if ($code !== 'existing_user_login') {
            // Any other rejection (duplicate email, invalid password, ...) is real and
            // not fixed by trying a different username — relay WP's own message as-is,
            // since WP is the actual source of truth for what's valid.
            $reason = is_array($data) && isset($data['message']) ? $data['message'] : 'Registration failed';
            throw new RegistrationException($reason);
        }
        // else: this exact username is taken, loop and try the next suffix
    }
    throw new RegistrationException('Could not find an available username — try a different email');
}

// Inserts the local, unverified row and its verification token — separate from
// ensure_user() in auth.php, which is for the *lazy*, already-trusted path (an account
// created directly in WordPress, e.g. via WP-CLI) and always inserts as verified.
function create_unverified_user(PDO $db, string $id, string $username): string {
    $token = bin2hex(random_bytes(32));
    $expires = time() + 86400; // 24 hours to click the link
    $db->prepare('INSERT INTO users (id, username, verified, verify_token, verify_token_expires) VALUES (?, ?, 0, ?, ?)')
        ->execute([$id, $username, $token, $expires]);
    return $token;
}

function send_verification_email(array $config, string $email, string $username, string $token): void {
    $link = rtrim($config['site_url'], '/') . '/verify.php?token=' . urlencode($token);
    $subject = 'Confirm your Planagonia account';
    $body = "Hi $username,\n\n"
        . "Click the link below to confirm your Planagonia account:\n\n"
        . "$link\n\n"
        . "This link expires in 24 hours. If you didn't request this, you can ignore this email.\n";
    $headers = 'From: ' . $config['mail_from'];
    // mail()'s own return value only confirms the message was handed to the local MTA,
    // not that it was ever delivered — logged either way, never surfaced as a hard
    // failure to the visitor, since the WordPress account already exists at this point
    // regardless of whether the email arrives (a resend path isn't built, see the
    // README's own "Not built yet" note on that gap).
    if (!mail($email, $subject, $body, $headers)) {
        error_log("send_verification_email: mail() returned false for $email");
    }
}

// Looks up a pending verification token, marks the account verified if it's valid and
// unexpired, and always clears the token afterward either way — a used or expired token
// is never valid a second time. Returns the account's {id, username} on success (the
// caller needs both — id to generate an Application Password next, username to show it
// to the visitor alongside it), null otherwise.
function consume_verify_token(PDO $db, string $token): ?array {
    $stmt = $db->prepare('SELECT id, username, verify_token_expires FROM users WHERE verify_token = ?');
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;

    $valid = $row['verify_token_expires'] !== null && (int) $row['verify_token_expires'] >= time();
    if ($valid) {
        $db->prepare('UPDATE users SET verified = 1, verify_token = NULL, verify_token_expires = NULL WHERE id = ?')
            ->execute([$row['id']]);
    } else {
        $db->prepare('UPDATE users SET verify_token = NULL, verify_token_expires = NULL WHERE id = ?')
            ->execute([$row['id']]);
    }
    return $valid ? ['id' => $row['id'], 'username' => $row['username']] : null;
}

// Generates an Application Password *for the newly-verified user*, as the bot-admin —
// the real fix for the gap found by actually testing this end to end: a self-registered
// account's own WordPress password was never going to work against the REST API at all
// (Basic Auth there only ever accepts an Application Password, not a real login
// password, the same way every other login in this project has worked since D-019).
// Generating one automatically at verification time means a visitor never has to know
// their WP account has a separate "real" password at all, let alone visit wp-admin to
// generate this themselves — the entire point of D-019's "WordPress never renders the
// app's UI" is preserved even through registration, not just ordinary sign-in.
function create_application_password_for_user(array $config, string $userId): string {
    $ch = curl_init(rtrim($config['wp_url'], '/') . "/wp-json/wp/v2/users/$userId/application-passwords");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERPWD => $config['bot_username'] . ':' . $config['bot_password'],
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['name' => 'Planagonia (registration)']),
        CURLOPT_TIMEOUT => 10,
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = json_decode($body, true);
    if ($status !== 201 || !is_array($data) || !isset($data['password'])) {
        error_log('create_application_password_for_user: unexpected WP response, status ' . $status);
        throw new RegistrationException('Your account was verified, but creating a sign-in credential failed — contact support.');
    }
    return $data['password'];
}
