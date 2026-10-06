"""D-177 (F-058): settings.units ("m", the default/absent case, or "none") controls only
whether a brand-new literal the app itself synthesizes gets written with an explicit "m"
suffix or bare -- a pure notation choice, never a unit conversion. Every number is always
meters internally regardless (D-005 unchanged); editing an existing literal always keeps
whatever unit it already had, this setting only affects what a *fresh* literal looks like
(a new preset element, a grid/snap size field, a reparent that needs a synthesized
position)."""

import re

from helpers import drag, element_center, load_plan, source_text

PLAN_NONE = """
module "grid-module.js"

settings {
  units: "none"
}

element room {
  shape: "rect"
  size: [5, 4]
  position: [0, 0]
  style: { fill: "#eee" }
}
"""

PLAN_DEFAULT = """
element room {
  shape: "rect"
  size: [5m, 4m]
  position: [0m, 0m]
  style: { fill: "#eee" }
}
"""


def open_new_element_flyout(page):
    page.click("#menu-tab-edit")
    page.hover("#new-element-btn")
    page.wait_for_timeout(150)


def pick_preset(page, preset_id):
    page.click(f'#new-element-btn button[data-preset="{preset_id}"]')
    page.wait_for_timeout(150)


def test_default_units_m_keeps_new_preset_elements_suffixed(app_page):
    load_plan(app_page, PLAN_DEFAULT)
    open_new_element_flyout(app_page)
    pick_preset(app_page, "rect")
    text = source_text(app_page)
    assert "size: [1m, 1m]" in text
    assert "position: [0.3m, 0.3m]" in text


def test_units_none_writes_new_preset_elements_bare(app_page):
    load_plan(app_page, PLAN_NONE)
    open_new_element_flyout(app_page)
    pick_preset(app_page, "rect")
    text = source_text(app_page)
    assert "size: [1, 1]" in text
    assert "position: [0.3, 0.3]" in text
    assert "1m" not in text and "0.3m" not in text


def test_units_none_writes_grid_size_input_bare(app_page):
    load_plan(app_page, PLAN_NONE)
    app_page.click("#menu-tab-view")
    app_page.click("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    app_page.hover("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    app_page.fill("#grid-size-input", "0.5")
    app_page.locator("#grid-size-input").press("Enter")
    app_page.wait_for_timeout(150)
    text = source_text(app_page)
    assert "size: 0.5" in text
    assert "size: 0.5m" not in text


def test_an_existing_bare_literal_is_not_rewritten_with_a_suffix_on_drag(app_page):
    """A literal that was already written without a unit keeps that shape when edited --
    settings.units only governs brand-new literals, never retroactively reformats an
    existing one."""
    from helpers import drag, element_center

    load_plan(app_page, PLAN_NONE)
    x, y = element_center(app_page, "room")
    drag(app_page, x, y, x + 30, y + 20)
    text = source_text(app_page)
    assert "position: [0, 0]" not in text  # it did move...
    m = re.search(r"position: \[(-?[\d.]+), (-?[\d.]+)\]", text)
    assert m, text  # ...but still bare, no "m" suffix introduced
