<?php
// D-022's rate-limiting gap, closed. Fixed-window counter, not a sliding window or token
// bucket — simpler to reason about and correct enough for this project's actual scale
// (a small prototype, not a high-traffic API); a burst right at a window boundary can
// momentarily allow closer to 2x the stated limit, an accepted, understood
// simplification rather than an overlooked edge case.
//
// State lives in MySQL (the `rate_limits` table, db.php), not APCu or a file — the
// already-established, confirmed-working persistence mechanism (D-021/D-048), correct
// across every PHP-FPM worker process without needing to check whether this specific
// hosting even has an in-memory cache extension enabled.

// Returns true if the request is allowed (and counts it), false if the limit is already
// hit for this window (the request that tips it over the edge is itself counted, so the
// *next* one is what actually gets rejected — the limit is "at most $maxRequests allowed
// to have started," not "$maxRequests failures before the first rejection").
function check_rate_limit(PDO $db, string $bucketKey, int $maxRequests, int $windowSeconds): bool {
    $now = time();
    $windowStart = intdiv($now, $windowSeconds) * $windowSeconds;

    // Opportunistic cleanup rather than a cron job — cheap (indexed range delete) at
    // this project's real request volume, and avoids needing scheduled-task access on
    // shared hosting for something this small.
    $db->prepare('DELETE FROM rate_limits WHERE window_start < ?')->execute([$windowStart - $windowSeconds]);

    // Same window as last time this bucket was touched -> increment; a new window ->
    // reset to 1. VALUES() is deprecated (not yet removed) as of MySQL 8.0.20 in favor of
    // an alias syntax; kept for broader MySQL/MariaDB version compatibility since this
    // hosting's exact version isn't pinned down anywhere in this project.
    $stmt = $db->prepare('
        INSERT INTO rate_limits (bucket_key, window_start, count)
        VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE
            count = IF(window_start = VALUES(window_start), count + 1, 1),
            window_start = VALUES(window_start)
    ');
    $stmt->execute([$bucketKey, $windowStart]);

    $check = $db->prepare('SELECT count FROM rate_limits WHERE bucket_key = ?');
    $check->execute([$bucketKey]);
    return ((int) $check->fetchColumn()) <= $maxRequests;
}

function client_ip(): string {
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

// Sends 429 and exits if the bucket is over its limit — call sites just need the bucket
// key and limits, not the response mechanics.
function enforce_rate_limit(PDO $db, string $bucketKey, int $maxRequests, int $windowSeconds): void {
    if (!check_rate_limit($db, $bucketKey, $maxRequests, $windowSeconds)) {
        header("Retry-After: $windowSeconds");
        send_json(429, ['error' => 'Too many requests — try again shortly']);
    }
}
