"""D-163 (correcting D-162's own first pass): the header's Edit-tab "New Element" flyout
inserts one of the language's own generic shape primitives (Line/Rectangle/Circle/Polygon)
into the current plan, instead of hand-typing an `element { ... }` block. Reported directly
that D-162's original furniture presets (Bed/Desk/...) didn't belong in the app's own
general-purpose chrome -- see interactivity-module.js's own STANDARD_ELEMENTS comment."""

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
