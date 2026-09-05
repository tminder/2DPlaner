"""A basic drag changes the element's position in the source; a plain click-to-select
(no movement) doesn't; undo/redo revert and reapply correctly (D-073)."""

from helpers import drag, element_center, load_plan, source_text

PLAN = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee", stroke: "#333", strokeWidth: 0.03 }

  element table {
    shape: "rect"
    size: [0.8m, 0.5m]
    position: [0.3m, 0.3m]
    style: { fill: "brown" }
  }
}
"""


def test_drag_changes_position(app_page):
    load_plan(app_page, PLAN)
    before = source_text(app_page)
    cx, cy = element_center(app_page, "table")
    drag(app_page, cx, cy, cx + 40, cy + 25)
    after = source_text(app_page)
    assert after != before


def test_plain_click_does_not_change_source(app_page):
    load_plan(app_page, PLAN)
    before = source_text(app_page)
    cx, cy = element_center(app_page, "table")
    app_page.mouse.click(cx, cy)
    app_page.wait_for_timeout(150)
    after = source_text(app_page)
    assert after == before


def test_undo_redo_round_trip(app_page):
    load_plan(app_page, PLAN)
    before = source_text(app_page)
    cx, cy = element_center(app_page, "table")
    drag(app_page, cx, cy, cx + 40, cy + 25)
    dragged = source_text(app_page)
    assert dragged != before

    app_page.keyboard.press("Control+z")
    app_page.wait_for_timeout(200)
    assert source_text(app_page) == before

    app_page.keyboard.press("Control+Shift+z")
    app_page.wait_for_timeout(200)
    assert source_text(app_page) == dragged
