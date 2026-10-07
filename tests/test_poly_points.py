"""F-059: adding/removing points on a polygon/polyline interactively -- a smaller "insert a
point here" handle at each edge's own midpoint (clicking it inserts a literal [x, y] pair
there), and right-clicking an existing per-vertex handle (D-139) offers Delete Point instead
of the ordinary element menu. A deleted point only ever removes that one entry from this
shape's own `points` array -- never the referenced corner element itself (D-018), so any
other element's own reference to that same corner is always left untouched.

F-051: a polyline's own two open ends each get an "extend the line" handle too (a polygon
has none, it already wraps) -- clicking one continues the adjacent segment's own direction
and length, appending/prepending a literal point. Reuses the same .insert-vertex visual
family and click-and-done model as the mid-edge handles above."""

from helpers import drag, element_center, load_plan, source_text

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

# F-051's own test plans deliberately give the auto-fit viewBox extra margin around the
# polyline being extended -- a line with no other content auto-fits tightly to its own
# extent, so an extend handle (continuing a segment by its own full length) reliably lands
# outside that tight view or under the fixed header toolbar at the top of the page. Neither
# is a logic bug (confirmed live: dispatching the click event directly onto an off-screen
# handle still produces the correct source edit) -- it's a narrow, accepted UX edge case of
# the "extend by the same length as the adjacent segment" default, documented in D-183
# rather than special-cased away. These plans just give enough surrounding frame that a
# plain mouse click lands on the handle normally, like a real user's would.
FRAME_LINE = """
element root {
  element frame {
    shape: "polygon"
    points: [[0,0], [12,0], [12,8], [0,8]]
    style: { fill: "#eef" }
  }
  element wall {
    shape: "polyline"
    points: [[4,4], [8,4]]
    style: { stroke: "#444", strokeWidth: 0.1 }
  }
}
"""

FRAME_QUAD = """
element root {
  element frame {
    shape: "polygon"
    points: [[0,0], [12,0], [12,8], [0,8]]
    style: { fill: "#eef" }
  }
  element quad {
    shape: "polygon"
    points: [[4,4], [8,4], [8,6], [4,6]]
    style: { stroke: "#444", strokeWidth: 0.1, fill: "none" }
  }
}
"""

FRAME_SHARED_JUNCTION = """
element root {
  element frame {
    shape: "polygon"
    points: [[0,0], [12,0], [12,8], [0,8]]
    style: { fill: "#eef" }
  }
  element junction { position: [4,4] }
  element pipe {
    shape: "polyline"
    points: [junction, [8,4]]
    style: { stroke: "#c33", strokeWidth: 0.1 }
  }
  element pipe2 {
    shape: "polyline"
    points: [junction, [4,7]]
    style: { stroke: "#393", strokeWidth: 0.1 }
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


def extend_handle(page, which):
    return page.locator(f'.resize-handle[data-corner="extend-{which}"]')


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


def test_extend_handles_appear_only_for_an_open_polyline(app_page):
    load_plan(app_page, FRAME_LINE)
    select(app_page, "wall")
    assert extend_handle(app_page, "start").count() == 1
    assert extend_handle(app_page, "end").count() == 1

    load_plan(app_page, FRAME_QUAD)
    select(app_page, "quad")
    assert extend_handle(app_page, "start").count() == 0
    assert extend_handle(app_page, "end").count() == 0


def handle_svg_point(page, corner):
    """The handle's own cx/cy, in the plan's SVG user-space units (world coordinates *
    core.M) -- exact and independent of screen pixels/circle radius, unlike a bounding box."""
    return page.evaluate(
        """(corner) => {
            const h = document.querySelector(`.resize-handle[data-corner="${corner}"]`);
            return [Number(h.getAttribute('cx')), Number(h.getAttribute('cy'))];
        }""",
        corner,
    )


def test_extend_handles_render_at_the_computed_continuation_point(app_page):
    # wall: [4,4] -> [8,4], a flat segment along y=4. Continuing it by its own length
    # puts extend-start at [0,4] and extend-end at [12,4] -- frame's own left/right edges
    # at that height, so the computed position doubles as a geometry check.
    load_plan(app_page, FRAME_LINE)
    select(app_page, "wall")
    m = app_page.evaluate("window.PlanCore.M")  # world-unit -> SVG-user-space scale
    start_x, start_y = handle_svg_point(app_page, "extend-start")
    end_x, end_y = handle_svg_point(app_page, "extend-end")
    assert start_x == 0 and end_x == 12 * m  # exactly one segment-length beyond either end
    assert start_y == end_y == 4 * m  # both stay on the flat segment's own line


def test_clicking_the_end_handle_appends_a_continuing_literal_point(app_page):
    load_plan(app_page, FRAME_LINE)
    select(app_page, "wall")
    click_center(app_page, extend_handle(app_page, "end"))
    text = source_text(app_page)
    points_line = [l for l in text.split("\n") if l.strip().startswith("points: [[4,4]")][0]
    assert points_line.strip() == 'points: [[4,4], [8,4], [12m, 4m]]'


def test_clicking_the_start_handle_prepends_a_continuing_literal_point(app_page):
    load_plan(app_page, FRAME_LINE)
    select(app_page, "wall")
    click_center(app_page, extend_handle(app_page, "start"))
    text = source_text(app_page)
    points_line = [l for l in text.split("\n") if "4,4" in l and "8,4" in l][0]
    assert points_line.strip() == 'points: [[0m, 4m], [4,4], [8,4]]'


def test_a_newly_extended_point_is_draggable_afterward(app_page):
    load_plan(app_page, FRAME_LINE)
    select(app_page, "wall")
    click_center(app_page, extend_handle(app_page, "end"))
    app_page.wait_for_timeout(150)
    select(app_page, "wall")
    handle = vertex_handle(app_page, 2)  # the new point just appended
    box = handle.bounding_box()
    drag(app_page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, box["x"] + 40, box["y"] + 20)
    text = source_text(app_page)
    points_line = [l for l in text.split("\n") if l.strip().startswith("points: [[4,4]")][0]
    assert "[12m, 4m]" not in points_line  # the point moved from where extend placed it


def test_extending_from_a_shared_corner_reference_leaves_it_untouched(app_page):
    load_plan(app_page, FRAME_SHARED_JUNCTION)
    select(app_page, "pipe")
    click_center(app_page, extend_handle(app_page, "start"))  # pipe's start is `junction`
    text = source_text(app_page)
    assert "element junction { position: [4,4] }" in text  # the corner itself is untouched
    pipe_line = [l for l in text.split("\n") if l.strip().startswith("points: [")
                 and "junction" in l and "pipe2" not in l][0]
    assert pipe_line.strip().startswith("points: [[") and "junction" in pipe_line  # new literal prepended, junction kept
    pipe2_line = [l for l in text.split("\n") if l.strip() == "points: [junction, [4,7]]"]
    assert pipe2_line  # pipe2's own reference to the same corner is unaffected
