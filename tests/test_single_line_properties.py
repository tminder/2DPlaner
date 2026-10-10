"""S-040 fixed: findOwnPropertyLine (docs/interactivity-module.js) used to be a
line-anchored regex (`^key\\s*:.*$`) -- it found nothing for a property written mid-line on
a single-line-formatted element, since `key:` never sits at a line start there. Every caller
(setPlacementInside/toggleFlush/renameElement/setElementStylePreset/reparentElement/
clearPlacement) then silently no-op'd or inserted a stale duplicate instead of
finding/editing the existing one. Fixed by walking the node's own token stream instead --
see that function's own comment. These tests specifically target elements written entirely
on one physical line, the exact case the old regex couldn't handle; test_containment_and_
placement.py/test_context_menu.py/test_no_placement_reparent.py already cover the normal,
multi-line-formatted case for the same actions and are unaffected regression guards."""

from helpers import click_menu_item, element_center, load_plan, menu_item_state, open_context_menu, source_text

ROOM_WITH_SINGLE_LINE_SOFA = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa { shape: "rect" size: [1m, 0.6m] position: [1m, 0.5m] placement: "outside" style: { fill: "#8ab" } }
}
"""

ROOM_WITH_SINGLE_LINE_FLUSH_SOFA = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa { shape: "rect" size: [1m, 0.6m] position: [2m, 1.4m] placement: "inside" flush: true style: { fill: "#8ab" } }
}
"""

ROOM_WITH_SINGLE_LINE_LABELED_SOFA = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa { shape: "rect" size: [1m, 0.6m] position: [1m, 0.5m] label: "Sofa" style: { fill: "#8ab" } }
}
"""

HOUSE_WITH_SINGLE_LINE_ROOM_AND_NESTED_SOFA = """
element house {
  shape: "rect"
  size: [6m, 5m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element room { shape: "rect" size: [3m, 2m] position: [1m, 1m] placement: "inside" style: { fill: "#dde" } element sofa { shape: "rect" size: [1m, 0.5m] position: [0.2m, 0.2m] placement: "inside" style: { fill: "#8ab" } } }
}
"""


def test_setting_placement_replaces_an_existing_mid_line_value_not_duplicates_it(app_page):
    load_plan(app_page, ROOM_WITH_SINGLE_LINE_SOFA)  # sofa already has placement: "outside", mid-line
    cx, cy = element_center(app_page, "sofa")
    open_context_menu(app_page, cx, cy)
    click_menu_item(app_page, "Inside room")

    text = source_text(app_page)
    assert text.count("placement:") == 1  # replaced in place, not left stale alongside a new one
    assert 'placement: "inside"' in text
    # Neighboring properties on the same original line survived untouched.
    assert "size: [1m, 0.6m]" in text
    assert 'style: { fill: "#8ab" }' in text


def test_turning_flush_off_removes_it_from_a_mid_line_value_without_corrupting_the_rest(app_page):
    load_plan(app_page, ROOM_WITH_SINGLE_LINE_FLUSH_SOFA)  # sofa already has flush: true, mid-line
    cx, cy = element_center(app_page, "sofa")
    open_context_menu(app_page, cx, cy)
    assert menu_item_state(app_page, "Snapped to room's edge") == {"checked": True, "disabled": False}
    click_menu_item(app_page, "Snapped to room's edge")

    text = source_text(app_page)
    sofa_block = text.split("element sofa")[1]
    assert "flush" not in sofa_block
    # placement (a different property, also mid-line) and everything around it is untouched.
    assert 'placement: "inside"' in sofa_block
    assert "size: [1m, 0.6m]" in sofa_block
    assert 'style: { fill: "#8ab" }' in sofa_block


def test_clearing_a_mid_line_label_removes_just_the_label(app_page):
    load_plan(app_page, ROOM_WITH_SINGLE_LINE_LABELED_SOFA)  # sofa already has label: "Sofa", mid-line
    app_page.on("dialog", lambda d: d.accept(""))
    cx, cy = element_center(app_page, "sofa")
    open_context_menu(app_page, cx, cy)
    click_menu_item(app_page, "Rename")

    text = source_text(app_page)
    sofa_block = text.split("element sofa")[1]
    assert "label:" not in sofa_block
    assert "size: [1m, 0.6m]" in sofa_block
    assert 'style: { fill: "#8ab" }' in sofa_block


def test_clearing_placement_on_a_single_line_parent_leaves_its_nested_childs_same_named_property_alone(app_page):
    """room and its own child sofa are both written on the one shared physical line, and
    both happen to have their own `placement: "inside"` -- the old regex's "not inside a
    child's span" check only ever looked at node.children for this reason; this confirms the
    token-walk's own "skip a child element wholesale" achieves the same isolation."""
    load_plan(app_page, HOUSE_WITH_SINGLE_LINE_ROOM_AND_NESTED_SOFA)
    cx, cy = element_center(app_page, "room")
    open_context_menu(app_page, cx, cy)
    # room's parent (house) is the plan's own root -- no grandparent to promote into, so
    # this is the simple in-place clear (test_no_placement_reparent.py's own precedent).
    click_menu_item(app_page, "No placement (moves freely)")

    text = source_text(app_page)
    room_block = text.split("element room")[1]
    sofa_block = text.split("element sofa")[1]
    assert "placement" not in room_block.split("element sofa")[0]  # room's own, now gone
    assert 'placement: "inside"' in sofa_block  # sofa's own, untouched
    assert text.count("placement:") == 1
