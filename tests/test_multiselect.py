"""F-029: multi-select for bulk drag, delete, and duplicate -- Alt+click toggles
membership (Shift and Ctrl/Cmd are both already taken by other gestures), a plain click
always collapses back to one, and the group rides one shared delta/undo step for drag,
delete, and duplicate alike."""

import re

from helpers import (
    alt_click,
    click_menu_item,
    drag,
    element_center,
    load_plan,
    open_context_menu,
    selected_ids_classlist,
    source_text,
)

PLAN = """
element room {
  shape: "rect"
  size: [5m, 4m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [0.5m, 0.5m]
    style: { fill: "#8ab" }

    element cushion {
      shape: "rect"
      size: [0.3m, 0.3m]
      position: [0.1m, 0.1m]
      style: { fill: "#fff" }
    }
  }
  element lamp {
    shape: "circle"
    radius: 0.2m
    position: [3m, 3m]
    style: { fill: "#fc6" }
  }
  element chair {
    shape: "rect"
    size: [0.5m, 0.5m]
    position: [4m, 3m]
    style: { fill: "#963" }
  }
}
"""


def position_of(text, node_id):
    m = re.search(rf"element {node_id} \{{.*?position: \[([\-\d.]+)m, ([\-\d.]+)m\]", text, re.S)
    assert m, f"{node_id!r} not found (or has no position) in:\n{text}"
    return float(m.group(1)), float(m.group(2))


def select_group(page, *node_ids):
    """Builds a multi-selection purely via Alt+click, one per id -- never touches D-077's
    own click-cycle state (unlike a plain click), so a later plain click or drag reusing
    one of these same points still resolves to exactly that element, not the next thing
    stacked underneath it."""
    for node_id in node_ids:
        x, y = element_center(page, node_id)
        alt_click(page, x, y)


def test_alt_click_adds_to_selection_and_plain_click_collapses(app_page):
    load_plan(app_page, PLAN)
    sx, sy = element_center(app_page, "sofa")

    select_group(app_page, "sofa")
    assert selected_ids_classlist(app_page) == ["sofa"]

    select_group(app_page, "lamp")
    assert set(selected_ids_classlist(app_page)) == {"sofa", "lamp"}

    # A plain click afterward -- even on a still-selected member -- always collapses back
    # to just the one thing clicked, no "sticky" multi-select survives it.
    app_page.mouse.click(sx, sy)
    app_page.wait_for_timeout(150)
    assert selected_ids_classlist(app_page) == ["sofa"]


def test_group_drag_moves_every_selected_member_by_the_same_delta(app_page):
    load_plan(app_page, PLAN)
    sx, sy = element_center(app_page, "sofa")
    select_group(app_page, "sofa", "lamp")
    assert set(selected_ids_classlist(app_page)) == {"sofa", "lamp"}

    before = source_text(app_page)
    sofa_before, lamp_before = position_of(before, "sofa"), position_of(before, "lamp")

    drag(app_page, sx, sy, sx + 60, sy + 40)

    after = source_text(app_page)
    sofa_after, lamp_after = position_of(after, "sofa"), position_of(after, "lamp")
    sofa_delta = (sofa_after[0] - sofa_before[0], sofa_after[1] - sofa_before[1])
    lamp_delta = (lamp_after[0] - lamp_before[0], lamp_after[1] - lamp_before[1])
    assert sofa_delta != (0, 0), "the dragged (primary) element should have moved"
    assert abs(sofa_delta[0] - lamp_delta[0]) < 1e-6
    assert abs(sofa_delta[1] - lamp_delta[1]) < 1e-6
    # The group-drag also selects the whole group on release, not just the primary.
    assert set(selected_ids_classlist(app_page)) == {"sofa", "lamp"}


def test_plain_drag_outside_the_selection_is_unaffected(app_page):
    load_plan(app_page, PLAN)
    cx, cy = element_center(app_page, "chair")
    select_group(app_page, "sofa", "lamp")
    assert set(selected_ids_classlist(app_page)) == {"sofa", "lamp"}

    before = source_text(app_page)
    drag(app_page, cx, cy, cx + 50, cy + 30)
    after = source_text(app_page)

    assert position_of(after, "chair") != position_of(before, "chair")
    assert position_of(after, "sofa") == position_of(before, "sofa")
    assert position_of(after, "lamp") == position_of(before, "lamp")
    # A plain drag on an element outside the group replaces the selection with just it,
    # exactly like today's single-element behavior.
    assert selected_ids_classlist(app_page) == ["chair"]


def test_bulk_delete_removes_the_whole_group_in_one_undo_step(app_page):
    load_plan(app_page, PLAN)
    sx, sy = element_center(app_page, "sofa")
    select_group(app_page, "sofa", "lamp")

    before = source_text(app_page)
    open_context_menu(app_page, sx, sy)
    click_menu_item(app_page, "Delete 2 Elements")

    after = source_text(app_page)
    assert "element sofa " not in after
    assert "element lamp " not in after
    assert "element chair " in after  # untouched sibling

    app_page.keyboard.press("Control+z")
    app_page.wait_for_timeout(200)
    assert source_text(app_page) == before, "one undo should restore the whole group"


def test_bulk_duplicate_creates_fresh_ids_at_the_same_offset(app_page):
    load_plan(app_page, PLAN)
    sx, sy = element_center(app_page, "sofa")
    select_group(app_page, "sofa", "lamp")

    before = source_text(app_page)
    sofa_before, lamp_before = position_of(before, "sofa"), position_of(before, "lamp")

    open_context_menu(app_page, sx, sy)
    click_menu_item(app_page, "Duplicate 2 Elements")

    after = source_text(app_page)
    assert after.count("element sofa_copy {") == 1
    assert after.count("element lamp_copy {") == 1
    sofa_copy = position_of(after, "sofa_copy")
    lamp_copy = position_of(after, "lamp_copy")
    assert abs(sofa_copy[0] - (sofa_before[0] + 0.3)) < 1e-6
    assert abs(sofa_copy[1] - (sofa_before[1] + 0.3)) < 1e-6
    assert abs(lamp_copy[0] - (lamp_before[0] + 0.3)) < 1e-6
    assert abs(lamp_copy[1] - (lamp_before[1] + 0.3)) < 1e-6
    # Originals untouched.
    assert position_of(after, "sofa") == sofa_before
    assert position_of(after, "lamp") == lamp_before


def test_selection_with_a_parent_and_its_own_child_collapses_to_the_parent(app_page):
    load_plan(app_page, PLAN)
    select_group(app_page, "sofa", "cushion")
    assert set(selected_ids_classlist(app_page)) == {"sofa", "cushion"}

    # A point inside sofa but away from its own top-left corner, where cushion (and its
    # own resize handles -- cushion, not sofa, is the primary/last-selected member here)
    # actually sits, so the right-click hits sofa's own body, not a resize-handle rect.
    box = app_page.locator('[data-id="sofa"]').bounding_box()
    sx, sy = box["x"] + box["width"] * 0.85, box["y"] + box["height"] * 0.85

    before = source_text(app_page)
    open_context_menu(app_page, sx, sy)
    click_menu_item(app_page, "Duplicate 2 Elements")

    after = source_text(app_page)
    # Only one clone of the parent subtree -- the child is carried along inside it, not
    # duplicated a second time as its own top-level clone.
    assert after.count("element sofa_copy {") == 1
    assert after.count("cushion_copy") == 1
    # The original subtree (both sofa and its child cushion) is untouched.
    assert "element cushion {" in before
    assert before.count("element cushion {") == after.count("element cushion {")
