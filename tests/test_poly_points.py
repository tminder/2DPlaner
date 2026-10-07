"""F-059: adding/removing points on a polygon/polyline interactively -- a smaller "insert a
point here" handle at each edge's own midpoint (clicking it inserts a literal [x, y] pair
there), and right-clicking an existing per-vertex handle (D-139) offers Delete Point instead
of the ordinary element menu. A deleted point only ever removes that one entry from this
shape's own `points` array -- never the referenced corner element itself (D-018), so any
other element's own reference to that same corner is always left untouched."""

from helpers import element_center, load_plan, source_text

QUAD = """
element quad {
  shape: "polygon"
  points: [[0,0], [2,0], [2,2], [0,2]]
  position: [0,0]
  style: { fill: "#8ab" }
}
"""

LINE = """
element wall {
  shape: "polyline"
  points: [[0,0], [3,0]]
  position: [0,0]
  style: { stroke: "#444", strokeWidth: 0.1 }
}
"""

SHARED_CORNERS = """
element root {
  element c0 { position: [0,0] }
  element c1 { position: [2,0] }
  element c2 { position: [2,2] }
  element c3 { position: [0,2] }
  element a {
    shape: "polygon"
    points: [c0, c1, c2, c3]
    position: [0,0]
    style: { fill: "#8ab" }
  }
  element b {
    shape: "polygon"
    points: [c1, [4,0], [4,2], c2]
    position: [0,0]
    style: { fill: "#e88" }
  }
}
"""


def select(page, node_id):
    cx, cy = element_center(page, node_id)
    page.mouse.click(cx, cy)
    page.wait_for_timeout(150)


def insert_handle(page, edge_index):
    return page.locator(f'.resize-handle[data-corner="insert-vertex"][data-edge-index="{edge_index}"]')


def vertex_handle(page, point_index):
    return page.locator(f'.resize-handle[data-corner="vertex"][data-point-index="{point_index}"]')


def click_center(page, locator):
    box = locator.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(150)


def right_click_center(page, locator):
    box = locator.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, button="right")
    page.wait_for_timeout(150)


def test_insert_handles_appear_one_per_edge(app_page):
    load_plan(app_page, QUAD)
    select(app_page, "quad")
    assert page_count(app_page, "insert-vertex") == 4  # 4-point polygon, wraps -> 4 edges

    load_plan(app_page, LINE)
    select(app_page, "wall")
    assert page_count(app_page, "insert-vertex") == 1  # 2-point line, no wrap -> 1 edge


def page_count(page, corner):
    return page.locator(f'.resize-handle[data-corner="{corner}"]').count()


def test_clicking_an_insert_handle_adds_a_literal_point_at_the_midpoint(app_page):
    load_plan(app_page, QUAD)
    select(app_page, "quad")
    click_center(app_page, insert_handle(app_page, 0))  # edge between [0,0] and [2,0]
    text = source_text(app_page)
    points_line = [l for l in text.split("\n") if "points:" in l][0]
    assert "[1m, 0m]" in points_line  # the exact midpoint, spliced right after [0,0]'s own entry
    assert points_line.strip() == 'points: [[0,0], [1m, 0m], [2,0], [2,2], [0,2]]'


def test_inserting_on_the_wrap_around_edge_appends_at_the_end(app_page):
    load_plan(app_page, QUAD)
    select(app_page, "quad")
    click_center(app_page, insert_handle(app_page, 3))  # last point back to the first
    text = source_text(app_page)
    points_line = [l for l in text.split("\n") if "points:" in l][0]
    # the new point is the *last* entry, after the original 4 -- not spliced in the middle
    assert points_line.strip().endswith("]]") and points_line.count("[") == 6


def test_a_newly_inserted_point_is_always_a_literal_pair_even_on_a_corner_ref_shape(app_page):
    load_plan(app_page, SHARED_CORNERS)
    select(app_page, "a")
    click_center(app_page, insert_handle(app_page, 0))  # edge between c0 and c1
    text = source_text(app_page)
    points_line = [l for l in text.split("\n") if 'points: [c0' in l][0]
    assert "c0" in points_line and "c1" in points_line  # corner refs untouched
    assert "[" in points_line.split("c0", 1)[1]  # a literal pair was added, not a new corner id


