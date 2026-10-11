import base64
import json

import requests


def decode_session_payload(token):
    # Mirrors account/index.html's/docs/index.html's own decodeSessionPayload exactly --
    # the token's body is base64url(JSON), signed but not encrypted, deliberately
    # client-readable so the frontend can show "Signed in as X" without a round trip.
    body = token.split(".")[0]
    padded = body + "=" * (-len(body) % 4)
    return json.loads(base64.urlsafe_b64decode(padded))


def test_display_name_defaults_to_username(register_and_verify):
    creds = register_and_verify()
    payload = decode_session_payload(creds["session_token"])
    assert payload["name"] == creds["username"]


def test_changing_display_name(base_url, register_and_verify):
    creds = register_and_verify()
    headers = {"Authorization": f"Bearer {creds['session_token']}"}

    res = requests.put(f"{base_url}/account.php", json={"name": "New Display Name"}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["name"] == "New Display Name"

    # D-225: the change is WordPress's own, read fresh on the *next* login -- not
    # reflected in the already-issued token, which only ever carries what was true when
    # it was signed.
    resigned = requests.post(
        f"{base_url}/session.php",
        json={"username": creds["username"], "password": creds["app_password"]},
    )
    assert resigned.status_code == 200
    new_payload = decode_session_payload(resigned.json()["token"])
    assert new_payload["name"] == "New Display Name"


def test_account_requires_a_session_token(base_url):
    res = requests.put(f"{base_url}/account.php", json={"name": "x"})
    assert res.status_code == 401


def test_empty_name_is_rejected(base_url, register_and_verify):
    token = register_and_verify()["session_token"]
    res = requests.put(
        f"{base_url}/account.php",
        json={"name": "  "},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 400
