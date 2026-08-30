<?php
// Dynamically generated at request time, not a hand-maintained static XML file that
// would silently drift out of date — lastmod for each entry comes from the actual
// page file's own mtime, so it stays accurate without anyone remembering to update it
// alongside a content edit.
//
// Only lists the pages site-structure.md's own SEO section identified as wanting
// organic search traffic — Homepage and Documentation. The App and Profile are
// deliberately excluded (arrived at directly, never searched for) via robots.txt
// (App) and Profile's own page-level noindex meta tag; auth./api./test. are separate
// hosts already excluded from indexing entirely (D-052).
header('Content-Type: application/xml; charset=utf-8');

$baseUrl = 'https://www.planagonia.com';
$pages = [
    ['path' => '/', 'file' => __DIR__ . '/index.html', 'priority' => '1.0'],
    ['path' => '/docs/', 'file' => __DIR__ . '/docs/index.html', 'priority' => '0.8'],
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
