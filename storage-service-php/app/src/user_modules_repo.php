<?php
// F-056: a signed-in user's own modules — plain CRUD for {userId, name, code, visibility},
// deliberately mirroring plans_repo.php's exact shape (same id/timestamp generation, same
// user-scoped prepared statements) rather than inventing a new pattern for data that's
// structurally the same kind of thing.

function list_modules(PDO $db, string $userId): array {
    $stmt = $db->prepare('SELECT id, name, visibility, updated_at AS updatedAt FROM user_modules WHERE user_id = ? ORDER BY updated_at DESC');
    $stmt->execute([$userId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

// Full row, code included — the one call the dashboard's own "Edit" needs, unlike the
// list above (matches plans_repo.php's own get_plan/list_plans split).
function get_module(PDO $db, string $userId, string $id): ?array {
    $stmt = $db->prepare('SELECT id, name, code, visibility, updated_at AS updatedAt FROM user_modules WHERE user_id = ? AND id = ?');
    $stmt->execute([$userId, $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function create_module(PDO $db, string $userId, string $name, string $code, string $visibility): array {
    $id = bin2hex(random_bytes(16));
    $updatedAt = (int) round(microtime(true) * 1000);
    $db->prepare('INSERT INTO user_modules (id, user_id, name, code, visibility, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$id, $userId, $name, $code, $visibility, $updatedAt]);
    return ['id' => $id, 'name' => $name, 'code' => $code, 'visibility' => $visibility, 'updatedAt' => $updatedAt];
}

// Returns the updated module, or null if it doesn't exist / isn't owned by this user —
// same "never confirm an id exists to someone who doesn't own it" reasoning as
// plans_repo.php's own update_plan.
function update_module(PDO $db, string $userId, string $id, ?string $name, ?string $code, ?string $visibility): ?array {
    $existing = get_module($db, $userId, $id);
    if (!$existing) return null;
    $newName = $name ?? $existing['name'];
    $newCode = $code ?? $existing['code'];
    $newVisibility = $visibility ?? $existing['visibility'];
    $updatedAt = (int) round(microtime(true) * 1000);
    $db->prepare('UPDATE user_modules SET name = ?, code = ?, visibility = ?, updated_at = ? WHERE user_id = ? AND id = ?')
        ->execute([$newName, $newCode, $newVisibility, $updatedAt, $userId, $id]);
    return ['id' => $id, 'name' => $newName, 'code' => $newCode, 'visibility' => $newVisibility, 'updatedAt' => $updatedAt];
}

function delete_module(PDO $db, string $userId, string $id): bool {
    $stmt = $db->prepare('DELETE FROM user_modules WHERE user_id = ? AND id = ?');
    $stmt->execute([$userId, $id]);
    return $stmt->rowCount() > 0;
}

// Deliberately NOT scoped by user id — this is the one function module-code.php (the
// public, unauthenticated raw-serving endpoint) is allowed to call, by design reachable by
// anyone who has a module's own `id`. "Private" vs. "public" (the `visibility` column) is
// a dashboard-only label today, not checked here — see module-code.php's own comment.
function get_module_code_by_id(PDO $db, string $id): ?string {
    $stmt = $db->prepare('SELECT code FROM user_modules WHERE id = ?');
    $stmt->execute([$id]);
    $code = $stmt->fetchColumn();
    return $code === false ? null : $code;
}
