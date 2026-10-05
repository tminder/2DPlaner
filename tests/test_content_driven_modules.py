"""D-173: grid-module.js/annotations-module.js/wall-with-door-module.js are no longer
force-loaded into every plan (AUTO_MODULES) or explicit-declaration-only -- they load only
when the plan's own parsed content actually uses what they render (detectNeededModules in
docs/index.html), closing S-025 (the grid/wall-with-door inconsistency) and shrinking what a
plan that touches none of these pays for. interactivity-module.js/code-highlight-module.js
stay unconditional (the hosted editor itself, D-034)."""

from helpers import load_plan


def test_a_bare_plan_loads_neither_grid_nor_annotations(app_page):
    load_plan(app_page, 'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }')
    assert app_page.locator(".plan-grid-bg").count() == 0
    assert app_page.locator(".annotation").count() == 0


def test_settings_grid_loads_grid_module(app_page):
    load_plan(
        app_page,
        'settings {\n  grid: { size: 1 }\n}\n\n'
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }',
    )
    assert app_page.locator(".plan-grid-bg").count() == 1


def test_grid_layer_none_still_skips_the_module_since_it_would_render_nothing(app_page):
    load_plan(
        app_page,
        'settings {\n  grid: { size: 1, layer: "none" }\n}\n\n'
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }',
    )
    assert app_page.locator(".plan-grid-bg").count() == 0
    assert app_page.evaluate("loadedExternal.has('grid-module.js')") is False


WALL_WITH_DOOR_PLAN = (
    'element w {\n'
    '  compose: "wallWithDoor"\n'
    '  from: [0m,0m]\n'
    '  to: [5m,0m]\n'
    '  doorAt: 2m\n'
    '  doorWidth: 0.9m\n'
    '}'
)


def test_a_label_property_loads_annotations_module(app_page):
    # annotationMarkupForNode (docs/annotations-module.js) only renders for a shape that also
    # carries a style -- a bare/no-style element never gets an annotation regardless of label,
    # same as today; `style` here is just what's needed to observe the label, not part of what
    # detectNeededModules itself checks.
    load_plan(
        app_page,
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] style: { fill: "#eee" } label: "Room" }',
    )
    assert app_page.locator(".annotation").count() == 1
    assert app_page.locator(".annotation").text_content() == "Room"


def test_compose_wall_with_door_auto_loads_without_an_explicit_module_declaration(app_page):
    load_plan(app_page, WALL_WITH_DOOR_PLAN)
    assert app_page.locator('[data-id="w_wall_a"]').count() == 1
    assert app_page.locator('[data-id="w_door"]').count() == 1
    assert app_page.locator('[data-id="w_wall_b"]').count() == 1


def test_wall_with_door_module_is_trusted_and_never_prompts(app_page):
    assert app_page.evaluate("isTrustedModule('wall-with-door-module.js')") is True
    dialogs = []
    app_page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    load_plan(app_page, WALL_WITH_DOOR_PLAN)
    assert dialogs == []


def test_settings_show_connections_loads_annotations_even_with_no_label_or_dimensions(app_page):
    # Found live while building this: annotations-module.js also renders .connection-line
    # (D-103's showConnections flag), independent of any element's own label/dimensions/
    # edgeLengths -- a predicate checking only the per-element properties would silently drop
    # connection lines for exactly this plan.
    load_plan(
        app_page,
        'settings {\n  showConnections: true\n}\n\n'
        'element room {\n'
        '  shape: "rect"\n'
        '  size: [4m, 3m]\n'
        '  position: [0m, 0m]\n'
        '  style: { fill: "#eee" }\n'
        '\n'
        '  element switch {\n'
        '    position: [0.3m, 0.3m]\n'
        '  }\n'
        '  element lamp {\n'
        '    shape: "rect"\n'
        '    size: [1m, 1m]\n'
        '    position: [2.5m, 1m]\n'
        '    style: { fill: "#fc6" }\n'
        '  }\n'
        '}\n'
        'connection switch lamp',
    )
    assert app_page.locator("svg .connection-line").count() == 1


def test_grid_loads_and_unloads_as_settings_are_added_then_removed(app_page):
    load_plan(app_page, 'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }')
    assert app_page.locator(".plan-grid-bg").count() == 0

    load_plan(
        app_page,
        'settings {\n  grid: { size: 1 }\n}\n\n'
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }',
    )
    assert app_page.locator(".plan-grid-bg").count() == 1

    load_plan(app_page, 'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }')
    assert app_page.locator(".plan-grid-bg").count() == 0