def test_right_click_a_vertex_shows_delete_point_not_the_element_menu(app_page):
    load_plan(app_page, QUAD)
    select(app_page, "quad")
    right_click_center(app_page, vertex_handle(app_page, 0))
    label = app_page.evaluate(
        """() => document.querySelector('#interactivity-context-menu button[data-i]')?.getAttribute('aria-label')"""
    )
    assert label == "Delete Point"


def test_deleting_a_point_removes_exactly_that_entry(app_page):
    load_plan(app_page, QUAD)
    select(app_page, "quad")
    right_click_center(app_page, vertex_handle(app_page, 1))  # [2,0]
    app_page.click('#interactivity-context-menu button[aria-label="Delete Point"]')
    app_page.wait_for_timeout(150)
    text = source_text(app_page)
    points_line = [l for l in text.split("\n") if "points:" in l][0]
    assert "[2,0]" not in points_line
    assert "[0,0]" in points_line and "[2,2]" in points_line and "[0,2]" in points_line


def test_deleting_the_last_point_leaves_no_dangling_comma(app_page):
    load_plan(app_page, QUAD)
    select(app_page, "quad")
    right_click_center(app_page, vertex_handle(app_page, 3))  # the last point, [0,2]
    app_page.click('#interactivity-context-menu button[aria-label="Delete Point"]')
    app_page.wait_for_timeout(150)
    text = source_text(app_page)
    points_line = [l for l in text.split("\n") if "points:" in l][0]
    assert points_line.strip() == 'points: [[0,0], [2,0], [2,2]]'


def test_deleting_a_shared_corner_reference_leaves_the_corner_and_other_users_untouched(app_page):
    load_plan(app_page, SHARED_CORNERS)
    select(app_page, "a")
    right_click_center(app_page, vertex_handle(app_page, 1))  # c1, shared with "b"
    app_page.click('#interactivity-context-menu button[aria-label="Delete Point"]')
    app_page.wait_for_timeout(150)
    text = source_text(app_page)
    assert "element c1 { position: [2,0] }" in text  # the corner element itself is untouched
    a_line = [l for l in text.split("\n") if l.strip().startswith("points: [c0")][0]
    assert "c1" not in a_line  # only "a"'s own reference was removed
    b_line = [l for l in text.split("\n") if l.strip().startswith("points: [c1")][0]
    assert "c1" in b_line  # "b"'s own reference is unaffected


def test_delete_point_is_disabled_at_the_structural_minimum(app_page):
    load_plan(app_page, """
element tri {
  shape: "polygon"
  points: [[0,0], [2,0], [1,2]]
  position: [0,0]
  style: { fill: "#8ab" }
}
""")
    select(app_page, "tri")
    right_click_center(app_page, vertex_handle(app_page, 0))
    disabled = app_page.evaluate(
        """() => document.querySelector('#interactivity-context-menu button[data-i]')?.classList.contains('disabled')"""
    )
    assert disabled is True

    before = source_text(app_page)
    app_page.click('#interactivity-context-menu button[aria-label="Delete Point"]')
    app_page.wait_for_timeout(150)
    assert source_text(app_page) == before  # disabled items are a no-op


def test_a_plain_shape_right_click_still_opens_the_ordinary_element_menu(app_page):
    load_plan(app_page, QUAD)
    cx, cy = element_center(app_page, "quad")
    app_page.mouse.click(cx, cy, button="right")
    app_page.wait_for_timeout(150)
    labels = app_page.evaluate(
        """() => Array.from(document.querySelectorAll('#interactivity-context-menu button[data-i]')).map(b => b.getAttribute('aria-label'))"""
    )
    assert "Duplicate" in labels
    assert "Delete Point" not in labels
