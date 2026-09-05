import pathlib

import pytest

DOCS_INDEX = pathlib.Path(__file__).resolve().parent.parent / "docs" / "index.html"
DOCS_URL = DOCS_INDEX.as_uri()


@pytest.fixture
def app_page(page):
    """A page loaded against the app's own docs/index.html (file:// — no server, no
    build step, matching every ad hoc check this project has ever been verified with).
    Collects real JS exceptions (pageerror) and fails the test if any occurred, since a
    genuine exception is never expected/acceptable regardless of what a test is checking."""
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(DOCS_URL)
    page.wait_for_timeout(400)
    yield page
    assert errors == [], f"unexpected console error(s): {errors}"
