"""D-175: a module loads if and only if the plan's own text literally declares
`module "<name>"` -- reverses D-173's content-triggered detection (inferring "needed" from
properties like label/settings.grid/compose with no declaration line in sight), once that
turned out to be exactly what "a module loaded that doesn't appear in the code" meant from
the plan author's own point of view. grid/annotations/wall-with-door need an explicit
declaration, with no exceptions between them -- and (D-195) neither do
interactivity/code-highlight/hierarchy anymore, closing the one remaining force-injected
exception D-174 had carved out for them.

Every case below uses `load_plan(..., declare_core_modules=False)` specifically so these
three don't get silently declared out from under the test it's trying to run."""

from helpers import load_plan, source_text


def test_a_bare_plan_loads_neither_grid_nor_annotations(app_page):
    load_plan(app_page, 'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }', declare_core_modules=False)
    assert app_page.locator(".plan-grid-bg").count() == 0
    assert app_page.locator(".annotation").count() == 0


def test_settings_grid_alone_without_a_declaration_stays_silently_inert(app_page):
    load_plan(
        app_page,
        'settings {\n  grid: { size: 1 }\n}\n\n'
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }',
        declare_core_modules=False,
    )
    assert app_page.evaluate("loadedExternal.has('grid-module.js')") is False
    assert app_page.locator(".plan-grid-bg").count() == 0


def test_declaring_grid_module_alongside_settings_grid_renders_it(app_page):
    load_plan(
        app_page,
        'module "grid-module.js"\n\n'
        'settings {\n  grid: { size: 1 }\n}\n\n'
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }',
        declare_core_modules=False,
    )
    assert app_page.locator(".plan-grid-bg").count() == 1


def test_a_label_property_alone_without_a_declaration_stays_silently_inert(app_page):
    load_plan(
        app_page,
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] style: { fill: "#eee" } label: "Room" }',
        declare_core_modules=False,
    )
    assert app_page.evaluate("loadedExternal.has('annotations-module.js')") is False
    assert app_page.locator(".annotation").count() == 0


def test_declaring_annotations_module_alongside_label_renders_it(app_page):
    load_plan(
        app_page,
        'module "annotations-module.js"\n\n'
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] style: { fill: "#eee" } label: "Room" }',
        declare_core_modules=False,
    )
    assert app_page.locator(".annotation").count() == 1
    assert app_page.locator(".annotation").text_content() == "Room"


WALL_WITH_DOOR_BODY = (
    'element w {\n'
    '  compose: "wallWithDoor"\n'
    '  from: [0m,0m]\n'
    '  to: [5m,0m]\n'
    '  doorAt: 2m\n'
    '  doorWidth: 0.9m\n'
    '}'
)


def test_compose_wall_with_door_alone_without_a_declaration_stays_silently_inert(app_page):
    load_plan(app_page, WALL_WITH_DOOR_BODY, declare_core_modules=False)
    assert app_page.evaluate("loadedExternal.has('door-module.js')") is False
    assert app_page.locator('[data-id="w_wall_a"]').count() == 0


def test_declaring_wall_with_door_module_expands_the_composite(app_page):
    load_plan(app_page, 'module "door-module.js"\n\n' + WALL_WITH_DOOR_BODY, declare_core_modules=False)
    assert app_page.locator('[data-id="w_wall_a"]').count() == 1
    assert app_page.locator('[data-id="w_door"]').count() == 1
    assert app_page.locator('[data-id="w_wall_b"]').count() == 1


def test_a_synthesized_segment_id_colliding_with_a_real_sibling_is_disambiguated(app_page):
    # S-027: `w_wall_a` is also declared as a real sibling here -- the synthesized segment
    # must not silently collide with it (corrupting nodesById's own last-writer-wins
    # lookup), and the real sibling must still render under its own, untouched id.
    load_plan(
        app_page,
        'module "door-module.js"\n\n'
        'element root {\n' + WALL_WITH_DOOR_BODY + '\n'
        '  element w_wall_a {\n'
        '    shape: "circle"\n'
        '    radius: 0.1m\n'
        '    position: [3m,3m]\n'
        '    style: { fill: "lime" }\n'
        '  }\n'
        '}',
        declare_core_modules=False,
    )
    assert app_page.locator('circle[data-id="w_wall_a"]').count() == 1  # the real sibling, untouched
    assert app_page.locator('polyline[data-id="w_wall_a2"]').count() == 1  # the segment, disambiguated


def test_wall_with_door_module_is_trusted_and_never_prompts(app_page):
    assert app_page.evaluate("isTrustedModule('door-module.js')") is True
    dialogs = []
    app_page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    load_plan(app_page, 'module "door-module.js"\n\n' + WALL_WITH_DOOR_BODY, declare_core_modules=False)
    assert dialogs == []


def test_removing_the_declaration_unloads_the_module_again(app_page):
    declared = (
        'module "grid-module.js"\n\n'
        'settings {\n  grid: { size: 1 }\n}\n\n'
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }'
    )
    load_plan(app_page, declared, declare_core_modules=False)
    assert app_page.locator(".plan-grid-bg").count() == 1

    load_plan(app_page, 'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }', declare_core_modules=False)
    assert app_page.evaluate("loadedExternal.has('grid-module.js')") is False
    assert app_page.locator(".plan-grid-bg").count() == 0


def test_formerly_core_modules_stay_inert_with_no_declaration_at_all(app_page):
    """D-195: interactivity/code-highlight/hierarchy no longer get force-injected -- a plan
    declaring none of the three gets none of the three, the same silently-inert rule every
    other module already followed."""
    load_plan(app_page, 'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }', declare_core_modules=False)
    loaded = app_page.evaluate("Array.from(loadedExternal)")
    assert "interactivity-module.js" not in loaded
    assert "code-highlight-module.js" not in loaded
    assert "hierarchy-module.js" not in loaded


def test_formerly_core_modules_load_once_declared(app_page):
    load_plan(
        app_page,
        'module "interactivity-module.js"\nmodule "code-highlight-module.js"\nmodule "hierarchy-module.js"\n\n'
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }',
        declare_core_modules=False,
    )
    loaded = app_page.evaluate("Array.from(loadedExternal)")
    assert "interactivity-module.js" in loaded
    assert "code-highlight-module.js" in loaded
    assert "hierarchy-module.js" in loaded


def test_grid_toggle_button_declares_the_module_itself_not_just_the_setting(app_page):
    """The header's own Grid toggle writes `settings.grid` -- under D-175 it has to also
    ensure `module "grid-module.js"` is declared, or it would write an inert flag."""
    load_plan(app_page, 'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }', declare_core_modules=False)
    app_page.click("#menu-tab-view")
    app_page.click("#grid-toggle-btn")
    app_page.wait_for_timeout(150)
    text = source_text(app_page)
    assert 'module "grid-module.js"' in text
    assert "grid:" in text
    assert app_page.locator(".plan-grid-bg").count() == 1
