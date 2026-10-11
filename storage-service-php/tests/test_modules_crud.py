import requests


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_modules_requires_a_session_token(base_url):
    res = requests.get(f"{base_url}/modules.php")
    assert res.status_code == 401


def test_modules_full_lifecycle_and_public_code_serving(base_url, register_and_verify):
    token = register_and_verify()["session_token"]
    headers = auth_headers(token)

    created = requests.post(
        f"{base_url}/modules.php",
        json={"name": "Test module", "code": "console.log('hi');", "visibility": "private"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    module_id = created.json()["id"]

    # module-code.php has no auth at all, by design (a <script src> load can't carry a
    # bearer header) -- the id itself is the only gate.
    served = requests.get(f"{base_url}/module-code.php", params={"id": module_id})
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("application/javascript")
    assert served.text == "console.log('hi');"

    updated = requests.put(
        f"{base_url}/modules.php?id={module_id}",
        json={"code": "console.log('bye');"},
        headers=headers,
    )
    assert updated.status_code == 200
    served_again = requests.get(f"{base_url}/module-code.php", params={"id": module_id})
    assert served_again.text == "console.log('bye');"

    deleted = requests.delete(f"{base_url}/modules.php?id={module_id}", headers=headers)
    assert deleted.status_code == 204

    gone = requests.get(f"{base_url}/module-code.php", params={"id": module_id})
    assert gone.status_code == 404


def test_one_users_module_is_invisible_to_another(base_url, register_and_verify):
    owner_token = register_and_verify()["session_token"]
    other_token = register_and_verify()["session_token"]

    created = requests.post(
        f"{base_url}/modules.php",
        json={"name": "Private", "code": "1;", "visibility": "private"},
        headers=auth_headers(owner_token),
    )
    module_id = created.json()["id"]

    res = requests.get(f"{base_url}/modules.php?id={module_id}", headers=auth_headers(other_token))
    assert res.status_code == 404

    # module-code.php's own "private" is a label only, not enforced (F-056's own
    # documented scope) -- the raw code is still served to anyone with the id, by design.
    served = requests.get(f"{base_url}/module-code.php", params={"id": module_id})
    assert served.status_code == 200


def test_invalid_visibility_is_rejected(base_url, register_and_verify):
    token = register_and_verify()["session_token"]
    res = requests.post(
        f"{base_url}/modules.php",
        json={"name": "x", "code": "1;", "visibility": "public-ish"},
        headers=auth_headers(token),
    )
    assert res.status_code == 400
