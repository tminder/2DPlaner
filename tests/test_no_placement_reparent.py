"""D-148: "No placement (moves freely)" now genuinely detaches the element from its
parent -- promoting it one level up (out of its own parent's `{ }` block, becoming a
sibling of it under the grandparent) with its position rewritten to keep it exactly where
it visually was -- not just clearing its placement/flush properties in place, which is all
this action used to do (still covered by test_containment_and_placement.py's own existing
"No placement" cases, all of which happen to sit directly under the plan's root and so
exercise the no-grandparent fallback below, unchanged by this feature)."""

import re

from helpers import click_menu_item, element_center, load_plan, open_context_menu, source_text

THREE_LEVELS = """
element house {
  shape: "rect"
  size: [6m, 5m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element room {
    shape: "rect"
    size: [3m, 2m]
    position: [1m, 1m]
    style: { fill: "#dde" }

    element lamp {
      shape: "circle"
      radius: 0.2m
      position: [1m, 0.5m]
      placement: "inside"
      style: { fill: "#fc6" }
    }
  }
}
"""

THREE_LEVELS_NO_POSITION = """
element house {
  shape: "rect"
  size: [6m, 5m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element room {
    shape: "rect"
    size: [3m, 2m]
    position: [1m, 1m]
    style: { fill: "#dde" }

    element corner {
      placement: "inside"
    }
  }
}
"""

PARENT_IS_ROOT = """
element house {
  shape: "rect"
  size: [6m, 5m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element lamp {
    shape: "circle"
    radius: 0.2m
    position: [1m, 1m]
    placement: "inside"
    style: { fill: "#fc6" }
  }
}
"""

EXPRESSION_POSITION = """
element house {
  shape: "rect"
  size: [6m, 5m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element room {
    shape: "rect"
    size: [3m, 2m]
    position: [1m, 1m]
    style: { fill: "#dde" }

    element lamp {
      shape: "circle"
      radius: 0.2m
      position: [parent.size.x - 1m, 0.5m]
      placement: "inside"
      style: { fill: "#fc6" }
    }
  }
}
"""


def test_promotes_element_to_sibling_of_its_former_parent(app_page):
    load_plan(app_page, THREE_LEVELS)
    lx, ly = element_center(app_page, "lamp")
    open_context_menu(app_page, lx, ly)
    click_menu_item(app_page, "No placement (moves freely)")

    text = source_text(app_page)
    lamp_block = text.split("element lamp")[1]
    assert 'placement: "inside"' not in lamp_block
    # lamp is now a *sibling* of room (both direct children of house) -- same indentation
    # level, no longer nested one level deeper inside room's own { } block.
    room_indent = re.search(r"^( *)element room\b", text, re.M).group(1)
    lamp_indent = re.search(r"^( *)element lamp\b", text, re.M).group(1)
    assert lamp_indent == room_indent
    # room's absolute position [1,1] + lamp's own former local [1, 0.5] -> lamp's true
    # absolute position was [2, 1.5]; house sits at [0,0], so lamp's new position (now
    # relative to house) must be exactly that same absolute value, keeping it visually
    # exactly where it was.
    assert "position: [2m, 1.5m]" in lamp_block


def test_inserts_a_fresh_position_when_none_existed(app_page):
    """corner has no explicit `position` at all (defaults to [0,0] relative to room) --
    promoting it must add one, not leave it silently un-positioned relative to its new
    parent."""
    load_plan(app_page, THREE_LEVELS_NO_POSITION)
    cx, cy = element_center(app_page, "corner")
    open_context_menu(app_page, cx, cy)
    click_menu_item(app_page, "No placement (moves freely)")

    text = source_text(app_page)
    corner_block = text.split("element corner")[1]
    assert 'placement' not in corner_block
    # room's own absolute position [1,1] + corner's implicit local [0,0] = [1,1] absolute.
    assert "position: [1m, 1m]" in corner_block


def test_falls_back_to_in_place_when_parent_is_the_root(app_page):
    """lamp's parent (house) IS the plan's root -- there's no grandparent to promote into,
    since this grammar only ever allows one top-level element. Falls back to the original
    clear-in-place behavior, unchanged."""
    load_plan(app_page, PARENT_IS_ROOT)
    lx, ly = element_center(app_page, "lamp")
    open_context_menu(app_page, lx, ly)
    click_menu_item(app_page, "No placement (moves freely)")

    text = source_text(app_page)
    lamp_block = text.split("element lamp")[1]
    assert "placement" not in lamp_block
    assert "position: [1m, 1m]" in lamp_block  # untouched, no reparent attempted
    # still nested one level inside house -- there's nowhere shallower to promote it to.
    house_indent = re.search(r"^( *)element house\b", text, re.M).group(1)
    lamp_indent = re.search(r"^( *)element lamp\b", text, re.M).group(1)
    assert len(lamp_indent) > len(house_indent)


def test_expression_position_degrades_to_clearing_placement_only(app_page):
    """An expression-valued position can't be safely rewritten to preserve where the
    element visually sits -- degrades to the old in-place-only behavior with a clear
    warning, rather than silently moving it somewhere wrong."""
    load_plan(app_page, EXPRESSION_POSITION)
    lx, ly = element_center(app_page, "lamp")
    open_context_menu(app_page, lx, ly)
    click_menu_item(app_page, "No placement (moves freely)")

    text = source_text(app_page)
    lamp_block = text.split("element lamp")[1]
    assert "placement" not in lamp_block
    # Still nested inside room -- the reparent was skipped, not attempted incorrectly.
    assert "element lamp" in text.split("element room")[1]
    assert "parent.size.x - 1m" in lamp_block
