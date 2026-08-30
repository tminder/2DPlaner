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
        username VARCHAR(255) UNIQUE NOT NULL
    ) ENGINE=InnoDB');
    $db->exec('CREATE TABLE IF NOT EXISTS plans (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        text LONGTEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        INDEX idx_plans_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB');

    return $db;
}
