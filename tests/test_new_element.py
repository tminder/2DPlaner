"""D-162: the header's Edit-tab "New Element" flyout inserts one of the app's own standard
furniture presets (carried over from the bundled `apartment` example) into the current
plan, instead of hand-typing an `element { ... }` block. See interactivity-module.js's own
STANDARD_ELEMENTS comment for why utility/campervan's own domain-specific presets and
door/wall (corner-ref-anchored, not self-contained) are excluded."""

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
    pick_preset(app_page, "table")

    text = source_text(app_page)
    room_open = text.index("element room {")
    table_at = text.index("element table {")
    bed_at = text.index("element bed {")
    assert room_open < table_at < bed_at  # table landed as room's *first* child, before bed
    assert 'shape: "circle"' in text
    assert "radius: 0.35m" in text
    assert "position: [0.3m, 0.3m]" in text
    assert 'label: "Table"' in text


def test_inserts_into_the_selected_element_instead_of_the_root(app_page):
    load_plan(app_page, PLAN)
    x, y = element_center(app_page, "bed")
    app_page.mouse.click(x, y)
    app_page.wait_for_timeout(150)

    open_new_element_flyout(app_page)
    pick_preset(app_page, "desk")

    text = source_text(app_page)
    bed_open = text.index("element bed {")
    desk_at = text.index("element desk {")
    bed_close = text.index("\n  }", bed_open)  # bed's own closing brace
    assert bed_open < desk_at < bed_close  # nested *inside* bed, not a sibling of it


def test_repeated_inserts_get_unique_ids(app_page):
    load_plan(app_page, PLAN)
    open_new_element_flyout(app_page)
    pick_preset(app_page, "table")
    pick_preset(app_page, "table")

    text = source_text(app_page)
    assert "element table {" in text
    assert "element table2 {" in text


def test_every_preset_produces_valid_parseable_output(app_page):
    load_plan(app_page, PLAN)
    open_new_element_flyout(app_page)
    for preset_id in ["bed", "desk", "table", "stove", "counter", "rug"]:
        pick_preset(app_page, preset_id)

    assert app_page.locator("#error").inner_text().strip() == ""
    text = source_text(app_page)
    for preset_id in ["bed2", "desk", "table", "stove", "counter", "rug"]:
        assert f"element {preset_id} {{" in text
