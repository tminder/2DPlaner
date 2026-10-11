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


def clear_rate_limit_bucket(db, prefix):
    """"Clear this bucket, if it's even there yet" -- rate_limits (like every table in
    db.php) is created lazily by the app itself on its first real request, not by any
    setup step here. Whichever test file happens to run first alphabetically may call
    this before the app has ever been hit at all, which a plain DELETE would fail
    against outright (confirmed live: MySQL error 1146, "table doesn't exist") -- there
    being nothing to clear yet is the expected case there, not a real error."""
    try:
        with db.cursor() as cur:
            cur.execute("DELETE FROM rate_limits WHERE bucket_key LIKE %s", (f"{prefix}%",))
    except pymysql.err.ProgrammingError as e:
        if e.args[0] != 1146:
            raise


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

        # register.php's own rate limit (5/hour per IP) is real and worth testing on its
        # own (test_rate_limiting.py does) -- but every test in this suite shares one IP
        # (localhost) and most of them need a fresh account for reasons that have
        # nothing to do with *that* limit, so this fixture clears its own bucket first
        # rather than letting unrelated tests start failing once enough of them have run.
        clear_rate_limit_bucket(db, "register:")
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
