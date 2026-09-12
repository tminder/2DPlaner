"""D-156: the Fit button (reset zoom/pan) moved from a floating control over the viewer
into the header's own View tab -- #header-fit-btn is a stable slot core provides,
unhidden by interactivity-module.js once loaded, the same shape #hierarchy-panel already
established for a module-owned pane."""

from helpers import element_center, load_plan, view_box

PLAN = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }
}
"""


def test_fit_button_lives_in_the_header_view_tab_not_over_the_viewer(app_page):
    load_plan(app_page, PLAN)
    app_page.click("#menu-tab-view")
    assert app_page.locator("#header-fit-btn").is_visible()
    assert app_page.locator("#interactivity-fit-btn").count() == 0


def test_fit_button_resets_pan_and_zoom(app_page):
    load_plan(app_page, PLAN)
    original = view_box(app_page)

    cx, cy = element_center(app_page, "room")
    app_page.mouse.move(cx, cy)
    app_page.mouse.wheel(0, -300)
    app_page.wait_for_timeout(150)
    zoomed = view_box(app_page)
    assert zoomed != original

    app_page.click("#menu-tab-view")
    app_page.click("#header-fit-btn")
    app_page.wait_for_timeout(150)
    after = view_box(app_page)
    assert after is not None and all(abs(a - b) < 1e-6 for a, b in zip(after, original))
