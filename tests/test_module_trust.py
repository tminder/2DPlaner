"""S-013: isTrustedModule must recognize a path-qualified specifier (e.g.
"modules/grid-module.js") as naming one of the shipped TRUSTED_MODULES via
specifierNamesModule(). This area (D-045's untrusted-module confirm() gate) had zero prior
test coverage.

D-126: hierarchy-module.js is trusted (TRUSTED_MODULES) despite no longer being force-
loaded on every render (AUTO_MODULES) -- it's loaded on demand instead, but must still
never trigger the confirm() dialog, whether loaded by an explicit declaration or by
clicking the Layers button."""

from helpers import load_plan


def test_bare_auto_module_name_is_trusted(app_page):
    assert app_page.evaluate("isTrustedModule('grid-module.js')") is True


def test_path_qualified_auto_module_name_is_now_trusted(app_page):
    assert app_page.evaluate("isTrustedModule('modules/grid-module.js')") is True


def test_hierarchy_module_is_trusted_despite_not_being_auto_loaded(app_page):
    assert app_page.evaluate("isTrustedModule('hierarchy-module.js')") is True


def test_unrelated_external_url_is_not_trusted(app_page):
    assert app_page.evaluate("isTrustedModule('https://evil.example.com/x.js')") is False


def test_a_path_qualified_shipped_module_declaration_never_prompts(app_page):
    dialogs = []
    app_page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    load_plan(
        app_page,
        'module "modules/grid-module.js"\n'
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }',
    )
    assert dialogs == []


def test_an_explicit_hierarchy_module_declaration_never_prompts(app_page):
    dialogs = []
    app_page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    load_plan(
        app_page,
        'module "hierarchy-module.js"\n'
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }',
    )
    assert dialogs == []


def test_a_genuinely_untrusted_external_module_still_prompts(app_page):
    dialogs = []
    app_page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    load_plan(
        app_page,
        'module "https://example.invalid/mod.js"\n'
        'element room { shape: "rect" size: [1m,1m] position: [0m,0m] }',
    )
    assert len(dialogs) == 1
    assert "https://example.invalid/mod.js" in dialogs[0]
