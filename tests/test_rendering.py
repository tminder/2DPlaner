"""Core rendering correctness that isn't specifically about drag/containment/validation --
S-012: a polygon/polyline with a style object present but missing stroke/strokeWidth
previously rendered literal stroke="undefined" stroke-width="NaN" (rect/circle already had
a fallback, polygon/polyline didn't).

S-017: an unresolvable style preset used to just console.warn and silently render with no
style at all -- now throws and surfaces in the visible #error banner, matching every other
bad-input case on this same render path (an unknown points reference, an unknown module)."""

from helpers import load_plan


def test_polygon_style_falls_back_like_rect_and_circle(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "polygon"
  points: [[0m, 0m], [3m, 0m], [1.5m, 2m]]
  position: [0m, 0m]
  style: {}
}
""",
    )
    el = app_page.locator('[data-id="room"]')
    assert el.get_attribute("stroke") == "none"
    assert el.get_attribute("stroke-width") != "NaN"
    assert float(el.get_attribute("stroke-width")) > 0


def test_polyline_style_falls_back_like_rect_and_circle(app_page):
    load_plan(
        app_page,
        """
element wall {
  shape: "polyline"
  points: [[0m, 0m], [3m, 0m]]
  position: [0m, 0m]
  style: {}
}
""",
    )
    el = app_page.locator('[data-id="wall"]')
    assert el.get_attribute("stroke") == "none"
    assert el.get_attribute("stroke-width") != "NaN"
    assert float(el.get_attribute("stroke-width")) > 0


def test_unresolvable_style_preset_throws_and_shows_the_error_banner(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [2m, 2m]
  position: [0m, 0m]
  style: "ghost"
}
""",
    )
    error = app_page.evaluate("document.getElementById('error').textContent")
    assert 'style: "ghost" isn\'t defined in settings.styles' in error
