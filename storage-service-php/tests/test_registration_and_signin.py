import requests


def test_register_then_signin_with_issued_app_password(base_url, register_and_verify):
    creds = register_and_verify()
    res = requests.post(
        f"{base_url}/session.php",
        json={"username": creds["username"], "password": creds["app_password"]},
    )
    assert res.status_code == 200, res.text
    assert "token" in res.json()


def test_verify_link_also_signs_in_directly(base_url, register_and_verify):
    # D-226: clicking the verification link signs the visitor in directly, not just
    # shows them a credential to type in by hand.
    creds = register_and_verify()
    res = requests.get(
        f"{base_url}/plans.php",
        headers={"Authorization": f"Bearer {creds['session_token']}"},
    )
    assert res.status_code == 200, res.text
    assert res.json() == {"plans": []}


def test_wrong_password_is_rejected(base_url, register_and_verify):
    creds = register_and_verify()
    res = requests.post(
        f"{base_url}/session.php",
        json={"username": creds["username"], "password": "definitely-wrong"},
    )
    assert res.status_code == 401


def test_invalid_token_shows_not_valid_page(base_url):
    res = requests.get(f"{base_url}/verify.php", params={"token": "not-a-real-token"})
    assert res.status_code == 200
    assert "This link isn't valid" in res.text


def test_registering_same_email_twice_resends_instead_of_erroring(base_url):
    email = "repeat-register@example.test"
    first = requests.post(f"{base_url}/register.php", json={"email": email})
    assert first.status_code == 201, first.text

    second = requests.post(f"{base_url}/register.php", json={"email": email})
    assert second.status_code == 201, second.text
    assert second.headers["content-type"].startswith("application/json"), second.text


def test_resend_path_survives_a_stale_orphaned_username_row(base_url, db):
    # D-229's exact real incident, reproduced on purpose: a local row already holds the
    # username this email derives to, but under a *different* id than the WordPress
    # account for this email currently has (e.g. the WordPress account was deleted and
    # re-created outside this app entirely, which happened for real during that
    # incident). This DB-level conflict is never actually resolved by register.php
    # itself -- that needs the same manual migration D-229 describes doing live -- so
    # the *correct* fixed behavior is a clean JSON 500, not a success. What D-229 fixed
    # was register.php leaking a raw, unhandled PHP fatal error (full server file paths
    # included) instead of that same clean response every other failure path here
    # already returns -- this asserts the response is well-formed JSON, not that the
    # underlying conflict magically resolves.
    local = "orphan-row-regression"
    email = f"{local}@example.test"
    first = requests.post(f"{base_url}/register.php", json={"email": email})
    assert first.status_code == 201, first.text

    with db.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (local,))
        real_id = cur.fetchone()["id"]
        fake_id = str(int(real_id) + 100_000)
        cur.execute("UPDATE users SET id = %s WHERE id = %s", (fake_id, real_id))

    second = requests.post(f"{base_url}/register.php", json={"email": email})
    assert second.status_code == 500, second.text
    assert second.headers["content-type"].startswith("application/json"), second.text
    assert second.json() == {"error": "Internal error"}
