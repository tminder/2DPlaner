<?php
// D-021: "essentially CRUD for plan text under {userId, name}." Shape deliberately
// mirrors docs/'s own client-side plan model (D-043's {id, name, text, updatedAt} plan
// list) rather than inventing a new one — the same data, persisted server-side instead
// of (eventually, alongside) localStorage. Talks to PDO only via plain prepared
// statements — nothing here is MySQL- or SQLite-specific, so db.php is the only file
// that changes if the underlying database is ever swapped again.

// Used to exclude `text` on purpose — docs/'s old plan-switcher dropdown only ever needed
// id/name/updatedAt to render its list. F-044's plan-picker panel shows a live preview of
// every plan (Cloud included), which does need the source — brought back here rather than
// a second endpoint, matching get_plan()'s own column list. Accepted tradeoff, asked and
// confirmed directly: a larger list response for a user with many/large cloud plans, not
// addressed with pagination or lazy-loaded previews in this pass.
function list_plans(PDO $db, string $userId): array {
    $stmt = $db->prepare('SELECT id, name, text, updated_at AS updatedAt FROM plans WHERE user_id = ? ORDER BY updated_at DESC');
    $stmt->execute([$userId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function get_plan(PDO $db, string $userId, string $id): ?array {
    $stmt = $db->prepare('SELECT id, name, text, updated_at AS updatedAt FROM plans WHERE user_id = ? AND id = ?');
    $stmt->execute([$userId, $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function create_plan(PDO $db, string $userId, string $name, string $text): array {
    $id = bin2hex(random_bytes(16));
    $updatedAt = (int) round(microtime(true) * 1000);
    $db->prepare('INSERT INTO plans (id, user_id, name, text, updated_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([$id, $userId, $name, $text, $updatedAt]);
    return ['id' => $id, 'name' => $name, 'text' => $text, 'updatedAt' => $updatedAt];
}

// Returns the updated plan, or null if it doesn't exist / isn't owned by this user —
// callers turn that into a plain 404 rather than distinguishing "no such plan" from "not
// yours," the same way any resource-scoped API avoids confirming an id exists at all to
// someone who doesn't own it.
function update_plan(PDO $db, string $userId, string $id, ?string $name, ?string $text): ?array {
    $existing = get_plan($db, $userId, $id);
    if (!$existing) return null;
    $newName = $name ?? $existing['name'];
    $newText = $text ?? $existing['text'];
    $updatedAt = (int) round(microtime(true) * 1000);
    $db->prepare('UPDATE plans SET name = ?, text = ?, updated_at = ? WHERE user_id = ? AND id = ?')
        ->execute([$newName, $newText, $updatedAt, $userId, $id]);
    return ['id' => $id, 'name' => $newName, 'text' => $newText, 'updatedAt' => $updatedAt];
}

function delete_plan(PDO $db, string $userId, string $id): bool {
    $stmt = $db->prepare('DELETE FROM plans WHERE user_id = ? AND id = ?');
    $stmt->execute([$userId, $id]);
    return $stmt->rowCount() > 0;
}
