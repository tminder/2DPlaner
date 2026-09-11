"""F-031: grid-snapped dragging and resizing -- coupled to settings.grid's own presence
(no second flag), hard snap always on while a grid is declared, covering both ordinary
drag (position) and the D-116 resize handles."""

import re

from helpers import drag, element_center, load_plan, source_text

PLAN = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [0.7m, 0.55m]
    style: { fill: "#8ab" }
  }
  element lamp {
    shape: "circle"
    radius: 0.32m
    position: [3m, 2m]
    style: { fill: "#fc6" }
  }
  element rug {
    shape: "polygon"
    points: [[0.3m, 2m], [1.5m, 1.9m], [1.6m, 2.8m], [0.4m, 2.9m]]
    style: { fill: "#e8b4bc", stroke: "#a06070", strokeWidth: 0.02m }
  }
}
"""

GRID_PLAN = """
settings { grid: { size: 0.5 } }
""" + PLAN

TIGHT_CONTAINMENT_PLAN = """
settings { grid: { size: 0.5 } }
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [2.9m, 0.55m]
    placement: "inside"
    style: { fill: "#8ab" }
  }
}
"""

STEP = 0.5
EPS = 0.003  # formatNumber rounds to 3 decimals


def select(page, node_id):
    cx, cy = element_center(page, node_id)
    page.mouse.click(cx, cy)
    page.wait_for_timeout(150)


def handle_center(page, node_id, corner):
    box = page.locator(f'.resize-handle[data-node-id="{node_id}"][data-corner="{corner}"]').bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def sofa_position(text):
    m = re.search(r"element sofa.*?position: \[([\d.]+)m, ([\d.]+)m\]", text, re.S)
    return float(m.group(1)), float(m.group(2))


def sofa_size(text):
    m = re.search(r"element sofa.*?size: \[([\d.]+)m, ([\d.]+)m\]", text, re.S)
    return float(m.group(1)), float(m.group(2))


def lamp_radius(text):
    m = re.search(r"element lamp.*?radius: ([\d.]+)m", text, re.S)
    return float(m.group(1))


def rug_points(text):
    m = re.search(r"element rug \{.*?points: \[(.*?)\]\n", text, re.S)
    return [(float(x), float(y)) for x, y in re.findall(r"\[(-?[\d.]+)m,\s*(-?[\d.]+)m\]", m.group(1))]


def vertex_handle_center(page, node_id, point_index):
    box = page.locator(
        f'.resize-handle[data-node-id="{node_id}"][data-corner="vertex"][data-point-index="{point_index}"]'
    ).bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def is_multiple_of(value, step, eps=EPS):
    remainder = value % step
    return remainder < eps or (step - remainder) < eps


def test_ordinary_drag_snaps_to_grid_when_declared(app_page):
    load_plan(app_page, GRID_PLAN)
    x, y = element_center(app_page, "sofa")
    drag(app_page, x, y, x + 47, y + 23)  # a deliberately "ugly" pixel delta

    px, py = sofa_position(source_text(app_page))
    assert is_multiple_of(px, STEP), f"x={px} not a multiple of {STEP}"
    assert is_multiple_of(py, STEP), f"y={py} not a multiple of {STEP}"


def test_ordinary_drag_is_free_without_a_grid_declared(app_page):
    load_plan(app_page, PLAN)  # no settings.grid at all
    x, y = element_center(app_page, "sofa")
    drag(app_page, x, y, x + 47, y + 23)

    px, py = sofa_position(source_text(app_page))
    # The same "ugly" pixel delta as the snapped test above should NOT land on a clean
    # multiple of 0.5 -- confirms the coupling (no grid declared -> no snapping at all),
    # not just that some snapping happened to produce a round number by chance.
    assert not (is_multiple_of(px, STEP) and is_multiple_of(py, STEP))


def test_drag_snapping_still_respects_containment_clamp(app_page):
    load_plan(app_page, TIGHT_CONTAINMENT_PLAN)
    x, y = element_center(app_page, "sofa")
    # sofa is already resting near room's right edge (room is 4m wide, sofa 1m wide at
    # x=2.9m) -- drag further right, past where containment must clamp it.
    drag(app_page, x, y, x + 200, y)

    px, _ = sofa_position(source_text(app_page))
    # Containment still wins: the sofa's right edge (position.x + 1m width) can never
    # exceed room's own 4m width, snapped delta or not.
    assert px + 1.0 <= 4.0 + EPS


def test_resize_corner_handle_snaps_to_a_grid_intersection(app_page):
    load_plan(app_page, GRID_PLAN)
    select(app_page, "sofa")
    hx, hy = handle_center(app_page, "sofa", "br")
    drag(app_page, hx, hy, hx + 53, hy + 31)  # another "ugly" delta

    text = source_text(app_page)
    px, py = sofa_position(text)
    w, h = sofa_size(text)
    # The dragged (bottom-right) corner is position + size -- that landed point must be
    # on a grid intersection, even though position itself (the fixed top-left anchor for
    # this corner) is untouched and need not be.
    assert is_multiple_of(px + w, STEP)
    assert is_multiple_of(py + h, STEP)


def test_resize_radius_handle_snaps_to_a_grid_multiple(app_page):
    load_plan(app_page, GRID_PLAN)
    select(app_page, "lamp")
    hx, hy = handle_center(app_page, "lamp", "radius")
    drag(app_page, hx, hy, hx + 60, hy + 17)

    r = lamp_radius(source_text(app_page))
    assert is_multiple_of(r, STEP)


def test_keyboard_nudge_and_resize_are_unaffected_by_grid(app_page):
    # D-109's own keyboardStep is deliberately independent of grid.size -- confirms that
    # decision still holds even with a grid declared, not just documented intent.
    load_plan(app_page, GRID_PLAN)
    select(app_page, "sofa")
    before = source_text(app_page)
    app_page.keyboard.press("ArrowRight")
    app_page.wait_for_timeout(150)

    px, py = sofa_position(source_text(app_page))
    before_px, before_py = sofa_position(before)
    assert abs(px - (before_px + 0.1)) < 1e-6  # default keyboardStep, not grid.size (0.5)
    assert abs(py - before_py) < 1e-6


def test_polygon_vertex_handle_snaps_to_a_grid_intersection(app_page):
    # D-139: a polygon/polyline vertex handle snaps the dragged point itself to a grid
    # intersection, the same convention the rect corner handle already uses above (not a
    # derived value like the radius handle's own multiple-of-size snap).
    load_plan(app_page, GRID_PLAN)
    select(app_page, "rug")
    before = rug_points(source_text(app_page))
    hx, hy = vertex_handle_center(app_page, "rug", 0)
    drag(app_page, hx, hy, hx + 53, hy + 31)  # another "ugly" delta

    after = rug_points(source_text(app_page))
    assert after[1:] == before[1:]  # every other vertex untouched
    px, py = after[0]
    assert is_multiple_of(px, STEP), f"x={px} not a multiple of {STEP}"
    assert is_multiple_of(py, STEP), f"y={py} not a multiple of {STEP}"
