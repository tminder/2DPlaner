<?php
// Copy to config.local.php (gitignored, never commit it) and fill in real values.
// Uploaded directly to the server alongside this directory — never through git.
return [
    // HMAC secret session tokens are signed with (see src/auth.php). Any long random
    // string, e.g. generate one with: php -r "echo bin2hex(random_bytes(48));"
    'session_secret' => 'change-me-to-a-long-random-string',

    // D-019's WordPress instance, used purely as a credential-verification backend via
    // its REST API — see src/auth.php's verify_credentials(). Requires pretty permalinks
    // to be enabled on that WP instance (plain/default permalinks route /wp-json/... to
    // the homepage instead of the REST API — a real issue found by testing, not a
    // theoretical one; fix there with `wp rewrite structure "/%postname%/"` followed by
    // `wp rewrite flush --hard`).
    'wp_url' => 'https://auth.planagonia.com',

    // MySQL connection — create the database via the hosting portal's "Datenbanken"
    // feature first, then fill in exactly what it shows you.
    //
    // db_host: use "127.0.0.1", not "localhost", even though the portal itself may
    // display "localhost" as the hostname. PDO/mysqli treat the literal string
    // "localhost" as a signal to connect via a Unix socket rather than TCP — on this
    // hosting (confirmed by testing against the real target server), PHP's compiled-in
    // default socket path doesn't match where the socket actually is, producing
    // SQLSTATE[HY000] [2002] "No such file or directory". "127.0.0.1" forces a real TCP
    // loopback connection instead, which works regardless of socket path.
    'db_host' => '127.0.0.1',
    'db_name' => 'change-me',
    'db_user' => 'change-me',
    'db_password' => 'change-me-too',
];
