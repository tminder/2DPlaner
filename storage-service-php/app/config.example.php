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

    // Origins allowed to call this API cross-origin (see src/http.php's apply_cors()).
    // docs/ is served from GitHub Pages, a different origin than this service — add a
    // local dev origin here too (e.g. "http://localhost:5500") if testing docs/ locally
    // against this live service.
    'allowed_origins' => ['https://tminder.github.io'],

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

    // D-058 self-service registration. bot_username/bot_password are a *dedicated*
    // WordPress Administrator account's own Application Password (never the site
    // owner's real admin login) — WP has no built-in role narrower than Administrator
    // that can create other users via the REST API, and adding one would need custom
    // code running inside WP (a plugin or mu-plugin), which D-019 deliberately avoids.
    // Keeping this account separate from the owner's own means it can be revoked/rotated
    // independently, and its actions are attributable to "the registration bot"
    // specifically rather than mixed into the owner's own admin activity.
    'bot_username' => 'change-me',
    'bot_password' => 'change-me-too',

    // Used to build the verification link sent by email, and as the From: address for
    // that email. Must be on a domain with real outbound mail authentication (SPF/DKIM/
    // DMARC) set up, or verification emails are likely to be spam-filtered or rejected
    // outright — confirmed present for this project's own domain before building this.
    'site_url' => 'https://www.planagonia.com',
    'mail_from' => 'noreply@planagonia.com',
];
