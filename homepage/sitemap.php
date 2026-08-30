<?php
// Dynamically generated at request time, not a hand-maintained static XML file that
// would silently drift out of date — lastmod for each entry comes from the actual
// page file's own mtime, so it stays accurate without anyone remembering to update it
// alongside a content edit.
//
// Lists Homepage, Documentation, and the App — reversed from the original scope (which
// excluded the App via robots.txt, reasoning nobody searches their way into a signed-in
// tool) at the user's direct request. Profile stays excluded: it's a signed-in account
// view with no content of its own to rank, unlike the App, still kept out via its own
// page-level noindex meta tag; auth./api./test. are separate hosts already excluded from
// indexing entirely (D-052).
header('Content-Type: application/xml; charset=utf-8');

$baseUrl = 'https://www.planagonia.com';
$pages = [
    ['path' => '/', 'file' => __DIR__ . '/index.html', 'priority' => '1.0'],
    ['path' => '/docs/', 'file' => __DIR__ . '/docs/index.html', 'priority' => '0.8'],
    ['path' => '/app/', 'file' => __DIR__ . '/app/index.html', 'priority' => '0.6'],
];

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($pages as $page) {
    $lastmod = is_file($page['file']) ? date('Y-m-d', filemtime($page['file'])) : date('Y-m-d');
    echo "  <url>\n";
    echo '    <loc>' . htmlspecialchars($baseUrl . $page['path'], ENT_XML1) . "</loc>\n";
    echo "    <lastmod>{$lastmod}</lastmod>\n";
    echo "    <priority>{$page['priority']}</priority>\n";
    echo "  </url>\n";
}
echo '</urlset>' . "\n";
