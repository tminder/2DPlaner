"""F-043: arrow keys nudge the selected element, Shift+arrow resizes it, with a
`settings { keyboardStep }`-configurable step size (D-109)."""

from helpers import drag_message, element_center, load_plan, source_text

PLAN = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [0.5m, 0.5m]
    style: { fill: "#8ab" }
  }
  element lamp {
    shape: "circle"
    radius: 0.3m
    position: [3m, 2m]
    style: { fill: "#fc6" }
  }
  element switch {
    position: [2m, 2.6m]
  }
  element wall {
    shape: "polyline"
    points: [[0.2m, 2.9m], [1.5m, 2.9m]]
    style: { stroke: "#333", strokeWidth: 0.05m }
  }
}
"""

CONNECTED_PLAN = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element switch {
    position: [0.3m, 0.3m]
  }
  element lamp {
    shape: "rect"
    size: [1m, 1m]
    position: [2.5m, 1m]
    style: { fill: "#fc6" }
  }
}
connection switch lamp
"""


def select(page, node_id):
    cx, cy = element_center(page, node_id)
    page.mouse.click(cx, cy)
    page.wait_for_timeout(150)


def test_arrow_key_moves_selected_rect_by_default_step(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "sofa")
    app_page.keyboard.press("ArrowRight")
    app_page.wait_for_timeout(150)
    assert "position: [0.6m, 0.5m]" in source_text(app_page)

    app_page.keyboard.press("ArrowDown")
    app_page.wait_for_timeout(150)
    assert "position: [0.6m, 0.6m]" in source_text(app_page)

    app_page.keyboard.press("ArrowLeft")
    app_page.keyboard.press("ArrowUp")
    app_page.wait_for_timeout(150)
    assert "position: [0.5m, 0.5m]" in source_text(app_page)


def test_arrow_key_nudge_propagates_to_a_connected_element(app_page):
    load_plan(app_page, CONNECTED_PLAN)
    select(app_page, "switch")
    app_page.keyboard.press("ArrowRight")
    app_page.wait_for_timeout(150)
    text = source_text(app_page)
    assert "position: [0.4m, 0.3m]" in text.split("element switch")[1][:120]
    assert "position: [2.6m, 1m]" in text.split("element lamp")[1][:120]


def test_shift_arrow_resizes_a_rect(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "sofa")
    app_page.keyboard.down("Shift")
    app_page.keyboard.press("ArrowRight")
    app_page.keyboard.up("Shift")
    app_page.wait_for_timeout(150)
    assert "size: [1.1m, 0.6m]" in source_text(app_page)

    app_page.keyboard.down("Shift")
    app_page.keyboard.press("ArrowDown")
    app_page.keyboard.up("Shift")
    app_page.wait_for_timeout(150)
    assert "size: [1.1m, 0.7m]" in source_text(app_page)
    # A plain resize never touches position -- move and resize are independent.
    assert "position: [0.5m, 0.5m]" in source_text(app_page)


def test_shift_arrow_resizes_a_circle_from_any_direction(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "lamp")
    app_page.keyboard.down("Shift")
    app_page.keyboard.press("ArrowDown")
    app_page.keyboard.up("Shift")
    app_page.wait_for_timeout(150)
    assert "radius: 0.4m" in source_text(app_page)

    app_page.keyboard.down("Shift")
    app_page.keyboard.press("ArrowLeft")
    app_page.keyboard.up("Shift")
    app_page.wait_for_timeout(150)
    assert "radius: 0.3" in source_text(app_page)


def test_shift_arrow_on_shapeless_element_is_a_clear_noop(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "switch")
    before = source_text(app_page)
    app_page.keyboard.down("Shift")
    app_page.keyboard.press("ArrowRight")
    app_page.keyboard.up("Shift")
    app_page.wait_for_timeout(150)
    assert source_text(app_page) == before
    assert drag_message(app_page) == "'switch': has no size to resize"


def test_shift_arrow_on_polyline_is_a_clear_noop(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "wall")
    before = source_text(app_page)
    app_page.keyboard.down("Shift")
    app_page.keyboard.press("ArrowRight")
    app_page.keyboard.up("Shift")
    app_page.wait_for_timeout(150)
    assert source_text(app_page) == before
    assert drag_message(app_page) == '\'wall\': resize isn\'t supported for shape "polyline" yet'


def test_arrow_keys_do_nothing_while_the_code_textarea_has_focus(app_page):
    load_plan(app_page, PLAN)
    select(app_page, "sofa")
    before = source_text(app_page)
    app_page.click("#source")
    app_page.keyboard.press("ArrowRight")
    app_page.keyboard.press("ArrowDown")
    app_page.wait_for_timeout(150)
    assert source_text(app_page) == before

    # Clicking back on the canvas restores the shortcut.
    select(app_page, "sofa")
    app_page.keyboard.press("ArrowRight")
    app_page.wait_for_timeout(150)
    assert source_text(app_page) != before


def test_keyboard_step_setting_changes_the_nudge_distance(app_page):
    load_plan(app_page, "settings {\n  keyboardStep: 0.5\n}\n" + PLAN)
    select(app_page, "sofa")
    app_page.keyboard.press("ArrowRight")
    app_page.wait_for_timeout(150)
    assert "position: [1m, 0.5m]" in source_text(app_page)


def test_holding_a_key_coalesces_into_one_undo_step(app_page):
    """Simulates OS auto-repeat (several keydowns, one keyup) by dispatching extra
    keydown events directly -- Playwright's own keyboard.down() only ever fires one real
    keydown, it doesn't simulate the browser's repeat timer."""
    load_plan(app_page, PLAN)
    select(app_page, "sofa")
    before = source_text(app_page)

    app_page.keyboard.down("ArrowRight")
    app_page.evaluate(
        """() => {
            for (let i = 0; i < 4; i++) {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            }
        }"""
    )
    app_page.keyboard.up("ArrowRight")
    app_page.wait_for_timeout(150)
    held = source_text(app_page)
    # 1 real keydown (from .down()) + 4 dispatched = 5 steps of 0.1m = moved by 0.5m total.
    assert "position: [1m, 0.5m]" in held
    assert held != before

    app_page.keyboard.press("Control+z")
    app_page.wait_for_timeout(200)
    assert source_text(app_page) == before, "one undo should fully revert the whole held-key gesture"
