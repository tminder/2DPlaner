"""F-016: visible, draggable resize handles for the selected rect/circle -- the corner/
radius-drag equivalent of D-109's Shift+arrow keyboard resize, reachable directly in the
viewer via mouse or touch. D-139 extends the same idea to polygon/polyline: one handle per
vertex, dragging one reshapes the point instead of scaling the whole shape. D-143 closes
F-016's own other half: 4 bounding-box scale handles, proportional resize of every point
from a shared pivot -- offered only when every corner-ref point the shape uses is exclusive
to it, since a shared corner moving would silently distort whatever else references it."""

import re

from helpers import alt_click, dispatch_pointer, drag, drag_message, element_center, load_plan, source_text

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
  element rug {
    shape: "polygon"
    points: [[2.5m, 2.4m], [3.7m, 2.35m], [3.8m, 2.9m], [2.6m, 2.95m]]
    style: { fill: "#e8b4bc", stroke: "#a06070", strokeWidth: 0.02m }
  }
  element corner_a { position: [2m, 0.2m] }
  element corner_b { position: [3.5m, 0.15m] }
  element fence {
    shape: "polyline"
    points: [corner_a, corner_b]
    style: { stroke: "#654", strokeWidth: 0.04m }
  }
  element shared_corner { position: [0.3m, 1.6m] }
  element edge_1 {
    shape: "polyline"
    points: [shared_corner, [1.2m, 1.6m]]
    style: { stroke: "#333", strokeWidth: 0.03m }
  }
  element edge_2 {
    shape: "polygon"
    points: [shared_corner, [1.2m, 1.6m], [1.2m, 2m], [0.3m, 2m]]
    style: { fill: "#ccc" }
  }
}
"""

# rug/fence above are deliberately *not* axis-aligned rectangles (points scattered enough
# to exercise general polygon geometry elsewhere) -- which means no single vertex sits
# exactly at the shape's own bounding-box corner, making "which point is the pivot"
# ambiguous to assert on directly. box/ref_box here are plain axis-aligned rectangles built
# from literal points and from exclusive corner-refs respectively, so point index 0 is
# unambiguously the tl pivot and index 2 is unambiguously the dragged br corner.
SCALE_PLAN = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element box {
    shape: "polygon"
    points: [[1m, 0.3m], [3m, 0.3m], [3m, 1m], [1m, 1m]]
    style: { fill: "#e8b4bc" }
  }
  element c1 { position: [1m, 1.6m] }
  element c2 { position: [3m, 1.6m] }
  element c3 { position: [3m, 2.4m] }
  element c4 { position: [1m, 2.4m] }
  element ref_box {
    shape: "polygon"
    points: [c1, c2, c3, c4]
    style: { fill: "#8ab" }
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


def vertex_handle_count(page):
    return page.locator('.resize-handle[data-corner="vertex"]').count()


def scale_handle_count(page):
    return page.locator('.resize-handle[data-corner^="scale-"]').count()


def handle_center(page, node_id, corner):
    box = page.locator(f'.resize-handle[data-node-id="{node_id}"][data-corner="{corner}"]').bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def vertex_handle_center(page, node_id, point_index):
    box = page.locator(
        f'.resize-handle[data-node-id="{node_id}"][data-corner="vertex"][data-point-index="{point_index}"]'
    ).bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def points_of(text, node_id):
    """D-139: every literal [x, y] pair in `node_id`'s own `points` list, in order -- a
    corner-reference entry (a bare identifier, not a bracketed pair) is skipped, since it
    has no literal coordinates of its own to parse here."""
    m = re.search(rf"element {node_id} \{{.*?points: \[(.*?)\]\n", text, re.S)
    assert m, f"{node_id!r} has no points list in:\n{text}"
    return [
        (float(x), float(y))
        for x, y in re.findall(r"\[(-?[\d.]+)m,\s*(-?[\d.]+)m\]", m.group(1))
    ]


def node_position(text, node_id):
    m = re.search(rf"element {node_id} \{{.*?position: \[(-?[\d.]+)m, (-?[\d.]+)m\]", text, re.S)
    assert m, f"{node_id!r} has no position in:\n{text}"
    return float(m.group(1)), float(m.group(2))


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


def test_no_handles_once_a_second_element_joins_the_selection(app_page):
    """D-136: handles only ever mark the single primary element -- resize itself stays
    single-element only (F-029/D-124) -- so showing them during a multi-selection used to
    misleadingly suggest just that one element was selected. They must disappear the
    moment a second element joins, and come back once the selection collapses to one."""
    load_plan(app_page, PLAN)
    select(app_page, "sofa")
    assert resize_handle_count(app_page) == 4

    lx, ly = element_center(app_page, "lamp")
    alt_click(app_page, lx, ly)
    assert resize_handle_count(app_page) == 0

    # Alt+click sofa again: back down to just lamp selected -- handles return.
    sx, sy = element_center(app_page, "sofa")
    alt_click(app_page, sx, sy)
    assert resize_handle_count(app_page) == 1

    select(app_page, "wall")  # polyline: D-139 gives it one vertex handle per point
    assert resize_handle_count(app_page) == 2


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


def test_polygon_and_polyline_get_one_vertex_handle_per_point(app_page):
    # D-143: rug (4 literal points, no corner-refs) is also eligible for scale, so it now
    # shows 4 scale handles alongside these 4 vertex ones -- scoped to data-corner="vertex"
    # throughout so this test stays about what D-139 itself actually added.
    load_plan(app_page, PLAN)
    select(app_page, "rug")
    assert vertex_handle_count(app_page) == 4
    indices = sorted(int(i) for i in app_page.evaluate(
        "Array.from(document.querySelectorAll('.resize-handle[data-corner=\"vertex\"]')).map(h => h.dataset.pointIndex)"
    ))
    assert indices == [0, 1, 2, 3]

    select(app_page, "wall")
    assert resize_handle_count(app_page) == 2


def test_dragging_a_polygon_vertex_edits_only_that_point(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "rug")
    before = points_of(source_text(app_page), "rug")

    hx, hy = vertex_handle_center(app_page, "rug", 1)
    drag(app_page, hx, hy, hx + 20, hy + 10)

    after = points_of(source_text(app_page), "rug")
    assert after[0] == before[0]
    assert after[2] == before[2]
    assert after[3] == before[3]
    assert after[1] != before[1]
    assert after[1][0] > before[1][0] and after[1][1] > before[1][1]


def test_dragging_a_corner_ref_vertex_moves_the_referenced_node(app_page):
    """D-139: a corner-reference point (the wall/corner pattern F-031/D-032 already
    established, used throughout the shipped `apartment` example) has no literal
    coordinates of its own inside `fence` -- dragging its handle is really just an ordinary
    drag of the referenced sibling node (corner_a), exactly as if its own small anchor dot
    had been dragged directly. `fence`'s own source text never changes."""
    load_plan(app_page, PLAN)
    select(app_page, "fence")
    # D-143: corner_a/corner_b are exclusive to fence, so it's also scale-eligible -- 4
    # scale handles alongside these 2 vertex ones.
    assert vertex_handle_count(app_page) == 2

    before_text = source_text(app_page)
    before_a = node_position(before_text, "corner_a")

    hx, hy = vertex_handle_center(app_page, "fence", 0)
    drag(app_page, hx, hy, hx + 15, hy + 8)

    after_text = source_text(app_page)
    after_a = node_position(after_text, "corner_a")
    assert after_a != before_a
    assert "points: [corner_a, corner_b]" in after_text  # fence's own text is untouched


