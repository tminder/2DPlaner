"""F-054/D-199: door-module.js (renamed from wall-with-door-module.js) draws the standard
architectural door symbol -- a quarter-circle swing arc from the hinge, not a dashed line
-- via a new `doorSwing` shape kind, shared by both the `wallWithDoor` composite's own door
segment and a new standalone, freely placeable door element (`shape: "doorSwing"` directly,
no composition needed). The standalone door is registered into the header's own "New
Element" flyout via the new core.registerElementPreset (see test_element_presets.py)."""

import re

from helpers import drag, element_center, load_plan, source_text

WALL_WITH_DOOR_BODY = (
    'element w {\n'
    '  compose: "wallWithDoor"\n'
    '  from: [0m,0m]\n'
    '  to: [5m,0m]\n'
    '  doorAt: 2m\n'
    '  doorWidth: 0.9m\n'
    '}'
)


def test_the_composite_door_segment_renders_as_a_doorswing_path_not_a_polyline(app_page):
    load_plan(app_page, 'module "door-module.js"\n\n' + WALL_WITH_DOOR_BODY, declare_core_modules=False)
    el = app_page.locator('[data-id="w_door"]')
    assert el.count() == 1
    assert el.evaluate("el => el.tagName.toLowerCase()") == "path"
    d = el.get_attribute("d")
    assert d.startswith("M ") and " A " in d  # a line to the open position, then an arc back


def test_dragging_the_composite_door_still_slides_it_along_the_wall(app_page):
    """composeDragEdits (interactivity-module.js) matches this child by its own "_door" id
    suffix, unchanged by the rename -- only what the segment renders as changed."""
    load_plan(app_page, 'module "door-module.js"\n\n' + WALL_WITH_DOOR_BODY)
    before = source_text(app_page)

    box = app_page.evaluate(
        """() => {
            const el = document.querySelector('[data-id="w_door"]');
            const len = el.getTotalLength();
            const p = el.getPointAtLength(len * 0.1);
            const ctm = el.ownerSVGElement.getScreenCTM();
            const sp = el.ownerSVGElement.createSVGPoint();
            sp.x = p.x; sp.y = p.y;
            const screenPt = sp.matrixTransform(ctm);
            return [screenPt.x, screenPt.y];
        }"""
    )
    cx, cy = box
    app_page.mouse.move(cx, cy)
    app_page.mouse.down()
    app_page.wait_for_timeout(30)
    app_page.mouse.move(cx + 30, cy, steps=5)
    app_page.wait_for_timeout(30)
    app_page.mouse.up()
    app_page.wait_for_timeout(150)

    after = source_text(app_page)
    assert after != before
    m = re.search(r"doorAt:\s*([\d.]+)m", after)
    assert m and float(m.group(1)) != 2.0  # slid away from its original 2m


def test_a_standalone_door_needs_no_compose_at_all(app_page):
    PLAN = (
        'module "door-module.js"\n\n'
        'element d1 {\n'
        '  shape: "doorSwing"\n'
        '  position: [2m, 3m]\n'
        '  width: 0.9m\n'
        '  rotation: 0\n'
        '  swing: "left"\n'
        '}'
    )
    load_plan(app_page, PLAN, declare_core_modules=False)
    el = app_page.locator('[data-id="d1"]')
    assert el.count() == 1
    assert el.evaluate("el => el.tagName.toLowerCase()") == "path"
    violations = app_page.evaluate(
        "() => Array.from(document.querySelectorAll('#interactivity-validation-panel li')).map(li => li.textContent)"
    )
    assert violations == []  # a custom-shape node with its own custom properties, no warnings


def test_standalone_door_drags_through_the_generic_position_path(app_page):
    """Unlike the composite's own synthesized _door child, a standalone door's position is
    a real, author-editable literal -- no composeDragEdits entry needed for it at all."""
    PLAN = (
        'module "door-module.js"\n\n'
        'element d1 { shape: "doorSwing" position: [2m, 3m] width: 0.9m rotation: 0 swing: "left" }'
    )
    load_plan(app_page, PLAN)
    before = source_text(app_page)

    pt = app_page.evaluate(
        """() => {
            const el = document.querySelector('[data-id="d1"]');
            const len = el.getTotalLength();
            const p = el.getPointAtLength(len * 0.15);
            const ctm = el.ownerSVGElement.getScreenCTM();
            const sp = el.ownerSVGElement.createSVGPoint();
            sp.x = p.x; sp.y = p.y;
            const screenPt = sp.matrixTransform(ctm);
            return [screenPt.x, screenPt.y];
        }"""
    )
    cx, cy = pt
    app_page.mouse.move(cx, cy)
    app_page.mouse.down()
    app_page.wait_for_timeout(30)
    app_page.mouse.move(cx + 40, cy + 30, steps=5)
    app_page.wait_for_timeout(30)
    app_page.mouse.up()
    app_page.wait_for_timeout(150)

    after = source_text(app_page)
    assert after != before
    assert "position: [2m, 3m]" not in after


def test_new_element_menu_offers_door_once_the_module_is_declared(app_page):
    load_plan(app_page, 'module "door-module.js"\n\nelement room { shape: "rect" size: [1m,1m] position: [0m,0m] }')
    app_page.click("#menu-tab-edit")
    presets = app_page.evaluate(
        "Array.from(document.querySelectorAll('#new-element-btn .submenu button')).map(b => b.dataset.preset)"
    )
    assert "door" in presets


def test_new_element_menu_has_no_door_entry_without_the_declaration(app_page):
    load_plan(app_page, 'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }')
    app_page.click("#menu-tab-edit")
    presets = app_page.evaluate(
        "Array.from(document.querySelectorAll('#new-element-btn .submenu button')).map(b => b.dataset.preset)"
    )
    assert "door" not in presets


def test_clicking_the_door_preset_inserts_a_working_standalone_door(app_page):
    load_plan(app_page, 'module "door-module.js"\n\nelement room { shape: "rect" size: [3m,3m] position: [0m,0m] }')
    app_page.click("#menu-tab-edit")
    app_page.click("#new-element-btn")
    app_page.wait_for_timeout(100)
    app_page.click('#new-element-btn button[data-preset="door"]')
    app_page.wait_for_timeout(150)

    text = source_text(app_page)
    assert 'shape: "doorSwing"' in text
    assert app_page.locator('[data-id="door"]').count() == 1


def test_removing_the_module_declaration_removes_the_door_preset_and_shape_renderer(app_page):
    load_plan(app_page, 'module "door-module.js"\n\nelement room { shape: "rect" size: [1m,1m] position: [0m,0m] }')
    app_page.click("#menu-tab-edit")
    assert "door" in app_page.evaluate(
        "Array.from(document.querySelectorAll('#new-element-btn .submenu button')).map(b => b.dataset.preset)"
    )

    load_plan(app_page, 'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }')
    app_page.click("#menu-tab-edit")
    assert "door" not in app_page.evaluate(
        "Array.from(document.querySelectorAll('#new-element-btn .submenu button')).map(b => b.dataset.preset)"
    )
    assert app_page.evaluate("typeof window.PlanModules?.doorSwing") == "undefined"
