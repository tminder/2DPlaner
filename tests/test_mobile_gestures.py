"""F-036: pinch-to-zoom and a touch long-press equivalent for the context menu.

Playwright has no multi-touch gesture API -- both are driven via dispatch_pointer(), which
fires raw synthetic PointerEvents with pointerType "touch" and distinct pointerIds, the same
way test_hierarchy_panel.py/test_plan_picker.py already reach otherwise-unreachable states
by manipulating the page directly rather than through a higher-level Playwright action."""

from helpers import dispatch_pointer, element_center, load_plan, selected_id, source_text, view_box

ONE_ELEMENT = 'element room { shape: "rect" size: [2m,2m] position: [0m,0m] }'

TWO_SIBLINGS = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]

  element sofa {
    shape: "rect"
    size: [0.8m, 0.5m]
    position: [0.1m, 0.1m]
  }
}
"""


def test_pinching_apart_zooms_in(app_page):
    load_plan(app_page, ONE_ELEMENT)
    before = view_box(app_page)

    # Centered on the one shape itself (fills the whole SVG) rather than a fixed screen
    # coordinate, so this stays correct regardless of viewport size or the code pane's width.
    mid_x, mid_y = element_center(app_page, "room")
    dispatch_pointer(app_page, "pointerdown", 1, mid_x - 15, mid_y)
    dispatch_pointer(app_page, "pointerdown", 2, mid_x + 15, mid_y)
    dispatch_pointer(app_page, "pointermove", 1, mid_x - 60, mid_y)
    dispatch_pointer(app_page, "pointermove", 2, mid_x + 60, mid_y)
    app_page.wait_for_timeout(100)
    during = view_box(app_page)
    dispatch_pointer(app_page, "pointerup", 1, mid_x - 60, mid_y)
    dispatch_pointer(app_page, "pointerup", 2, mid_x + 60, mid_y)

    assert during[2] < before[2], "spreading two fingers apart should shrink the viewBox width (zoom in)"


def test_pinching_together_zooms_out(app_page):
    load_plan(app_page, ONE_ELEMENT)
    before = view_box(app_page)

    mid_x, mid_y = element_center(app_page, "room")
    dispatch_pointer(app_page, "pointerdown", 1, mid_x - 60, mid_y)
    dispatch_pointer(app_page, "pointerdown", 2, mid_x + 60, mid_y)
    dispatch_pointer(app_page, "pointermove", 1, mid_x - 15, mid_y)
    dispatch_pointer(app_page, "pointermove", 2, mid_x + 15, mid_y)
    app_page.wait_for_timeout(100)
    during = view_box(app_page)
    dispatch_pointer(app_page, "pointerup", 1, mid_x - 15, mid_y)
    dispatch_pointer(app_page, "pointerup", 2, mid_x + 15, mid_y)

    assert during[2] > before[2], "bringing two fingers together should grow the viewBox width (zoom out)"


def test_a_single_touch_pointer_still_drags_normally(app_page):
    load_plan(app_page, TWO_SIBLINGS)
    x, y = element_center(app_page, "sofa")

    dispatch_pointer(app_page, "pointerdown", 1, x, y)
    dispatch_pointer(app_page, "pointermove", 1, x + 40, y + 10)
    dispatch_pointer(app_page, "pointerup", 1, x + 40, y + 10)
    app_page.wait_for_timeout(200)

    assert "sofa" in source_text(app_page)
    assert selected_id(app_page) == "sofa"


def test_long_press_on_a_shape_opens_the_context_menu(app_page):
    load_plan(app_page, TWO_SIBLINGS)
    x, y = element_center(app_page, "sofa")

    dispatch_pointer(app_page, "pointerdown", 1, x, y)
    app_page.wait_for_timeout(700)  # past LONG_PRESS_MS, no movement

    assert app_page.evaluate("document.getElementById('interactivity-context-menu').hidden") is False
    assert selected_id(app_page) == "sofa"
    dispatch_pointer(app_page, "pointerup", 1, x, y)


def test_moving_before_the_long_press_fires_drags_instead(app_page):
    load_plan(app_page, TWO_SIBLINGS)
    x, y = element_center(app_page, "sofa")
    before = source_text(app_page)

    dispatch_pointer(app_page, "pointerdown", 1, x, y)
    dispatch_pointer(app_page, "pointermove", 1, x + 40, y + 10)
    app_page.wait_for_timeout(700)  # long past LONG_PRESS_MS -- should have been cancelled by the move

    assert app_page.evaluate("document.getElementById('interactivity-context-menu').hidden") is True
    dispatch_pointer(app_page, "pointerup", 1, x + 40, y + 10)
    app_page.wait_for_timeout(200)
    assert source_text(app_page) != before  # the drag itself still went through


def test_a_second_finger_cancels_a_pending_drag_and_starts_a_pinch(app_page):
    load_plan(app_page, TWO_SIBLINGS)
    x, y = element_center(app_page, "sofa")
    # The second finger lands on "room" (much larger than "sofa", so a nearby offset is
    # guaranteed to still land inside the SVG regardless of the viewer pane's exact fit/scale).
    rx, ry = element_center(app_page, "room")
    before = source_text(app_page)
    before_vb = view_box(app_page)

    # Once pinching, finger 2 moves 40px further away from finger 1 along their own connecting
    # line -- guaranteed to increase the pinch distance (zoom in) regardless of the two
    # elements' actual on-screen layout, rather than an arbitrary fixed-axis offset that could
    # happen to shrink the distance instead depending on where "room" and "sofa" land.
    dist = ((rx - x) ** 2 + (ry - y) ** 2) ** 0.5
    ux2, uy2 = (rx - x) / dist, (ry - y) / dist
    rx2, ry2 = rx + ux2 * 40, ry + uy2 * 40

    dispatch_pointer(app_page, "pointerdown", 1, x, y)
    dispatch_pointer(app_page, "pointermove", 1, x + 5, y)  # a tiny move -- still "pending", not yet committed
    dispatch_pointer(app_page, "pointerdown", 2, rx, ry)
    dispatch_pointer(app_page, "pointermove", 2, rx2, ry2)
    app_page.wait_for_timeout(100)

    assert source_text(app_page) == before, "the cancelled drag must leave no trace in the source"
    assert view_box(app_page)[2] < before_vb[2], "the second finger should have started a real pinch-zoom"

    dispatch_pointer(app_page, "pointerup", 1, x + 5, y)
    dispatch_pointer(app_page, "pointerup", 2, rx2, ry2)
