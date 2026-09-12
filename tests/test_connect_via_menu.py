"""D-144: right-click's own way to start the connect/relate gesture (previously only
reachable via Ctrl/Cmd+drag), and the context-menu consolidation that made room for it --
capped at 5 items at the top level."""

from helpers import (
    click_menu_item,
    dispatch_pointer,
    element_center,
    empty_canvas_point,
    load_plan,
    menu_items,
    open_context_menu,
    source_text,
    top_level_menu_labels,
)

ROOM_WITH_TWO_CHILDREN = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [0.2m, 0.2m]
    style: { fill: "#8ab" }
  }
  element lamp {
    shape: "rect"
    size: [1m, 1m]
    position: [2.5m, 1m]
    style: { fill: "#fc6" }
  }
}
"""


def test_top_level_menu_is_capped_at_five_items(app_page):
    load_plan(app_page, ROOM_WITH_TWO_CHILDREN)
    sx, sy = element_center(app_page, "sofa")
    open_context_menu(app_page, sx, sy)
    assert top_level_menu_labels(app_page) == [
        "Duplicate",
        "Delete Element",
        "Order",
        "Placement",
        "Connections",
    ]


def test_connect_to_lives_inside_connections_submenu(app_page):
    load_plan(app_page, ROOM_WITH_TWO_CHILDREN)
    sx, sy = element_center(app_page, "sofa")
    open_context_menu(app_page, sx, sy)
    assert "Connect to…" in menu_items(app_page)


def test_right_click_connect_to_then_click_target_opens_relate_menu_and_connects(app_page):
    load_plan(app_page, ROOM_WITH_TWO_CHILDREN)
    before = source_text(app_page)
    sx, sy = element_center(app_page, "sofa")
    lx, ly = element_center(app_page, "lamp")

    open_context_menu(app_page, sx, sy)
    click_menu_item(app_page, "Connect to…")
    # Closing the context menu (any menu click already does this) plus arming the pick --
    # no connection yet, nothing else changed.
    assert app_page.locator("#interactivity-context-menu").is_hidden()
    assert source_text(app_page) == before

    app_page.mouse.move(lx, ly)
    app_page.wait_for_timeout(100)
    assert app_page.evaluate(
        """(id) => document.querySelector(`[data-id="${id}"]`).classList.contains('relate-candidate')""",
        "lamp",
    )

    app_page.mouse.click(lx, ly)
    app_page.wait_for_timeout(150)
    assert menu_items(app_page) == ["Connect to lamp"]

    click_menu_item(app_page, "Connect to lamp")
    assert source_text(app_page) == before + "connection sofa lamp\n"


def test_escape_cancels_a_pending_pick_without_connecting(app_page):
    load_plan(app_page, ROOM_WITH_TWO_CHILDREN)
    before = source_text(app_page)
    sx, sy = element_center(app_page, "sofa")
    lx, ly = element_center(app_page, "lamp")

    open_context_menu(app_page, sx, sy)
    click_menu_item(app_page, "Connect to…")
    app_page.keyboard.press("Escape")
    app_page.wait_for_timeout(100)

    # The candidate highlight is gone, and clicking what would have been a valid target now
    # just does an ordinary click (selects it) -- no relate-confirmation menu, no connection.
    app_page.mouse.click(lx, ly)
    app_page.wait_for_timeout(150)
    assert app_page.locator("#interactivity-context-menu").is_hidden()
    assert source_text(app_page) == before


def test_clicking_empty_canvas_cancels_a_pending_pick_without_connecting(app_page):
    load_plan(app_page, ROOM_WITH_TWO_CHILDREN)
    before = source_text(app_page)
    sx, sy = element_center(app_page, "sofa")
    ex, ey = empty_canvas_point(app_page, "room", 0.5, "bottom")

    open_context_menu(app_page, sx, sy)
    click_menu_item(app_page, "Connect to…")
    app_page.mouse.click(ex, ey)
    app_page.wait_for_timeout(150)

    assert app_page.locator("#interactivity-context-menu").is_hidden()
    assert source_text(app_page) == before


def test_touch_tap_resolves_a_pending_pick(app_page):
    """D-152: a real bug, reported directly -- touch has no hover state without an active
    drag, so a single tap (pointerdown+pointerup at the same point, no intervening
    pointermove) never populated connectPick's own hover-tracked candidateId, and every
    tap during a pick silently cancelled it instead of connecting. Long-presses sofa via
    raw touch PointerEvents (dispatch_pointer, matching test_mobile_gestures.py's own
    convention for reaching touch-only states no higher-level Playwright action can), taps
    "Connect to…", then taps the target as a single touch tap with no hover at all."""
    load_plan(app_page, ROOM_WITH_TWO_CHILDREN)
    before = source_text(app_page)
    sx, sy = element_center(app_page, "sofa")
    lx, ly = element_center(app_page, "lamp")

    dispatch_pointer(app_page, "pointerdown", 1, sx, sy, pointer_type="touch")
    app_page.wait_for_timeout(700)  # past LONG_PRESS_MS
    dispatch_pointer(app_page, "pointerup", 1, sx, sy, pointer_type="touch")
    app_page.wait_for_timeout(150)
    # The radial menu's own root is a deliberate 0x0 anchor box (D-145) -- Playwright's own
    # is_hidden()/is_visible() heuristics read that as "not visible" regardless of the
    # underlying `hidden` attribute, so the DOM property itself is what test_mobile_gestures.py
    # already checks for exactly this reason; matched here rather than reintroducing the
    # same false negative.
    assert app_page.evaluate("document.getElementById('interactivity-context-menu').hidden") is False

    click_menu_item(app_page, "Connect to…")

    dispatch_pointer(app_page, "pointerdown", 2, lx, ly, pointer_type="touch")
    dispatch_pointer(app_page, "pointerup", 2, lx, ly, pointer_type="touch")
    app_page.wait_for_timeout(150)
    assert menu_items(app_page) == ["Connect to lamp"]

    click_menu_item(app_page, "Connect to lamp")
    assert source_text(app_page) == before + "connection sofa lamp\n"


def test_right_click_during_a_pending_pick_cancels_it_instead_of_opening_a_menu(app_page):
    load_plan(app_page, ROOM_WITH_TWO_CHILDREN)
    before = source_text(app_page)
    sx, sy = element_center(app_page, "sofa")
    lx, ly = element_center(app_page, "lamp")

    open_context_menu(app_page, sx, sy)
    click_menu_item(app_page, "Connect to…")
    app_page.mouse.click(lx, ly, button="right")
    app_page.wait_for_timeout(150)

    assert app_page.locator("#interactivity-context-menu").is_hidden()
    assert source_text(app_page) == before

    # The pick is genuinely cancelled, not just the menu suppressed once -- an ordinary
    # right-click right afterward opens a normal context menu again.
    open_context_menu(app_page, lx, ly)
    assert "Connections" in top_level_menu_labels(app_page)
