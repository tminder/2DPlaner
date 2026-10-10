"""F-013: a metric/imperial *display* toggle -- the plan language itself stays metric-only
forever (D-005); this only changes how measurements are shown to a human (the scale bar,
and any element's dimension/edge-length labels), never the value of anything written into
the plan's own source text. See core.formatMeasurement's own comment (docs/index.html) for
the full split between it and formatNumber (used for every source-text round-trip,
unaffected by this). `settings.displayUnit` itself *is* real plan content (requested
directly, moved out of a session-local `localStorage` preference) -- toggling does edit the
source, same as Grid/Connections/Dimensions already do, just never the *value* of any
geometry literal."""

import re

from helpers import drag, element_center, load_plan, source_text

PLAN = """
module "annotations-module.js"

element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }
  dimensions: true

  element lamp {
    shape: "circle"
    radius: 0.32m
    position: [3m, 2m]
    style: { fill: "#fc6" }
    dimensions: true
  }
}
"""

GRID_SNAP_PLAN = """
module "grid-module.js"

settings {
  grid: { size: 1 }
  snap: { size: 0.5 }
}

element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
}
"""

# Chosen so the rect's own width (0.60868m) hits the inch-rounding carry edge exactly:
# 0.60868m -> 23.96in -> rounds to 12.0in remainder, which must roll into the next foot
# (2'0") rather than ever printing literally as "1' 12.0"".
CARRY_EDGE_PLAN = """
module "annotations-module.js"

element box {
  shape: "rect"
  size: [0.60868m, 1m]
  position: [0m, 0m]
  style: { fill: "#8ab" }
  dimensions: true
}
"""


def toggle_units(page):
    page.click("#menu-tab-view")
    page.click("#units-toggle-btn")
    page.wait_for_timeout(150)


def annotation_texts(page):
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('#plan-root svg .annotation text')).map(t => t.textContent)"""
    )


def test_units_toggle_button_flips_label_and_active_state(app_page):
    load_plan(app_page, PLAN)
    app_page.click("#menu-tab-view")
    btn = app_page.locator("#units-toggle-btn")
    assert btn.locator(".ribbon-label").inner_text() == "Units: m"
    assert not btn.evaluate("el => el.classList.contains('active')")

    app_page.click("#units-toggle-btn")
    app_page.wait_for_timeout(150)
    assert btn.locator(".ribbon-label").inner_text() == "Units: ft"
    assert btn.evaluate("el => el.classList.contains('active')")

    app_page.click("#units-toggle-btn")
    app_page.wait_for_timeout(150)
    assert btn.locator(".ribbon-label").inner_text() == "Units: m"
    assert not btn.evaluate("el => el.classList.contains('active')")


def test_dimension_labels_switch_to_feet_inches_when_toggled(app_page):
    load_plan(app_page, PLAN)
    metric_texts = annotation_texts(app_page)
    assert "4m × 3m" in metric_texts
    assert "⌀ 64cm" in metric_texts

    toggle_units(app_page)
    imperial_texts = annotation_texts(app_page)
    assert any(re.match(r"^\d+' [\d.]+\" × \d+' [\d.]+\"$", t) for t in imperial_texts), imperial_texts
    assert any(t.startswith("⌀ ") and "'" in t for t in imperial_texts), imperial_texts


def test_inch_rounding_carries_into_the_next_whole_foot(app_page):
    load_plan(app_page, CARRY_EDGE_PLAN)
    toggle_units(app_page)
    texts = annotation_texts(app_page)
    width_label = texts[0].split(" × ")[0]
    assert width_label == "2' 0\"", texts


def test_scale_bar_label_changes_between_metric_and_imperial(app_page):
    load_plan(app_page, PLAN)
    metric_label = app_page.locator("#interactivity-scale-bar .label").inner_text()
    assert metric_label.endswith("m") or metric_label.endswith("cm")

    toggle_units(app_page)
    imperial_label = app_page.locator("#interactivity-scale-bar .label").inner_text()
    assert imperial_label.endswith("ft") or imperial_label.endswith("in")


def test_toggling_units_only_writes_the_setting_drag_still_writes_metric(app_page):
    load_plan(app_page, PLAN)
    before = source_text(app_page)

    toggle_units(app_page)
    after_toggle = source_text(app_page)
    assert after_toggle != before  # settings.displayUnit is real plan content now
    assert 'displayUnit: "imperial"' in after_toggle
    # every geometry literal is untouched -- only the settings block gained a line
    assert "size: [4m, 3m]" in after_toggle
    assert "radius: 0.32m" in after_toggle

    x, y = element_center(app_page, "lamp")
    drag(app_page, x, y, x + 40, y + 25)
    app_page.wait_for_timeout(150)
    after_drag = source_text(app_page)
    assert after_drag != after_toggle  # the drag itself did change the source...
    m = re.search(r"element lamp.*?position: \[(-?[\d.]+)(m|cm), (-?[\d.]+)(m|cm)\]", after_drag, re.S)
    assert m, after_drag  # ...but still as a plain metric literal, never feet/inches


def test_toggling_units_is_undoable(app_page):
    """Real plan content now (Core Aim 1) -- unlike the old session-local toggle, this
    participates in undo/redo like any other settings edit."""
    load_plan(app_page, PLAN)
    before = source_text(app_page)
    toggle_units(app_page)
    assert 'displayUnit: "imperial"' in source_text(app_page)
    app_page.keyboard.press("Control+z")
    app_page.wait_for_timeout(150)
    assert source_text(app_page) == before


# ---- F-067: Grid/Snap's own "Size" field follows the same toggle ----

def test_grid_and_snap_size_fields_follow_the_units_toggle_too(app_page):
    load_plan(app_page, GRID_SNAP_PLAN)
    app_page.click("#menu-tab-view")
    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(100)
    assert app_page.locator("#grid-size-label").inner_text() == "Size (m)"
    assert app_page.locator("#grid-size-input").input_value() == "1"
    app_page.hover("#snap-toggle-btn")
    app_page.wait_for_timeout(100)
    assert app_page.locator("#snap-size-label").inner_text() == "Size (m)"
    assert app_page.locator("#snap-size-input").input_value() == "0.5"

    toggle_units(app_page)

    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(100)
    assert app_page.locator("#grid-size-label").inner_text() == "Size (ft)"
    assert app_page.locator("#grid-size-input").input_value() == "3.28"  # 1m
    app_page.hover("#snap-toggle-btn")
    app_page.wait_for_timeout(100)
    assert app_page.locator("#snap-size-label").inner_text() == "Size (ft)"
    assert app_page.locator("#snap-size-input").input_value() == "1.64"  # 0.5m

    # toggling back reverts both, not just one
    toggle_units(app_page)
    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(100)
    assert app_page.locator("#grid-size-label").inner_text() == "Size (m)"
    assert app_page.locator("#grid-size-input").input_value() == "1"


def test_typing_a_feet_value_into_grid_size_still_stores_meters(app_page):
    """D-005's own invariant: settings.grid.size stays a plain metric literal regardless of
    what unit the field is currently showing/accepting input in."""
    load_plan(app_page, GRID_SNAP_PLAN)
    toggle_units(app_page)
    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(100)
    app_page.fill("#grid-size-input", "6.56")  # ~2m
    app_page.locator("#grid-size-input").press("Enter")
    app_page.wait_for_timeout(150)

    text = source_text(app_page)
    m = re.search(r"grid: \{ size: ([\d.]+)m? \}", text)
    assert m, text
    assert abs(float(m.group(1)) - 2) < 0.01, text
