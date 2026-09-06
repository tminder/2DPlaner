"""F-040: the code/viewer pane split is resizable via a draggable divider (#pane-resizer),
persists across reloads, clamps at sensible minimums, supports the keyboard, and is hidden
entirely on the mobile (stacked-tabs) layout."""


def resize_target_width(page):
    return page.evaluate(
        "() => (document.getElementById('code-highlight-wrap') || document.getElementById('source'))"
        ".getBoundingClientRect().width"
    )


def drag_resizer(page, dx):
    box = page.locator("#pane-resizer").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + dx, cy, steps=10)
    page.mouse.up()
    page.wait_for_timeout(150)


def test_dragging_the_resizer_changes_the_code_pane_width(app_page):
    before = resize_target_width(app_page)
    drag_resizer(app_page, 100)
    after = resize_target_width(app_page)
    assert after == before + 100

    viewer_width = app_page.evaluate("document.querySelector('.viewer-pane').getBoundingClientRect().width")
    assert viewer_width > 0  # the viewer pane took up the remaining space, no gap/overlap


def test_width_persists_across_a_reload_including_after_code_highlight_module_loads(app_page):
    drag_resizer(app_page, 80)
    target_width = resize_target_width(app_page)

    app_page.reload()
    # Immediately after reload, before code-highlight-module.js has finished wrapping the
    # textarea -- the restore must already be applied to the bare textarea itself.
    early_width = app_page.evaluate("document.getElementById('source').getBoundingClientRect().width")
    assert early_width == target_width

    app_page.wait_for_timeout(500)
    # After the module wraps the textarea, #code-highlight-wrap must have picked up the
    # same restored width via its own getComputedStyle copy, not reset to the 420px default.
    late_width = resize_target_width(app_page)
    assert late_width == target_width


def test_dragging_past_the_extreme_clamps_instead_of_overshooting(app_page):
    drag_resizer(app_page, 5000)
    code_width = resize_target_width(app_page)
    viewer_width = app_page.evaluate("document.querySelector('.viewer-pane').getBoundingClientRect().width")
    assert viewer_width >= 300  # MIN_VIEWER_PANE_WIDTH -- the viewer must stay usable

    drag_resizer(app_page, -5000)
    code_width_min = resize_target_width(app_page)
    assert code_width_min >= 240  # MIN_CODE_PANE_WIDTH -- the code pane must stay usable
    assert code_width_min < code_width


def test_arrow_keys_resize_the_focused_divider(app_page):
    before = resize_target_width(app_page)
    app_page.locator("#pane-resizer").focus()
    app_page.keyboard.press("ArrowRight")
    app_page.wait_for_timeout(150)
    after = resize_target_width(app_page)
    assert after == before + 20  # PANE_RESIZE_STEP

    app_page.keyboard.press("ArrowLeft")
    app_page.wait_for_timeout(150)
    assert resize_target_width(app_page) == before


def test_resizer_is_hidden_on_the_mobile_layout(app_page):
    app_page.set_viewport_size({"width": 375, "height": 700})
    app_page.wait_for_timeout(200)
    display = app_page.evaluate("getComputedStyle(document.getElementById('pane-resizer')).display")
    assert display == "none"
