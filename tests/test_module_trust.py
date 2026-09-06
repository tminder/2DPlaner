"""S-013: isTrustedModule and hasModuleDeclared must agree on whether a path-qualified
specifier (e.g. "modules/grid-module.js") names one of the shipped AUTO_MODULES -- both now
delegate to the same specifierNamesModule() rule. This area (D-045's untrusted-module
confirm() gate) had zero prior test coverage."""

from helpers import load_plan


def test_bare_auto_module_name_is_trusted(app_page):
    assert app_page.evaluate("isTrustedModule('grid-module.js')") is True


def test_path_qualified_auto_module_name_is_now_trusted(app_page):
    assert app_page.evaluate("isTrustedModule('modules/grid-module.js')") is True


def test_unrelated_external_url_is_not_trusted(app_page):
    assert app_page.evaluate("isTrustedModule('https://evil.example.com/x.js')") is False


def test_has_module_declared_accepts_a_path_prefix(app_page):
    assert app_page.evaluate(
        """hasModuleDeclared('module "modules/grid-module.js"\\n', 'grid-module.js')"""
    ) is True


def test_has_module_declared_rejects_a_bare_substring(app_page):
    # Tightened alongside the S-013 fix: a declared "supergrid-module.js" must not count as
    # declaring "grid-module.js" just because the string ends with it.
    assert app_page.evaluate(
        """hasModuleDeclared('module "supergrid-module.js"\\n', 'grid-module.js')"""
    ) is False


def test_a_path_qualified_shipped_module_declaration_never_prompts(app_page):
    dialogs = []
    app_page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    load_plan(
        app_page,
        'module "modules/grid-module.js"\n'
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