def test_self_intersecting_polygon_vertex_drag_is_rejected(app_page):
    # rug traces p0(top-left) -> p1(top-right) -> p2(bottom-right) -> p3(bottom-left).
    # Dragging p0 well past the p1-p2 edge (extrapolating beyond both, not just touching
    # one) makes the p3-p0 edge genuinely cross p1-p2, not just coincide with a vertex --
    # segmentsIntersect needs a real crossing, not a degenerate touch, to fire.
    load_plan(app_page, PLAN)
    select(app_page, "rug")
    before = points_of(source_text(app_page), "rug")

    hx, hy = vertex_handle_center(app_page, "rug", 0)
    p1x, p1y = vertex_handle_center(app_page, "rug", 1)
    p2x, p2y = vertex_handle_center(app_page, "rug", 2)
    tx, ty = p2x + (p2x - p1x), p2y + (p2y - p1y)
    # steps=1: one atomic jump straight to the invalid target, no valid intermediate
    # positions along the way that could get applied before the final, rejected one.
    drag(app_page, hx, hy, tx, ty, steps=1)

    assert "self-intersecting" in drag_message(app_page)
    assert points_of(source_text(app_page), "rug") == before  # rejected -- nothing changed


def test_polyline_vertex_drag_is_never_blocked_by_self_intersection(app_page):
    # Self-intersection is meaningless for an open polyline -- the check is scoped to
    # shape:"polygon" only, matching wouldSelfIntersect's own existing convention.
    load_plan(app_page, PLAN)
    select(app_page, "wall")
    before = points_of(source_text(app_page), "wall")

    hx, hy = vertex_handle_center(app_page, "wall", 1)
    drag(app_page, hx, hy, hx - 100, hy + 50)

    assert "self-intersecting" not in drag_message(app_page)
    after = points_of(source_text(app_page), "wall")
    assert after[0] == before[0]
    assert after[1] != before[1]


