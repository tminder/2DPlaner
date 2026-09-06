"""F-016: visible, draggable resize handles for the selected rect/circle -- the corner/
radius-drag equivalent of D-109's Shift+arrow keyboard resize, reachable directly in the
viewer via mouse or touch."""

import re

from helpers import dispatch_pointer, drag, element_center, load_plan, source_text

PLAN = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [0.5m, 0.5m]
    style: { fill: "#8ab" }
  }
  element lamp {
    shape: "circle"
    radius: 0.3m
    position: [3m, 2m]
    style: { fill: "#fc6" }
  }
  element wall {
    shape: "polyline"
    points: [[0.2m, 2.9m], [1.5m, 2.9m]]
    style: { stroke: "#333", strokeWidth: 0.05m }
  }
}
"""

EXPR_PLAN = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]

  element sofa {
    shape: "rect"
    size: [parent.size.x - 1m, 0.6m]
    position: [0.5m, 0.5m]
  }
}
"""


def select(page, node_id):
    cx, cy = element_center(page, node_id)
    page.mouse.click(cx, cy)
    page.wait_for_timeout(150)


def resize_handle_count(page):
    return page.locator(".resize-handle").count()


def handle_center(page, node_id, corner):
    box = page.locator(f'.resize-handle[data-node-id="{node_id}"][data-corner="{corner}"]').bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def sofa_size(text):
    m = re.search(r"element sofa.*?size: \[([\d.]+)m, ([\d.]+)m\]", text, re.S)
    return float(m.group(1)), float(m.group(2))


def sofa_position(text):
    m = re.search(r"element sofa.*?position: \[([\d.]+)m, ([\d.]+)m\]", text, re.S)
    return float(m.group(1)), float(m.group(2))


def test_handles_appear_only_for_a_selected_rect_or_circle(app_page):
    load_plan(app_page, PLAN)
    assert resize_handle_count(app_page) == 0

    select(app_page, "sofa")
    assert resize_handle_count(app_page) == 4
    corners = set(app_page.evaluate(
        "Array.from(document.querySelectorAll('.resize-handle')).map(h => h.dataset.corner)"
    ))
    assert corners == {"tl", "tr", "bl", "br"}

    select(app_page, "lamp")
    assert resize_handle_count(app_page) == 1
    assert app_page.evaluate("document.querySelector('.resize-handle').dataset.corner") == "radius"

    select(app_page, "wall")  # polyline -- explicitly out of scope, no handles at all
    assert resize_handle_count(app_page) == 0


def test_a_styleless_rect_gets_no_handles_either(app_page):
    # core's own renderShape falls back to a bare anchor point for a rect/circle with no
    # declared style at all -- it's never actually drawn as a rect, so handles (which would
    # otherwise float around geometry nothing on screen corresponds to) must not appear for
    # it either. A real bug found live: fixed by gating renderResizeHandles on the exact
    # same hasStyle check core's own renderer uses.
    load_plan(app_page, 'element bare { shape: "rect" size: [1m, 1m] position: [0m, 0m] }')
    select(app_page, "bare")
    assert resize_handle_count(app_page) == 0
    before = source_text(app_page)
    x, y = element_center(app_page, "bare")
    drag(app_page, x, y, x + 30, y + 15)
    assert "size: [1m, 1m]" in source_text(app_page)  # only position may have moved, never size
    assert source_text(app_page) != before


def test_dragging_the_br_handle_grows_size_with_position_unchanged(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "sofa")
    hx, hy = handle_center(app_page, "sofa", "br")
    drag(app_page, hx, hy, hx + 60, hy + 30)

    text = source_text(app_page)
    assert sofa_position(text) == (0.5, 0.5)
    w, h = sofa_size(text)
    assert w > 1.0 and h > 0.6


def test_dragging_the_tl_handle_moves_position_and_size_together(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "sofa")
    hx, hy = handle_center(app_page, "sofa", "tl")
    # Drags the top-left corner toward the fixed (opposite, bottom-right) anchor -- shrinks
    # the rect while its position moves to follow the dragged corner, unlike D-109's own
    # keyboard resize (position always fixed) or the "br" handle above.
    drag(app_page, hx, hy, hx + 20, hy + 10)

    text = source_text(app_page)
    px, py = sofa_position(text)
    w, h = sofa_size(text)
    assert px > 0.5 and py > 0.5
    assert w < 1.0 and h < 0.6


def test_dragging_the_circle_handle_changes_only_radius(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "lamp")
    hx, hy = handle_center(app_page, "lamp", "radius")
    drag(app_page, hx, hy, hx + 40, hy)

    text = source_text(app_page)
    assert "position: [3m, 2m]" in text
    m = re.search(r"element lamp.*?radius: ([\d.]+)m", text, re.S)
    assert float(m.group(1)) > 0.3


def test_expression_valued_size_shows_no_handles_at_all(app_page):
    # An expression resolves to a function, not a number, in the expanded-but-unrendered
    # tree handles are computed from -- rather than draw 3 of 4 corners at NaN coordinates,
    # renderResizeHandles skips the shape entirely when its geometry isn't finite. (The
    # separate isEditable bail in handlePointerDown is defense in depth for grabbing a
    # handle, not reachable here since none are ever shown to grab in the first place.)
    load_plan(app_page, EXPR_PLAN)
    select(app_page, "sofa")
    assert resize_handle_count(app_page) == 0


def test_a_second_finger_cancels_a_pending_resize(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "sofa")
    before = source_text(app_page)
    hx, hy = handle_center(app_page, "sofa", "br")
    rx, ry = element_center(app_page, "room")

    dispatch_pointer(app_page, "pointerdown", 1, hx, hy)
    dispatch_pointer(app_page, "pointermove", 1, hx + 20, hy + 10)
    dispatch_pointer(app_page, "pointerdown", 2, rx, ry)
    app_page.wait_for_timeout(100)

    assert source_text(app_page) == before, "the cancelled resize must leave no trace in the source"

    dispatch_pointer(app_page, "pointerup", 1, hx + 20, hy + 10)
    dispatch_pointer(app_page, "pointerup", 2, rx, ry)


def test_ordinary_body_drag_of_the_shape_still_works(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "sofa")
    before = source_text(app_page)
    x, y = element_center(app_page, "sofa")
    drag(app_page, x, y, x + 40, y + 10)

    text = source_text(app_page)
    assert text != before
    assert "size: [1m, 0.6m]" in text  # a body drag never touches size
