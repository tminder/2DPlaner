"""F-029: multi-select for bulk drag, delete, and duplicate -- Alt+click toggles
membership (Shift and Ctrl/Cmd are both already taken by other gestures), a plain click
always collapses back to one, and the group rides one shared delta/undo step for drag,
delete, and duplicate alike."""

import re

from helpers import (
    alt_click,
    alt_drag,
    click_menu_item,
    drag,
    drag_message,
    element_center,
    empty_canvas_point,
    load_plan,
    open_context_menu,
    selected_filter,
    selected_ids_classlist,
    source_text,
    view_box,
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


# Regression guard below: the "apartment" shipped example's own wall/corner pattern --
# adjacent polylines referencing shared sibling corner points (docs/index.html's own
# EXAMPLES.apartment uses exactly this shape for wall_a/door/wall_b/corner_1..4).
CORNER_PLAN = """
element room {
  shape: "rect"
  size: [5m, 4m]
  position: [0m, 0m]
  style: { fill: "#eee" }
  childPlacement: "inside"

  element corner_1 { position: [0m, 0m] }
  element corner_2 { position: [2.2m, 0m] }
  element corner_3 { position: [3.1m, 0m] }
  element corner_4 { position: [5m, 0m] }

  element wall_a {
    shape: "polyline"
    points: [corner_1, corner_2]
    style: { stroke: "#444", strokeWidth: 0.1 }
  }
  element door {
    shape: "polyline"
    points: [corner_2, corner_3]
    style: { stroke: "#8a6a42", strokeWidth: 0.1 }
  }
  element wall_b {
    shape: "polyline"
    points: [corner_3, corner_4]
    style: { stroke: "#444", strokeWidth: 0.1 }
  }
}
"""


# F-047: marquee selection. Its own plan, not the shared PLAN above -- adds a polyline
# ("wire") specifically to cover the non-rect regression guard below, positioned in room's
# top-right corner so it never overlaps the lamp/chair cluster the other marquee tests
# deliberately target.
MARQUEE_PLAN = """
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
  element wire {
    shape: "polyline"
    points: [[3.6m, 0.2m], [4.4m, 0.5m]]
    style: { stroke: "#333", strokeWidth: 0.03m }
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


def test_marquee_drag_selects_every_element_whose_bbox_intersects_it(app_page):
    load_plan(app_page, MARQUEE_PLAN)
    # room itself has a data-id like any other node, and its own bbox spans the whole
    # plan -- any marquee inside the plan necessarily intersects it too, so it's expected
    # in every result below alongside whatever else the marquee actually targets.
    sx, sy = empty_canvas_point(app_page, "room", 0.9, "bottom")
    lamp_box = app_page.locator('[data-id="lamp"]').bounding_box()
    ex, ey = lamp_box["x"] - 12, lamp_box["y"] - 12

    alt_drag(app_page, sx, sy, ex, ey)

    assert set(selected_ids_classlist(app_page)) == {"room", "lamp", "chair"}


def test_marquee_partial_overlap_still_selects_not_full_containment(app_page):
    load_plan(app_page, MARQUEE_PLAN)
    sx, sy = empty_canvas_point(app_page, "room", 0.85, "bottom")
    chair_box = app_page.locator('[data-id="chair"]').bounding_box()
    # Stops partway into chair's own bbox, not past its far edge -- proves the rule is
    # *intersects*, not *fully contains*.
    ex = chair_box["x"] + chair_box["width"] * 0.3
    ey = chair_box["y"] + chair_box["height"] * 0.3

    alt_drag(app_page, sx, sy, ex, ey)

    assert set(selected_ids_classlist(app_page)) == {"room", "chair"}


def test_marquee_selects_circle_and_polyline_shapes_too(app_page):
    """Regression guard for the gap this feature's own design found: this file's own
    computeBboxes (used elsewhere for hover/stack-hint purposes) only ever computes a bbox
    for shape:"rect" and bare points, silently omitting circles/polygons/polylines --
    marquee hit-testing instead uses the native Element.getBBox(), which is shape-agnostic.
    Covering lamp (circle) and wire (polyline) here, alongside the rects, proves it."""
    load_plan(app_page, MARQUEE_PLAN)
    sx, sy = empty_canvas_point(app_page, "room", 0.0, "top")
    ex, ey = empty_canvas_point(app_page, "room", 1.0, "bottom")

    alt_drag(app_page, sx, sy, ex, ey)

    assert set(selected_ids_classlist(app_page)) == {
        "room", "sofa", "cushion", "lamp", "chair", "wire",
    }


def test_marquee_selection_is_additive_with_alt_click(app_page):
    load_plan(app_page, MARQUEE_PLAN)
    select_group(app_page, "sofa")
    assert selected_ids_classlist(app_page) == ["sofa"]

    sx, sy = empty_canvas_point(app_page, "room", 0.9, "bottom")
    lamp_box = app_page.locator('[data-id="lamp"]').bounding_box()
    ex, ey = lamp_box["x"] - 12, lamp_box["y"] - 12
    alt_drag(app_page, sx, sy, ex, ey)

    # A marquee never clears a selection made a moment earlier by Alt+click -- both unions
    # into the same selectedIds, exactly like a second Alt+click would.
    assert set(selected_ids_classlist(app_page)) == {"sofa", "room", "lamp", "chair"}


def test_marquee_that_never_moves_deselects_like_a_plain_click(app_page):
    load_plan(app_page, MARQUEE_PLAN)
    select_group(app_page, "sofa", "lamp")
    assert set(selected_ids_classlist(app_page)) == {"sofa", "lamp"}

    x, y = empty_canvas_point(app_page, "room", 0.9, "bottom")
    app_page.keyboard.down("Alt")
    app_page.mouse.move(x, y)
    app_page.mouse.down()
    app_page.wait_for_timeout(30)
    app_page.mouse.up()
    app_page.keyboard.up("Alt")
    app_page.wait_for_timeout(150)

    # A stray Alt+click on empty canvas that never actually dragged is just a plain click
    # on nothing -- deselects, rather than a zero-size marquee silently doing nothing.
    assert selected_ids_classlist(app_page) == []


def test_group_drag_with_a_shared_corner_reference_does_not_corrupt_the_source(app_page):
    """Regression guard for a real bug found live via marquee selection: when the group
    includes both a corner-referencing polyline (wall_a, door -- each of whose own `points`
    array references sibling corner elements) and one of the corner points they share
    (corner_2, referenced by both wall_a and door) -- trivial for a marquee to scoop up
    together in one region, unlikely for one Alt+click at a time -- dragging any member
    used to double-edit corner_2's own span: once via wall_a's (or door's) own internal
    cornerIds loop, a second time because corner_2 is *also* directly a selected top-level
    group member. Splicing both overlapping edits into the source corrupted it into
    something like "2.346m6m6m" -- surfacing live as "Can't continue this drag: the source
    text is currently invalid" on the very next drag attempt."""
    load_plan(app_page, CORNER_PLAN)
    sx, sy = empty_canvas_point(app_page, "room", 0.15, "top")
    room_box = app_page.locator('[data-id="room"]').bounding_box()
    ex, ey = room_box["x"] + room_box["width"], room_box["y"] + 20
    alt_drag(app_page, sx, sy, ex, ey)

    sel = set(selected_ids_classlist(app_page))
    assert {"wall_a", "door", "wall_b", "corner_2", "corner_3"} <= sel

    before = position_of(source_text(app_page), "corner_2")
    wa_box = app_page.locator('[data-id="wall_a"]').bounding_box()
    wax, way = wa_box["x"] + wa_box["width"] / 2, wa_box["y"] + wa_box["height"] / 2
    drag(app_page, wax, way, wax + 15, way + 25)

    assert "Can't continue this drag" not in drag_message(app_page)
    after = source_text(app_page)
    # A single, well-formed position -- not the double-spliced "2.346m6m6m" the bug used
    # to leave behind -- and it actually moved, proving the group-drag still took effect.
    assert re.search(r"element corner_2 \{ position: \[-?[\d.]+m, -?[\d.]+m\] \}", after)
    assert position_of(after, "corner_2") != before


def test_every_selected_element_gets_the_visible_selected_filter_not_just_the_primary(app_page):
    """D-136/D-137: with several elements selected, the resize handles (which only ever
    mark the single primary element) used to read as more visually obvious than the actual
    multi-selection, misleadingly suggesting just one element was selected. Every member of
    the selection carries the same visible .selected filter now (D-137's stacked
    drop-shadow, shape-accurate for rect/circle/polygon/polyline alike since a filter
    follows the real rendered shape, not a bounding box), and handles stay hidden once a
    second element joins."""
    load_plan(app_page, PLAN)
    select_group(app_page, "sofa")
    assert selected_filter(app_page, "sofa") != "none"

    select_group(app_page, "lamp")
    assert selected_filter(app_page, "sofa") != "none"
    assert selected_filter(app_page, "lamp") != "none"
    assert app_page.locator(".resize-handle").count() == 0  # multi-select: no handles


def test_plain_empty_canvas_drag_still_pans(app_page):
    """Regression guard: the new Alt+drag branch in handlePointerDown's empty-canvas case
    must not disturb the existing (non-Alt) pan gesture it sits right next to."""
    load_plan(app_page, MARQUEE_PLAN)
    before = view_box(app_page)
    x, y = empty_canvas_point(app_page, "room", 0.9, "bottom")

    drag(app_page, x, y, x + 40, y + 30)

    after = view_box(app_page)
    assert before != after
