"""D-199: core.registerElementPreset() lets a module add its own entry to the header's
"New Element" flyout -- the exact same shape core.registerHeaderAction() already has for
header buttons (test_header_module_actions.py's own established pattern for exercising core
internals directly via page.evaluate, mirrored here), including auto-removal when the
registering module is deactivated (elementPresetsByModule/currentlyLoadingModule, the same
mechanism headerActionsByModule already uses).

buildElementText(id, indent, unit) returns the new element's full, indent-prefixed source
text; interactivity-module.js's own insertStandardElement calls it in place of
presetElementText for a registered preset, so door-module.js's own standalone door (the
first real module using this) gets the exact same container-placement/indent/undo handling
Line/Rectangle/Circle/Polygon already have.

idBase doubles as the generated element's own id (uniqueId), so every idBase used below is a
plain identifier (no hyphens) -- this language's own tokenizer has no IDENT token that
allows one (TOKEN_RE, docs/index.html), confirmed directly rather than assumed."""

from helpers import load_plan, source_text

PLAN = """
element room {
  shape: "rect"
  size: [5m, 4m]
  position: [0m, 0m]
  style: { fill: "#eee" }
}
"""


def register_test_preset(page, id_base="testpreset", label="Test Preset"):
    return page.evaluate(
        """([idBase, label]) => {
            const reg = window.PlanCore.registerElementPreset({
                idBase, label,
                buildElementText: (id, indent, unit) => `${indent}element ${id} {\\n${indent}  shape: "circle"\\n${indent}  radius: 0.4${unit}\\n${indent}  position: [1${unit}, 1${unit}]\\n${indent}}`,
            });
            return !!reg;
        }""",
        [id_base, label],
    )


def test_registering_a_preset_adds_a_submenu_entry(app_page):
    assert app_page.locator('#new-element-btn button[data-preset="testpreset"]').count() == 0
    register_test_preset(app_page)
    btn = app_page.locator('#new-element-btn button[data-preset="testpreset"]')
    assert btn.count() == 1
    assert btn.inner_text().strip() == "Test Preset"


def test_clicking_a_registered_preset_inserts_its_own_buildelementtext(app_page):
    load_plan(app_page, PLAN)
    register_test_preset(app_page)
    app_page.click("#menu-tab-edit")
    app_page.click("#new-element-btn")
    app_page.wait_for_timeout(100)
    app_page.click('#new-element-btn button[data-preset="testpreset"]')
    app_page.wait_for_timeout(150)

    text = source_text(app_page)
    assert "element testpreset {" in text
    assert 'shape: "circle"' in text
    assert "radius: 0.4m" in text
    # inserted as room's own child, same container-placement logic every built-in preset
    # already uses (F-050) -- not duplicated, reused via the identical insertStandardElement
    # path.
    assert text.index("element room {") < text.index("element testpreset {")


def test_unregister_removes_the_submenu_entry(app_page):
    result = app_page.evaluate(
        """() => {
        const reg = window.PlanCore.registerElementPreset({
            idBase: 'testunreg', label: 'Unreg Me',
            buildElementText: (id, indent, unit) => `${indent}element ${id} { }`,
        });
        reg.unregister();
        return !document.querySelector('#new-element-btn button[data-preset="testunreg"]');
    }"""
    )
    assert result is True


def test_a_duplicate_idbase_warns_and_does_not_add_a_second_entry(app_page):
    messages = []
    app_page.on("console", lambda m: messages.append(m.text) if m.type == "warning" else None)
    register_test_preset(app_page, "testdup", "First")
    register_test_preset(app_page, "testdup", "Second")

    buttons = app_page.locator('#new-element-btn button[data-preset="testdup"]')
    assert buttons.count() == 1
    assert buttons.inner_text().strip() == "First"
    assert any("testdup" in m for m in messages)


def test_colliding_with_a_built_in_preset_warns_and_is_rejected(app_page):
    """Checked against the live DOM, not just the registered-presets map -- the four
    built-in presets (Line/Rectangle/Circle/Polygon) are static HTML core itself owns, with
    no entry in elementPresets at all, so a map-only check would miss this collision."""
    messages = []
    app_page.on("console", lambda m: messages.append(m.text) if m.type == "warning" else None)
    register_test_preset(app_page, "rect", "Not The Real Rectangle")

    buttons = app_page.locator('#new-element-btn button[data-preset="rect"]')
    assert buttons.count() == 1
    assert buttons.inner_text().strip() == "Rectangle"  # the real, original one, untouched
    assert any("rect" in m for m in messages)


def test_deactivating_the_owning_module_removes_its_preset_automatically(app_page):
    """D-199, mirroring D-175's own header-action safety net: a preset registered during a
    module's own load is auto-removed when that module is deactivated, even if the module's
    own cleanup forgets to call the preset's own unregister()."""
    result = app_page.evaluate(
        """() => {
        currentlyLoadingModule = 'test-forgetful-preset-module.js';
        window.PlanCore.registerElementPreset({
            idBase: 'testautoremoved', label: 'Auto Removed',
            buildElementText: (id, indent, unit) => `${indent}element ${id} { }`,
        });
        currentlyLoadingModule = null;
        window.PlanCore.registerModuleCleanup('test-forgetful-preset-module.js', () => {}); // never calls unregister()

        const before = !!document.querySelector('#new-element-btn button[data-preset="testautoremoved"]');
        deactivateRemovedModules([]); // this module is no longer in the required set
        const after = !!document.querySelector('#new-element-btn button[data-preset="testautoremoved"]');
        return { before, after };
    }"""
    )
    assert result["before"] is True
    assert result["after"] is False


def test_a_preset_registered_outside_a_module_load_has_no_auto_owner(app_page):
    result = app_page.evaluate(
        """() => {
        window.PlanCore.registerElementPreset({
            idBase: 'testorphanpreset', label: 'Orphan',
            buildElementText: (id, indent, unit) => `${indent}element ${id} { }`,
        });
        deactivateRemovedModules([]);
        return !!document.querySelector('#new-element-btn button[data-preset="testorphanpreset"]');
    }"""
    )
    assert result is True
