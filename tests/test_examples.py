"""Every shipped example must load cleanly: render something, trigger zero validation
violations, and produce zero console errors (checked automatically by the app_page
fixture)."""

import pytest

from helpers import select_example, validation_violations

EXAMPLES = ["blank", "apartment", "utility"]


@pytest.mark.parametrize("name", EXAMPLES)
def test_example_loads_and_renders(app_page, name):
    select_example(app_page, name)
    shape_count = app_page.evaluate(
        "document.querySelectorAll('#plan-root svg [data-id]').length"
    )
    assert shape_count > 0, f"{name}: nothing rendered"


@pytest.mark.parametrize("name", EXAMPLES)
def test_example_has_no_validation_violations(app_page, name):
    select_example(app_page, name)
    violations = validation_violations(app_page)
    assert violations == [], f"{name}: unexpected violation(s): {violations}"
