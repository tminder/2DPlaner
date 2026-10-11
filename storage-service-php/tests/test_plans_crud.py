import requests


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_plans_requires_a_session_token(base_url):
    res = requests.get(f"{base_url}/plans.php")
    assert res.status_code == 401


def test_plans_full_lifecycle(base_url, register_and_verify):
    token = register_and_verify()["session_token"]
    headers = auth_headers(token)

    created = requests.post(
        f"{base_url}/plans.php",
        json={"name": "Test plan", "text": "rect { }"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    plan_id = created.json()["id"]

    listed = requests.get(f"{base_url}/plans.php", headers=headers)
    assert listed.status_code == 200
    assert any(p["id"] == plan_id for p in listed.json()["plans"])

    fetched = requests.get(f"{base_url}/plans.php?id={plan_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["text"] == "rect { }"

    updated = requests.put(
        f"{base_url}/plans.php?id={plan_id}",
        json={"name": "Renamed", "text": "rect { width: 2 }"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["text"] == "rect { width: 2 }"

    deleted = requests.delete(f"{base_url}/plans.php?id={plan_id}", headers=headers)
    assert deleted.status_code == 204

    gone = requests.get(f"{base_url}/plans.php?id={plan_id}", headers=headers)
    assert gone.status_code == 404


def test_one_users_plan_is_invisible_to_another(base_url, register_and_verify):
    owner_token = register_and_verify()["session_token"]
    other_token = register_and_verify()["session_token"]

    created = requests.post(
        f"{base_url}/plans.php",
        json={"name": "Private", "text": "rect { }"},
        headers=auth_headers(owner_token),
    )
    plan_id = created.json()["id"]

    res = requests.get(f"{base_url}/plans.php?id={plan_id}", headers=auth_headers(other_token))
    assert res.status_code == 404
