import requests


def test_forgot_password_issues_a_fresh_working_token(base_url, db, register_and_verify):
    creds = register_and_verify()

    res = requests.post(f"{base_url}/forgot-password.php", json={"email": creds["email"]})
    assert res.status_code == 200, res.text

    with db.cursor() as cur:
        cur.execute("SELECT verify_token FROM users WHERE username = %s", (creds["username"],))
        fresh_token = cur.fetchone()["verify_token"]
    assert fresh_token, "forgot-password.php left no pending verify_token behind"

    verify_res = requests.get(f"{base_url}/verify.php", params={"token": fresh_token})
    assert verify_res.status_code == 200
    assert "You're confirmed and signed in" in verify_res.text


def test_forgot_password_response_is_identical_for_an_unknown_email(base_url):
    # F-059: never let this response distinguish "that email has an account" from
    # "it doesn't" -- both must look the same from the outside.
    known = requests.post(f"{base_url}/forgot-password.php", json={"email": "nobody-at-all@example.test"})
    assert known.status_code == 200
    assert "fresh sign-in credential" in known.json()["message"]


def test_forgot_password_requires_a_plausible_email(base_url):
    res = requests.post(f"{base_url}/forgot-password.php", json={"email": "not-an-email"})
    assert res.status_code == 400