def test_scale_handles_appear_for_an_eligible_polygon(app_page):
    # rug: 4 literal points, no corner-refs at all -- always eligible.
    load_plan(app_page, PLAN)
    select(app_page, "rug")
    assert scale_handle_count(app_page) == 4
    corners = set(app_page.evaluate(
        "Array.from(document.querySelectorAll('.resize-handle[data-corner^=\"scale-\"]')).map(h => h.dataset.corner)"
    ))
    assert corners == {"scale-tl", "scale-tr", "scale-bl", "scale-br"}


def test_scale_handles_appear_for_a_polygon_whose_corner_refs_are_exclusive_to_it(app_page):
    # fence: corner_a/corner_b, referenced only by fence itself in this plan.
    load_plan(app_page, PLAN)
    select(app_page, "fence")
    assert scale_handle_count(app_page) == 4


def test_no_scale_handles_for_a_polygon_with_a_shared_corner(app_page):
    # edge_2 shares shared_corner with edge_1 -- scaling it would silently distort edge_1
    # too (D-074's own unresolved concern), so no scale handles at all, only its own 4
    # vertex handles (one per point, D-139, unaffected).
    load_plan(app_page, PLAN)
    select(app_page, "edge_2")
    assert scale_handle_count(app_page) == 0
    assert vertex_handle_count(app_page) == 4


def test_dragging_a_scale_handle_grows_every_point_proportionally_from_the_opposite_corner(app_page):
    load_plan(app_page, SCALE_PLAN)
    select(app_page, "box")
    before = points_of(source_text(app_page), "box")

    hbox = app_page.locator('.resize-handle[data-corner="scale-br"]').bounding_box()
    hx, hy = hbox["x"] + hbox["width"] / 2, hbox["y"] + hbox["height"] / 2
    drag(app_page, hx, hy, hx + 40, hy + 20)

    after = points_of(source_text(app_page), "box")
    assert after[0] == before[0]  # tl: the pivot, diagonally opposite "br" -- never moves
    assert after[2] != before[2] and after[2][0] > before[2][0] and after[2][1] > before[2][1]  # br: grew
    assert after[1] != before[1] and after[1][0] > before[1][0] and after[1][1] == before[1][1]  # tr: x only
    assert after[3] != before[3] and after[3][0] == before[3][0] and after[3][1] > before[3][1]  # bl: y only


def test_dragging_a_scale_handle_on_an_exclusive_corner_ref_shape_moves_the_corner_nodes(app_page):
    # ref_box: points: [c1, c2, c3, c4] -- scaling it has no literal text of its own to
    # edit; the referenced corners move instead, exactly like D-139's own single-corner
    # delegation, just several at once.
    load_plan(app_page, SCALE_PLAN)
    select(app_page, "ref_box")
    before_text = source_text(app_page)
    before = {n: node_position(before_text, n) for n in ["c1", "c2", "c3", "c4"]}

    hbox = app_page.locator('.resize-handle[data-corner="scale-br"]').bounding_box()
    hx, hy = hbox["x"] + hbox["width"] / 2, hbox["y"] + hbox["height"] / 2
    drag(app_page, hx, hy, hx + 30, hy + 15)

    after_text = source_text(app_page)
    after = {n: node_position(after_text, n) for n in ["c1", "c2", "c3", "c4"]}
    assert after["c1"] == before["c1"]  # tl: the pivot -- untouched
    assert after["c3"] != before["c3"]  # br: the dragged corner -- moved
    assert "points: [c1, c2, c3, c4]" in after_text  # ref_box's own text is untouched


def test_scale_handle_snaps_to_a_grid_intersection(app_page):
    load_plan(app_page, "settings { grid: { size: 0.5 } }\n" + SCALE_PLAN)
    select(app_page, "box")
    hbox = app_page.locator('.resize-handle[data-corner="scale-br"]').bounding_box()
    hx, hy = hbox["x"] + hbox["width"] / 2, hbox["y"] + hbox["height"] / 2
    drag(app_page, hx, hy, hx + 53, hy + 31)

    px, py = points_of(source_text(app_page), "box")[2]  # br
    assert abs((px / 0.5) - round(px / 0.5)) < 0.01
    assert abs((py / 0.5) - round(py / 0.5)) < 0.01


