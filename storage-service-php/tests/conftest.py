import os
import re
import secrets
from urllib.parse import urlparse, parse_qs

import pymysql
import pytest
import requests

# F-057: real integration tests against the actual PHP endpoints and a real MySQL/
# WordPress stack -- CI-only, see .github/workflows/backend-tests.yml for how that stack
# gets stood up. These never run against a dev machine (no local PHP/MySQL/WordPress
# exists in this project at all), only here, with the base URL and DB credentials coming
# from environment variables the workflow sets.

BASE_URL = os.environ.get("STORAGE_BASE_URL", "http://127.0.0.1:8080")


@pytest.fixture
def base_url():
    return BASE_URL


@pytest.fixture
def db():
    conn = pymysql.connect(
        host=os.environ.get("TEST_DB_HOST", "127.0.0.1"),
        user=os.environ.get("TEST_DB_USER", "root"),
        password=os.environ.get("TEST_DB_PASSWORD", "root"),
        database=os.environ.get("TEST_DB_NAME", "planagoniadb"),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )
    yield conn
    conn.close()


@pytest.fixture
def register_and_verify(db):
    """Registers a brand-new account and walks it through the exact same verification
    step a real click on the emailed link would -- there's no real mail transport in
    this CI environment, so the one substitution for "read the email" is reading the
    pending verify_token straight out of the database, by the username the registration
    itself must have produced (users has no email column at all, by design -- see
    db.php). Everything after that (the actual GET to verify.php, parsing its real HTML
    response for the issued credentials and the session-carrying link) is the real flow,
    unmodified, not a shortcut around it."""

    def _do(email=None, local=None):
        local = local or f"user{secrets.token_hex(8)}"
        email = email or f"{local}@example.test"

        res = requests.post(f"{BASE_URL}/register.php", json={"email": email})
        assert res.status_code == 201, res.text

        with db.cursor() as cur:
            cur.execute("SELECT verify_token FROM users WHERE username = %s", (local,))
            row = cur.fetchone()
        assert row and row["verify_token"], f"no pending verify_token for username {local!r}"

        verify_res = requests.get(f"{BASE_URL}/verify.php", params={"token": row["verify_token"]})
        assert verify_res.status_code == 200, verify_res.text
        html = verify_res.text

        username_m = re.search(r"<dt>Username</dt>\s*<dd>([^<]+)</dd>", html)
        password_m = re.search(r"<dt>Password</dt>\s*<dd>([^<]+)</dd>", html)
        link_m = re.search(r'href="([^"]+)">Continue to Account', html)
        assert username_m and password_m and link_m, html

        session_token = parse_qs(urlparse(link_m.group(1)).query).get("session", [None])[0]
        assert session_token, "verify.php's own link carried no ?session= token"

        return {
            "email": email,
            "username": username_m.group(1),
            "app_password": password_m.group(1),
            "session_token": session_token,
        }

    return _do
