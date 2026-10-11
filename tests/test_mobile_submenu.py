"""Reported directly: on a real touchscreen, the header's hover-driven flyouts (New Element,
Grid, Snap, Export) were effectively unreachable -- a tap can't sustain the CSS :hover state
the whole mechanism depends on, so a flyout at best flashed open for an instant before
disappearing the moment the finger lifted or moved toward its own content, uncovering
whatever was underneath (the mobile Code/Viewer pane). A `.submenu-open` class, toggled by a
delegated capture-phase click listener gated on `(hover: none)`, is the touch equivalent of
:hover -- this file drives it with a genuinely touch-capable browser context (`has_touch=True`,
`is_mobile=True`), not the synthetic-pointer-event trick test_mobile_gestures.py uses for
gesture mechanics inside the SVG, since `(hover: none)` is a real browser-context media
feature, not a per-event pointerType a dispatched PointerEvent alone can fake."""

import pathlib

import pytest

DOCS_URL = (pathlib.Path(__file__).resolve().parent.parent / "docs" / "index.html").as_uri()


@pytest.fixture
def touch_app_page(browser):
    context = browser.new_context(viewport={"width": 390, "height": 750}, has_touch=True, is_mobile=True)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(DOCS_URL)
    page.wait_for_timeout(400)
    yield page
    context.close()
    assert errors == [], f"unexpected console error(s): {errors}"


def test_hover_none_matches_on_the_touch_context_and_not_the_ordinary_one(touch_app_page, app_page):
    assert touch_app_page.evaluate("window.matchMedia('(hover: none)').matches") is True
    assert app_page.evaluate("window.matchMedia('(hover: none)').matches") is False


def test_tapping_a_has_submenu_box_opens_it_without_firing_its_own_default_action(touch_app_page):
    touch_app_page.click("#menu-tab-view")
    touch_app_page.tap("#grid-toggle-btn")
    touch_app_page.wait_for_timeout(150)
    btn = touch_app_page.locator("#grid-toggle-btn")
    assert btn.evaluate("el => el.classList.contains('submenu-open')")
    assert touch_app_page.evaluate(
        "getComputedStyle(document.querySelector('#grid-toggle-btn .submenu')).display"
    ) == "block"
    # The tap opened the flyout -- it must not *also* have run the box's own plain-click
    # shortcut (Grid's on/off toggle), which is what made the flyout unreachable in the
    # first place once someone actually tried to tap an option inside it.
    assert not btn.evaluate("el => el.classList.contains('active')")


def test_tapping_an_option_inside_applies_it_and_then_closes_the_flyout(touch_app_page):
    touch_app_page.click("#menu-tab-view")
    touch_app_page.tap("#grid-toggle-btn")
    touch_app_page.wait_for_timeout(100)
    touch_app_page.tap("#grid-type-checker-btn")
    touch_app_page.wait_for_timeout(150)
    assert 'grid' in touch_app_page.evaluate("document.getElementById('source').value")
    assert touch_app_page.locator("#grid-type-checker-btn").evaluate("el => el.classList.contains('active')")
    assert not touch_app_page.locator("#grid-toggle-btn").evaluate(
        "el => el.classList.contains('submenu-open')"
    )


def test_snap_gained_explicit_on_off_buttons_since_its_own_box_click_is_suppressed_on_touch(touch_app_page):
    touch_app_page.click("#menu-tab-view")
    touch_app_page.tap("#snap-toggle-btn")
    touch_app_page.wait_for_timeout(100)
    # Opening the flyout must not itself have enabled snap.
    assert 'settings.snap' not in touch_app_page.evaluate("document.getElementById('source').value").replace(" ", "").replace("\n", "")
    touch_app_page.tap("#snap-on-btn")
    touch_app_page.wait_for_timeout(150)
    assert "snap:" in touch_app_page.evaluate("document.getElementById('source').value")
    assert touch_app_page.locator("#snap-on-btn").evaluate("el => el.classList.contains('active')")

    touch_app_page.tap("#snap-toggle-btn")
    touch_app_page.wait_for_timeout(100)
    touch_app_page.tap("#snap-off-btn")
    touch_app_page.wait_for_timeout(150)
    assert "snap:" not in touch_app_page.evaluate("document.getElementById('source').value")
    assert touch_app_page.locator("#snap-off-btn").evaluate("el => el.classList.contains('active')")


def test_tapping_outside_closes_an_open_flyout(touch_app_page):
    touch_app_page.click("#menu-tab-view")
    touch_app_page.tap("#snap-toggle-btn")
    touch_app_page.wait_for_timeout(100)
    assert touch_app_page.locator("#snap-toggle-btn").evaluate("el => el.classList.contains('submenu-open')")

    touch_app_page.evaluate(
        """() => document.elementFromPoint(10, 10).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"""
    )
    touch_app_page.wait_for_timeout(150)
    assert not touch_app_page.locator("#snap-toggle-btn").evaluate(
        "el => el.classList.contains('submenu-open')"
    )


def test_desktop_hover_and_click_behavior_is_completely_unaffected(app_page):
    app_page.click("#menu-tab-view")
    app_page.click("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    assert app_page.locator("#grid-toggle-btn").evaluate("el => el.classList.contains('active')")

    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    assert app_page.evaluate(
        "getComputedStyle(document.querySelector('#grid-toggle-btn .submenu')).display"
    ) == "block"


# A real, live bug (reported directly: "Untermenü im iphone hinter coder versteckt") that
# every test above completely missed, despite this file already existing to cover exactly
# this mechanism -- `has_touch=True` on a *Chromium* context (every fixture above) still
# reliably synthesizes a `click` from a dispatched tap, but real iOS Safari/WebKit does not
# do this for a plain `<div>` (`.ribbon-btn.has-submenu`, e.g. Export) that has no element-
# level listener of its own, only a delegated one -- confirmed directly, not assumed: the
# exact same `.tap()` call that works above produced zero `click` event at all under real
# WebKit. Chromium's own touch emulation is a synthetic approximation, not a stand-in for
# engine-specific quirks like this one -- these tests run against a real WebKit browser
# instead, the only way this class of bug is actually catchable at all.
@pytest.fixture
def webkit_touch_app_page(playwright):
    browser = playwright.webkit.launch()
    context = browser.new_context(viewport={"width": 390, "height": 750}, has_touch=True, is_mobile=True)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(DOCS_URL)
    page.wait_for_timeout(400)
    yield page
    browser.close()
    assert errors == [], f"unexpected console error(s): {errors}"


def test_webkit_tapping_export_actually_opens_its_flyout(webkit_touch_app_page):
    page = webkit_touch_app_page
    page.tap(".ribbon-btn.has-submenu:has-text('Export')")
    page.wait_for_timeout(200)
    wrapper = page.locator(".ribbon-btn.has-submenu", has_text="Export")
    assert wrapper.evaluate("el => el.classList.contains('submenu-open')")


def test_webkit_tapping_grid_opens_its_flyout_without_also_toggling_it(webkit_touch_app_page):
    page = webkit_touch_app_page
    page.click("#menu-tab-view")
    page.tap("#grid-toggle-btn")
    page.wait_for_timeout(200)
    btn = page.locator("#grid-toggle-btn")
    assert btn.evaluate("el => el.classList.contains('submenu-open')")
    # The regression found live while fixing the above: switching the open mechanism off
    # `click` (unreliable on WebKit for this element) created a second bug -- the wrapper's
    # own separate "plain click toggles on/off" shortcut started firing *too*, from the same
    # tap, since stopPropagation() on one event type never suppresses a different one.
    assert not btn.evaluate("el => el.classList.contains('active')")
