"""Core rendering correctness that isn't specifically about drag/containment/validation --
S-012: a polygon/polyline with a style object present but missing stroke/strokeWidth
previously rendered literal stroke="undefined" stroke-width="NaN" (rect/circle already had
a fallback, polygon/polyline didn't)."""

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
