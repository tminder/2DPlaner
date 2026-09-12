"""D-150 (F-012): drag-driven reparenting -- Shift held through release moves an element
out of its current parent's `{ }` block into whichever different element it's dropped
onto, becoming that element's own child, with its position rewritten to keep it exactly
where it visually ends up. Generalizes D-148's clearPlacement mechanic (which always
promotes exactly one level up, to the grandparent) to an arbitrary drop target, gated on a
held modifier specifically so an ordinary drag that merely ends up near another shape
never reparents by accident."""

import re

from helpers import alt_click, drag, element_center, empty_canvas_point, load_plan, shift_drag, source_text

TWO_ROOMS = """
element house {
  shape: "rect"
  size: [8m, 5m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element roomA {
    shape: "rect"
    size: [2m, 2m]
    position: [0.2m, 0.2m]
    style: { fill: "#dde" }

    element lamp {
      shape: "circle"
      radius: 0.2m
      position: [1m, 1m]
      placement: "inside"
      style: { fill: "#fc6" }
    }
    element rug {
      shape: "rect"
      size: [0.5m, 0.5m]
      position: [0.3m, 0.3m]
      style: { fill: "#e8b" }
    }
  }
  element roomB {
    shape: "rect"
    size: [2m, 2m]
    position: [5m, 0.2m]
    style: { fill: "#ded" }
  }
}
"""

DEEP_TARGET = """
element house {
  shape: "rect"
  size: [8m, 5m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element deco {
    shape: "circle"
    radius: 0.2m
    position: [0.5m, 0.5m]
    style: { fill: "#fc6" }
  }
  element roomB {
    shape: "rect"
    size: [3m, 3m]
    position: [4m, 0.5m]
    style: { fill: "#ded" }

    element nook {
      shape: "rect"
      size: [1m, 1m]
      position: [1m, 1m]
      style: { fill: "#cce" }
    }
  }
}
"""


def indent_of(text, element_id):
    return re.search(rf"^( *)element {element_id}\b", text, re.M).group(1)


def test_shift_drag_reparents_into_the_hovered_element(app_page):
    load_plan(app_page, TWO_ROOMS)
    lx, ly = element_center(app_page, "lamp")
    bx, by = element_center(app_page, "roomB")
    shift_drag(app_page, lx, ly, bx, by)

    text = source_text(app_page)
    lamp_block = text.split("element lamp")[1]
    assert "placement" not in lamp_block  # D-148's own precedent: stripped on reparent
    assert len(indent_of(text, "lamp")) == len(indent_of(text, "roomB")) + 2
    assert "element lamp" not in text.split("element roomA")[1].split("element roomB")[0]

    # Visual continuity: lamp's new on-screen center lands where it was actually dropped,
    # not wherever its now-meaningless old-parent-relative position would have put it.
    box = app_page.locator('[data-id="lamp"]').bounding_box()
    new_cx, new_cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    assert abs(new_cx - bx) < 5
    assert abs(new_cy - by) < 5


def test_plain_drag_without_shift_never_reparents(app_page):
    """Regression guard -- the one thing this feature must never become the default."""
    load_plan(app_page, TWO_ROOMS)
    lx, ly = element_center(app_page, "lamp")
    bx, by = element_center(app_page, "roomB")
    drag(app_page, lx, ly, bx, by)

    text = source_text(app_page)
    assert "element lamp" in text.split("element roomA")[1].split("element roomB")[0]


def test_shift_drag_back_onto_its_own_current_parent_does_not_reparent(app_page):
    load_plan(app_page, TWO_ROOMS)
    lx, ly = element_center(app_page, "lamp")
    ax, ay = element_center(app_page, "roomA")
    shift_drag(app_page, lx, ly, ax + 10, ay + 10)

    text = source_text(app_page)
    assert "element lamp" in text.split("element roomA")[1].split("element roomB")[0]


def test_shift_drag_onto_empty_canvas_does_not_reparent(app_page):
    load_plan(app_page, TWO_ROOMS)
    lx, ly = element_center(app_page, "lamp")
    ex, ey = empty_canvas_point(app_page, "house", 0.5, "right")
    shift_drag(app_page, lx, ly, ex, ey)

    text = source_text(app_page)
    assert "element lamp" in text.split("element roomA")[1].split("element roomB")[0]


def test_shift_drag_onto_own_descendant_is_rejected(app_page):
    """Cycle guard: dragging a parent onto its own child must never reparent it into its
    own subtree -- the ordinary move (position only) still happens, structure doesn't."""
    load_plan(app_page, TWO_ROOMS)
    ax, ay = element_center(app_page, "roomA")
    lx, ly = element_center(app_page, "lamp")
    shift_drag(app_page, ax, ay, lx, ly)

    text = source_text(app_page)
    assert "element lamp" in text.split("element roomA")[1].split("element roomB")[0]


def test_shift_drag_into_a_deeper_target_reindents_correctly(app_page):
    """Unlike D-148's own always-one-level-shallower dedent, a drag can drop this anywhere
    -- here two levels deeper than the original (top-level) location."""
    load_plan(app_page, DEEP_TARGET)
    dx, dy = element_center(app_page, "deco")
    nx, ny = element_center(app_page, "nook")
    shift_drag(app_page, dx, dy, nx, ny)

    text = source_text(app_page)
    assert len(indent_of(text, "deco")) == len(indent_of(text, "nook")) + 2
    assert "element deco" in text.split("element nook")[1]

    box = app_page.locator('[data-id="deco"]').bounding_box()
    new_cx, new_cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    assert abs(new_cx - nx) < 5
    assert abs(new_cy - ny) < 5


def test_reparent_candidate_highlight_appears_only_while_shift_is_held(app_page):
    load_plan(app_page, TWO_ROOMS)
    lx, ly = element_center(app_page, "lamp")
    bx, by = element_center(app_page, "roomB")

    # No Shift: hovering roomB mid-drag must not highlight it.
    app_page.mouse.move(lx, ly)
    app_page.mouse.down()
    app_page.mouse.move(bx, by, steps=8)
    app_page.wait_for_timeout(150)
    assert not app_page.evaluate("document.querySelector('[data-id=\"roomB\"]').classList.contains('reparent-candidate')")
    app_page.mouse.up()
    app_page.wait_for_timeout(150)

    # With Shift: hovering roomB mid-drag highlights it; releasing clears it again.
    app_page.keyboard.down("Shift")
    app_page.mouse.move(lx, ly)
    app_page.mouse.down()
    app_page.mouse.move(bx, by, steps=8)
    app_page.wait_for_timeout(150)
    assert app_page.evaluate("document.querySelector('[data-id=\"roomB\"]').classList.contains('reparent-candidate')")
    app_page.mouse.up()
    app_page.keyboard.up("Shift")
    app_page.wait_for_timeout(150)
    assert not app_page.evaluate("document.querySelector('[data-id=\"roomB\"]')?.classList.contains('reparent-candidate')")


def test_group_drag_with_shift_moves_normally_without_reparenting(app_page):
    """v1 scope limit: a multi-selection drag never reparents any member, even with Shift
    held -- only a single-element drag does."""
    load_plan(app_page, TWO_ROOMS)
    lx, ly = element_center(app_page, "lamp")
    rx, ry = element_center(app_page, "rug")
    bx, by = element_center(app_page, "roomB")

    alt_click(app_page, lx, ly)
    alt_click(app_page, rx, ry)
    shift_drag(app_page, lx, ly, bx, by)

    text = source_text(app_page)
    room_a_block = text.split("element roomA")[1].split("element roomB")[0]
    assert "element lamp" in room_a_block
    assert "element rug" in room_a_block
