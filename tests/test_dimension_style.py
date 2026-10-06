"""Requested directly, with a reference image showing arrow-tipped dimension lines: edge-
length measurements (edgeLengths) can optionally be drawn as an arrow-tipped dimension line
instead of plain text, switched for the whole plan via a real, plan-wide
`settings.dimensionStyle: "arrows"` flag (the header's own Dimensions button) -- not a
viewer/localStorage preference like Units, since this changes what the plan itself declares.
Deliberately scoped to edgeLengths only: a rect/circle's own centered "W × H"/"⌀" dimensions
text (dimensionText, docs/annotations-module.js) has no two points to draw a line between, and
is confirmed untouched by this feature regardless of the toggle's state. The reference image's
other idea -- auto-detecting aligned walls along a whole shape's outer boundary and drawing a
summed, multi-segment dimension chain with a running total -- is recorded as F-053, not built
here."""

from helpers import load_plan, source_text

PLAN = """module "annotations-module.js"

settings {
  edgeLengths: true
}

element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }
  dimensions: true
  show: "always"
}
"""


def toggle_dimension_style(page):
    page.click("#menu-tab-view")
    page.click("#dimension-style-toggle-btn")
    page.wait_for_timeout(150)


def annotation_counts(page):
    return page.evaluate(
        """() => ({
        lines: document.querySelectorAll('#plan-root svg line').length,
        markers: document.querySelectorAll('#plan-root svg marker').length,
        texts: Array.from(document.querySelectorAll('#plan-root svg .annotation text')).map(t => t.textContent),
    })"""
    )


def test_default_style_is_plain_text_with_no_lines_or_markers(app_page):
    load_plan(app_page, PLAN)
    info = annotation_counts(app_page)
    assert info["lines"] == 0
    assert info["markers"] == 0
    assert "4m × 3m" in info["texts"]
    # 4 edge-length texts (two 4m sides, two 3m sides) plus the center "4m × 3m" summary.
    assert sorted(t for t in info["texts"] if t != "4m × 3m") == ["3m", "3m", "4m", "4m"]


def test_toggle_button_writes_and_reflects_settings_dimensionstyle(app_page):
    load_plan(app_page, PLAN)
    app_page.click("#menu-tab-view")
    btn = app_page.locator("#dimension-style-toggle-btn")
    assert btn.locator(".ribbon-label").inner_text() == "Dimensions: Text"
    assert not btn.evaluate("el => el.classList.contains('active')")
    assert 'dimensionStyle' not in source_text(app_page)

    app_page.click("#dimension-style-toggle-btn")
    app_page.wait_for_timeout(150)
    assert btn.locator(".ribbon-label").inner_text() == "Dimensions: Arrows"
    assert btn.evaluate("el => el.classList.contains('active')")
    assert 'dimensionStyle: "arrows"' in source_text(app_page)

    app_page.click("#dimension-style-toggle-btn")
    app_page.wait_for_timeout(150)
    assert btn.locator(".ribbon-label").inner_text() == "Dimensions: Text"
    assert not btn.evaluate("el => el.classList.contains('active')")
    assert "dimensionStyle" not in source_text(app_page)


def test_arrow_style_draws_a_marked_line_per_edge_and_keeps_the_text(app_page):
    load_plan(app_page, PLAN)
    toggle_dimension_style(app_page)
    info = annotation_counts(app_page)
    # 4 edges, each: 2 witness ticks + 1 arrow-marked dimension line = 12 lines.
    assert info["lines"] == 12
    assert info["markers"] == 1
    assert sorted(t for t in info["texts"] if t != "4m × 3m") == ["3m", "3m", "4m", "4m"]

    marked = app_page.evaluate(
        """() => Array.from(document.querySelectorAll('#plan-root svg line'))
            .filter(l => l.getAttribute('marker-start') && l.getAttribute('marker-end')).length"""
    )
    assert marked == 4  # exactly one real dimension line per edge, not the witness ticks too


def test_rect_dimensions_text_is_unaffected_by_the_toggle(app_page):
    load_plan(app_page, PLAN)
    before = annotation_counts(app_page)["texts"]
    assert "4m × 3m" in before

    toggle_dimension_style(app_page)
    after = annotation_counts(app_page)["texts"]
    assert "4m × 3m" in after


def test_toggling_touches_only_the_dimensionstyle_key(app_page):
    load_plan(app_page, PLAN)
    before = source_text(app_page)
    toggle_dimension_style(app_page)
    after = source_text(app_page)
    assert after.replace('  dimensionStyle: "arrows"\n', "") == before
