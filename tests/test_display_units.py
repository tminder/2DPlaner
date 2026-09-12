"""F-013: a metric/imperial *display* toggle -- the plan language itself stays metric-only
forever (D-005); this only changes how measurements are shown to a human (the scale bar,
and any element's dimension/edge-length labels), never what gets written into the plan's
own source text. See core.formatMeasurement's own comment (docs/index.html) for the full
split between it and formatNumber (used for every source-text round-trip, untouched here)."""

import re

from helpers import drag, element_center, load_plan, source_text

PLAN = """
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

# Chosen so the rect's own width (0.60868m) hits the inch-rounding carry edge exactly:
# 0.60868m -> 23.96in -> rounds to 12.0in remainder, which must roll into the next foot
# (2'0") rather than ever printing literally as "1' 12.0"".
CARRY_EDGE_PLAN = """
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


def test_toggling_units_never_touches_source_and_drag_still_writes_metric(app_page):
    load_plan(app_page, PLAN)
    before = source_text(app_page)

    toggle_units(app_page)
    assert source_text(app_page) == before  # a pure display change, no edit, no undo step

    x, y = element_center(app_page, "lamp")
    drag(app_page, x, y, x + 40, y + 25)
    app_page.wait_for_timeout(150)
    after = source_text(app_page)
    assert after != before  # the drag itself did change the source...
    m = re.search(r"element lamp.*?position: \[(-?[\d.]+)(m|cm), (-?[\d.]+)(m|cm)\]", after, re.S)
    assert m, after  # ...but still as a plain metric literal, never feet/inches
