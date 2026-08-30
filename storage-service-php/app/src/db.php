<?php
// MySQL via PHP's built-in pdo_mysql — plain SQL, no ORM, matching D-021's "essentially
// CRUD... nothing more" scope. Started as SQLite (one file, zero provisioning) but moved
// to MySQL on request: this hosting's own automatic-backup coverage is understood to
// apply to its provisioned databases, not necessarily to an arbitrary file sitting in a
// webspace — a real practical reason, on top of the panel already offering database
// provisioning as a first-class feature. The database itself has to be created via the
// hosting portal first (a plain SQLite file needed no such step) — see
// config.example.php and the README for what to fill in once it exists.
//
// Column types differ from the earlier SQLite version where MySQL requires it: VARCHAR
// with an explicit length for primary/foreign key columns (MySQL can't index a bare TEXT
// column without one), LONGTEXT for plan source (a plain TEXT column caps at 64KB, too
// small a ceiling to assume every plan will always fit under), BIGINT for updated_at
// (an epoch-milliseconds timestamp already exceeds a 32-bit INT's range today, not just
// eventually). plans_repo.php itself needed no changes — it only ever talks to PDO via
// plain prepared statements, which is the point of isolating the connection here.

function get_db(array $config): PDO {
    static $db = null;
    if ($db !== null) return $db;

    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['db_host'], $config['db_name']);
    $db = new PDO($dsn, $config['db_user'], $config['db_password']);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $db->exec('CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        verified TINYINT(1) NOT NULL DEFAULT 1,
        verify_token VARCHAR(64) NULL,
        verify_token_expires BIGINT NULL
    ) ENGINE=InnoDB');
    // Added after the table already existed in production (self-registration, D-058) —
    // ALTER TABLE has no portable "IF NOT EXISTS" for a single column across older
    // MySQL/MariaDB versions this hosting's exact version isn't pinned down anywhere in
    // this project, so this just tries each one and swallows the "column already exists"
    // failure rather than checking INFORMATION_SCHEMA first for something this cheap to
    // just attempt. verified defaults to 1 (trusted) — an admin-provisioned account
    // (created via WP-CLI, like every account before self-registration existed) never
    // went through email verification and shouldn't be locked out by a column that
    // didn't exist when it was created; only accounts created through /register.php
    // explicitly insert with verified = 0.
    foreach ([
        'ALTER TABLE users ADD COLUMN verified TINYINT(1) NOT NULL DEFAULT 1',
        'ALTER TABLE users ADD COLUMN verify_token VARCHAR(64) NULL',
        'ALTER TABLE users ADD COLUMN verify_token_expires BIGINT NULL',
    ] as $alter) {
        try { $db->exec($alter); } catch (PDOException $e) { /* column already exists */ }
    }
    $db->exec('CREATE TABLE IF NOT EXISTS plans (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        text LONGTEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        INDEX idx_plans_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB');

    // D-022's rate-limiting gap, closed (D-056) — see src/rate_limit.php. One row per
    // (endpoint, identifier) pair, holding a fixed time window's own request count.
    $db->exec('CREATE TABLE IF NOT EXISTS rate_limits (
        bucket_key VARCHAR(191) PRIMARY KEY,
        window_start BIGINT NOT NULL,
        count INT NOT NULL DEFAULT 1
    ) ENGINE=InnoDB');

    return $db;
}
