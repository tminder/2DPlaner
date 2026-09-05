"""F-020/D-032/D-092: containment clamping, flush, ancestor childPlacement inheritance,
and the right-click menu actions that set placement/flush directly."""

from helpers import (
    click_menu_item,
    drag,
    element_center,
    load_plan,
    menu_items,
    open_context_menu,
    source_text,
)

INSIDE_PLAN = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee", stroke: "#333", strokeWidth: 0.03 }
  childPlacement: "inside"

  element sofa {
    shape: "rect"
    size: [1m, 0.5m]
    position: [1m, 0.7m]
    style: { fill: "brown" }
  }
}
"""

OUT_OF_BOUNDS_PLAN = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee", stroke: "#333", strokeWidth: 0.03 }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [2.7m, 1.8m]
    style: { fill: "#8ab" }
  }
}
"""

NESTED_CHILD_PLACEMENT_PLAN = """
element van {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }
  childPlacement: "inside"

  element kitchen {
    shape: "rect"
    size: [1.5m, 1m]
    position: [0.5m, 0.5m]
    style: { fill: "#ccc" }

    element stove {
      shape: "rect"
      size: [0.3m, 0.3m]
      position: [0.1m, 0.1m]
      style: { fill: "#e88" }
    }
  }
}
"""


def test_child_clamps_to_stay_inside_parent(app_page):
    load_plan(app_page, INSIDE_PLAN)
    cx, cy = element_center(app_page, "sofa")
    # Drag far to the right/down, well past the room's own 3x2 bounds.
    drag(app_page, cx, cy, cx + 400, cy + 300)
    text = source_text(app_page)
    # room is 3x2m; sofa is 1x0.5m -> valid position range is x:[0,2], y:[0,1.5]
    import re

    m = re.search(r'position:\s*\[([\d.]+)m,\s*([\d.]+)m\]', text.split("element sofa")[1])
    x, y = float(m.group(1)), float(m.group(2))
    assert 0 <= x <= 2.001
    assert 0 <= y <= 1.501


def test_ancestor_child_placement_applies_two_levels_down(app_page):
    load_plan(app_page, NESTED_CHILD_PLACEMENT_PLAN)
    cx, cy = element_center(app_page, "stove")
    # Drag stove far outside the van's own bounds -- childPlacement: "inside" on van
    # (a grandparent, not stove's immediate parent) must still clamp it (F-020).
    drag(app_page, cx, cy, cx + 700, cy + 500)
    text = source_text(app_page)
    import re

    m = re.search(r'position:\s*\[([\d.-]+)m,\s*([\d.-]+)m\]', text.split("element stove")[1])
    local_x, local_y = float(m.group(1)), float(m.group(2))
    # stove's absolute position (kitchen's origin + its own local offset) must stay
    # within van's 3x2m bounds regardless of the huge attempted drag.
    abs_x, abs_y = 0.5 + local_x, 0.5 + local_y
    assert -0.001 <= abs_x <= 3.0 - 0.3 + 0.001
    assert -0.001 <= abs_y <= 2.0 - 0.3 + 0.001


def test_place_inside_snaps_out_of_bounds_element(app_page):
    load_plan(app_page, OUT_OF_BOUNDS_PLAN)
    cx, cy = element_center(app_page, "sofa")
    open_context_menu(app_page, cx, cy)
    assert "Place Inside" in menu_items(app_page)
    click_menu_item(app_page, "Place Inside")
    text = source_text(app_page)
    assert 'placement: "inside"' in text
    import re

    m = re.search(r'position:\s*\[([\d.]+)m,\s*([\d.]+)m\]', text.split("element sofa")[1])
    x, y = float(m.group(1)), float(m.group(2))
    # room 3x2m, sofa 1x0.6m -> valid range x:[0,2], y:[0,1.4]
    assert 0 <= x <= 2.001
    assert 0 <= y <= 1.401


def test_make_flush_then_clear_placement(app_page):
    load_plan(app_page, OUT_OF_BOUNDS_PLAN)
    cx, cy = element_center(app_page, "sofa")
    open_context_menu(app_page, cx, cy)
    click_menu_item(app_page, "Place Inside")

    open_context_menu(app_page, cx, cy)
    assert "Make Flush" in menu_items(app_page)
    click_menu_item(app_page, "Make Flush")
    assert "flush: true" in source_text(app_page)

    open_context_menu(app_page, cx, cy)
    assert "Un-flush" in menu_items(app_page)
    assert "Clear Placement" in menu_items(app_page)
    click_menu_item(app_page, "Clear Placement")
    text = source_text(app_page)
    assert "flush" not in text.split("element sofa")[1]
    assert "placement" not in text.split("element sofa")[1]
