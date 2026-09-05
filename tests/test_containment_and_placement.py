"""F-020/D-032/D-092: containment clamping, flush, ancestor childPlacement inheritance,
and the right-click menu actions that set placement/flush directly."""

from helpers import (
    click_menu_item,
    drag,
    element_center,
    load_plan,
    menu_item_state,
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
    # All three placement items are always shown now (checked/disabled convey state
    # rather than the item appearing/disappearing) -- confirm the unchecked starting state.
    assert menu_item_state(app_page, "Inside room") == {"checked": False, "disabled": False}
    click_menu_item(app_page, "Inside room")
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
    click_menu_item(app_page, "Inside room")

    open_context_menu(app_page, cx, cy)
    # Now checked (just placed inside), and Inside itself becomes disabled (already set)
    # -- clicking an already-checked radio-style option would be a no-op.
    assert menu_item_state(app_page, "Inside room") == {"checked": True, "disabled": True}
    assert menu_item_state(app_page, "Snapped to room's edge") == {"checked": False, "disabled": False}
    click_menu_item(app_page, "Snapped to room's edge")
    assert "flush: true" in source_text(app_page)

    open_context_menu(app_page, cx, cy)
    assert menu_item_state(app_page, "Snapped to room's edge") == {"checked": True, "disabled": False}
    # Free is enabled: sofa has its own placement+flush, and room has no childPlacement
    # of its own, so clearing them actually achieves real freedom.
    assert menu_item_state(app_page, "No placement (moves freely)") == {"checked": False, "disabled": False}
    click_menu_item(app_page, "No placement (moves freely)")
    text = source_text(app_page)
    assert "flush" not in text.split("element sofa")[1]
    assert "placement" not in text.split("element sofa")[1]


def test_free_disabled_when_ancestor_childplacement_still_applies(app_page):
    """Reported directly: an element with its own explicit placement, freed via the menu,
    stayed clamped to its parent anyway -- because the parent's own childPlacement still
    applies once the element's own property is gone. Free must not offer to do something
    it can't actually achieve."""
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [5m, 4m]
  position: [0m, 0m]
  style: { fill: "#eee" }
  childPlacement: "inside"

  element desk {
    placement: "inside"
    shape: "rect"
    size: [1.2m, 0.6m]
    position: [0.2m, 2.8m]
    style: { fill: "#fbe3b0" }
  }
}
""",
    )
    cx, cy = element_center(app_page, "desk")
    open_context_menu(app_page, cx, cy)
    # desk has its own placement to clear, but room's childPlacement would still apply
    # afterward -- Free can't achieve real freedom here, so it must be disabled.
    assert menu_item_state(app_page, "No placement (moves freely)") == {"checked": False, "disabled": True}

    before = source_text(app_page)
    click_menu_item(app_page, "No placement (moves freely)")
    assert source_text(app_page) == before  # disabled item's click is a no-op

    # Confirm the *reason* this matters: dragging desk far outside room still clamps it,
    # since it's still governed by room's own childPlacement regardless of desk's own
    # (still-present) placement property.
    drag(app_page, cx, cy, cx + 600, cy + 400)
    text = source_text(app_page)
    import re

    m = re.search(r'position:\s*\[([\d.-]+)m,\s*([\d.-]+)m\]', text.split("element desk")[1])
    x, y = float(m.group(1)), float(m.group(2))
    assert -0.001 <= x <= 5.0 - 1.2 + 0.001
    assert -0.001 <= y <= 4.0 - 0.6 + 0.001
