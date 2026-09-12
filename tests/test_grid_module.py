"""D-149: the grid's own `layer`/`opacity` (F-039 -- a semi-transparent overlay in front of
the plan, not just behind it) and the header's own Grid flyout for editing `type`/`size`
without hand-typing `settings.grid`. Snap-vs-visibility decoupling itself is covered in
test_grid_snap.py, alongside every other snap-behavior case."""

from helpers import drag, element_center, load_plan, source_text

PLAN = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [0.7m, 0.55m]
    style: { fill: "#8ab" }
  }
}
"""

BACK_GRID_PLAN = "settings { grid: { size: 0.5 } }\n" + PLAN
FRONT_GRID_PLAN = 'settings { grid: { size: 0.5, layer: "front", opacity: 0.3 } }\n' + PLAN
NO_LAYER_GRID_PLAN = 'settings { grid: { size: 0.5, layer: "none" } }\n' + PLAN


def test_default_layer_still_renders_behind_every_shape(app_page):
    """Regression guard: omitting `layer` entirely must still paint exactly as before --
    the grid rect inserted before every shape (only its own <defs> precedes it), so it
    paints behind all of them."""
    load_plan(app_page, BACK_GRID_PLAN)
    grid_index, room_index = app_page.evaluate(
        """() => {
            const children = Array.from(document.querySelector('#plan-root svg').children);
            return [children.findIndex(c => c.classList.contains('plan-grid-bg')),
                    children.findIndex(c => c.dataset && c.dataset.id === 'room')];
        }"""
    )
    assert grid_index != -1 and room_index != -1
    assert grid_index < room_index


def test_front_layer_renders_after_every_shape(app_page):
    load_plan(app_page, FRONT_GRID_PLAN)
    is_last = app_page.evaluate(
        """() => document.querySelector('#plan-root svg').lastElementChild.classList.contains('plan-grid-bg')"""
    )
    assert is_last


def test_front_layer_opacity_attribute_reflects_declared_value(app_page):
    load_plan(app_page, FRONT_GRID_PLAN)
    opacity = app_page.evaluate("""() => document.querySelector('.plan-grid-bg')?.getAttribute('opacity')""")
    assert opacity == "0.3"


def test_shape_still_draggable_under_a_full_coverage_front_grid(app_page):
    """The one real regression risk F-039 itself flags: a front grid must never intercept
    clicks/drags meant for a shape underneath it."""
    load_plan(app_page, FRONT_GRID_PLAN)
    before = source_text(app_page)
    x, y = element_center(app_page, "sofa")
    drag(app_page, x, y, x + 40, y + 20)
    assert source_text(app_page) != before


def test_layer_none_renders_no_visual_grid_at_all(app_page):
    load_plan(app_page, NO_LAYER_GRID_PLAN)
    assert app_page.locator(".plan-grid-bg").count() == 0


def test_grid_flyout_toggle_creates_and_removes_settings_grid(app_page):
    load_plan(app_page, PLAN)
    app_page.click("#menu-tab-view")
    app_page.click("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    assert "grid:" in source_text(app_page)
    assert app_page.locator(".plan-grid-bg").count() == 1

    app_page.click("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    assert "grid" not in source_text(app_page)
    assert app_page.locator(".plan-grid-bg").count() == 0


def test_grid_flyout_type_buttons_write_and_reflect_the_current_type(app_page):
    load_plan(app_page, BACK_GRID_PLAN)
    app_page.click("#menu-tab-view")
    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    # Squares (checker) is the implicit default -- active with no explicit `type` written.
    assert app_page.locator("#grid-type-checker-btn").evaluate("el => el.classList.contains('active')")

    app_page.click("#grid-type-lines-btn")
    app_page.wait_for_timeout(150)
    assert 'type: "lines"' in source_text(app_page)

    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    assert app_page.locator("#grid-type-lines-btn").evaluate("el => el.classList.contains('active')")
    assert not app_page.locator("#grid-type-checker-btn").evaluate("el => el.classList.contains('active')")


def test_grid_flyout_size_input_writes_and_reflects_the_current_size(app_page):
    load_plan(app_page, BACK_GRID_PLAN)
    app_page.click("#menu-tab-view")
    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    assert app_page.locator("#grid-size-input").input_value() == "0.5"

    app_page.fill("#grid-size-input", "0.25")
    app_page.locator("#grid-size-input").press("Enter")
    app_page.wait_for_timeout(150)
    assert "size: 0.25m" in source_text(app_page)

    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    assert app_page.locator("#grid-size-input").input_value() == "0.25"


def test_grid_flyout_type_before_grid_exists_creates_it_fresh(app_page):
    load_plan(app_page, PLAN)  # no settings.grid at all yet
    app_page.click("#menu-tab-view")
    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    app_page.click("#grid-type-lines-btn")
    app_page.wait_for_timeout(150)
    text = source_text(app_page)
    assert 'type: "lines"' in text
    assert app_page.locator(".plan-grid-bg").count() == 1


def test_grid_flyout_off_button_turns_grid_off_and_reflects_active_state(app_page):
    """D-156: reported directly -- the only way to turn the grid off used to be the box's
    own plain click, easy to miss while already hovering the flyout. Off/Squares/Lines now
    read as one mutually-exclusive group, Off itself an explicit "make it so" rather than a
    toggle (clicking it while already off must be a no-op, not turn the grid back on)."""
    load_plan(app_page, BACK_GRID_PLAN)
    app_page.click("#menu-tab-view")
    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    assert not app_page.locator("#grid-off-btn").evaluate("el => el.classList.contains('active')")

    app_page.click("#grid-off-btn")
    app_page.wait_for_timeout(150)
    assert "grid" not in source_text(app_page)
    assert app_page.locator(".plan-grid-bg").count() == 0

    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    assert app_page.locator("#grid-off-btn").evaluate("el => el.classList.contains('active')")

    before = source_text(app_page)
    app_page.click("#grid-off-btn")
    app_page.wait_for_timeout(150)
    assert source_text(app_page) == before
