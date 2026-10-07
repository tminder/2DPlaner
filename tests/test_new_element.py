"""D-163 (correcting D-162's own first pass): the header's Edit-tab "New Element" flyout
inserts one of the language's own generic shape primitives (Line/Rectangle/Circle/Polygon)
into the current plan, instead of hand-typing an `element { ... }` block. Reported directly
that D-162's original furniture presets (Bed/Desk/...) didn't belong in the app's own
general-purpose chrome -- see interactivity-module.js's own STANDARD_ELEMENTS comment.

F-050 (D-185): a selection with no unambiguous "inside" (anything but rect/polygon) isn't a
sensible container -- inserting lands the new element as a *sibling* instead, one level up
into the selection's own parent."""

from helpers import element_center, load_plan, source_text

PLAN = """
element room {
  shape: "rect"
  size: [5m, 4m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element bed {
    shape: "rect"
    size: [1.6m, 2m]
    position: [0.3m, 0.4m]
    style: { fill: "#cfe0f5" }
  }
}
"""

NON_CONTAINER_PLAN = """
element root {
  element c0 { position: [0,0] }
  element wall {
    shape: "polyline"
    points: [[0,0], [3,0]]
    style: { stroke: "#444", strokeWidth: 0.1 }
  }
  element bulb {
    shape: "circle"
    radius: 0.2m
    position: [1m, 1m]
    style: { fill: "yellow" }
  }
}
"""


def open_new_element_flyout(page):
    page.click("#menu-tab-edit")
    page.hover("#new-element-btn")
    page.wait_for_timeout(150)


def pick_preset(page, preset_id):
    page.click(f'#new-element-btn button[data-preset="{preset_id}"]')
    page.wait_for_timeout(150)


def test_inserts_as_the_root_first_child_when_nothing_is_selected(app_page):
    load_plan(app_page, PLAN)
    open_new_element_flyout(app_page)
    pick_preset(app_page, "circle")

    text = source_text(app_page)
    room_open = text.index("element room {")
    circle_at = text.index("element circle {")
    bed_at = text.index("element bed {")
    assert room_open < circle_at < bed_at  # landed as room's *first* child, before bed
    assert 'shape: "circle"' in text
    assert "radius: 0.5m" in text
    assert "position: [0.3m, 0.3m]" in text
    assert "label:" not in text.split("element circle {")[1].split("}")[0]  # generic shapes get no label


def test_inserts_into_the_selected_element_instead_of_the_root(app_page):
    load_plan(app_page, PLAN)
    x, y = element_center(app_page, "bed")
    app_page.mouse.click(x, y)
    app_page.wait_for_timeout(150)

    open_new_element_flyout(app_page)
    pick_preset(app_page, "rect")

    text = source_text(app_page)
    bed_open = text.index("element bed {")
    rect_at = text.index("element rect {")
    bed_close = text.index("\n  }", bed_open)  # bed's own closing brace
    assert bed_open < rect_at < bed_close  # nested *inside* bed, not a sibling of it


def test_repeated_inserts_get_unique_ids(app_page):
    load_plan(app_page, PLAN)
    open_new_element_flyout(app_page)
    pick_preset(app_page, "rect")
    pick_preset(app_page, "rect")

    text = source_text(app_page)
    assert "element rect {" in text
    assert "element rect2 {" in text


def test_line_preset_has_no_fill_in_its_style(app_page):
    """A polyline has no fill in every shipped example (wall_a/door, etc.) -- the Line
    preset's own generated style must not synthesize one either."""
    load_plan(app_page, PLAN)
    open_new_element_flyout(app_page)
    pick_preset(app_page, "line")

    text = source_text(app_page)
    line_block = text.split("element line {")[1].split("\n  }")[0]
    assert "fill" not in line_block
    assert "stroke:" in line_block


def test_every_preset_produces_valid_parseable_output(app_page):
    load_plan(app_page, PLAN)
    open_new_element_flyout(app_page)
    for preset_id in ["line", "rect", "circle", "polygon"]:
        pick_preset(app_page, preset_id)

    assert app_page.locator("#error").inner_text().strip() == ""
    text = source_text(app_page)
    for preset_id in ["line", "rect", "circle", "polygon"]:
        assert f"element {preset_id} {{" in text


def test_selecting_a_polyline_inserts_as_a_sibling_not_nested_inside(app_page):
    load_plan(app_page, NON_CONTAINER_PLAN)
    x, y = element_center(app_page, "wall")
    app_page.mouse.click(x, y)
    app_page.wait_for_timeout(150)

    open_new_element_flyout(app_page)
    pick_preset(app_page, "rect")

    text = source_text(app_page)
    wall_open = text.index("element wall {")
    wall_close = text.index("\n  }", wall_open)
    rect_at = text.index("element rect {")
    assert not (wall_open < rect_at < wall_close)  # not nested inside wall
    root_open = text.index("element root {")
    assert root_open < rect_at  # landed one level up, inside wall's own parent (root)


def test_selecting_a_circle_inserts_as_a_sibling_not_nested_inside(app_page):
    load_plan(app_page, NON_CONTAINER_PLAN)
    x, y = element_center(app_page, "bulb")
    app_page.mouse.click(x, y)
    app_page.wait_for_timeout(150)

    open_new_element_flyout(app_page)
    pick_preset(app_page, "polygon")

    text = source_text(app_page)
    bulb_open = text.index("element bulb {")
    bulb_close = text.index("\n  }", bulb_open)
    polygon_at = text.index("element polygon {")
    assert not (bulb_open < polygon_at < bulb_close)  # not nested inside bulb


def test_selecting_a_shapeless_corner_inserts_as_a_sibling_not_nested_inside(app_page):
    load_plan(app_page, NON_CONTAINER_PLAN)
    x, y = element_center(app_page, "c0")
    app_page.mouse.click(x, y)
    app_page.wait_for_timeout(150)

    open_new_element_flyout(app_page)
    pick_preset(app_page, "circle")

    text = source_text(app_page)
    c0_line = [l for l in text.split("\n") if "element c0 {" in l][0]
    assert "element circle {" not in c0_line  # c0 is a one-liner with no children to nest into
    root_open = text.index("element root {")
    circle_at = text.index("element circle {")
    assert root_open < circle_at  # landed one level up, inside c0's own parent (root)


