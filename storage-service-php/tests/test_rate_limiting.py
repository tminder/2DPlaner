import requests


def clear_session_rate_limit_bucket(db):
    # These tests deliberately trip session.php's own per-IP bucket (10/15min) --
    # tripping it is the whole point -- but every test in this suite shares one real IP
    # (localhost), so leaving it tripped would starve every *other* test's own
    # session.php calls for the rest of the 15-minute window. Cleans up the shared state
    # it polluted rather than relying on file/test ordering to dodge the problem.
    with db.cursor() as cur:
        cur.execute("DELETE FROM rate_limits WHERE bucket_key LIKE 'session:%'")


def test_session_endpoint_rate_limits_repeated_attempts(base_url, db, register_and_verify):
    # session.php: 10 attempts / 15 min per IP (rate_limit.php). Doesn't assume a clean
    # budget going in -- other tests in this same run may have already used some of it,
    # since they share the one per-IP bucket -- so this fires enough attempts to
    # guarantee tripping the limit regardless of what ran before it, rather than
    # asserting an exact request count, and checks for the presence of both outcomes
    # rather than a strict order.
    creds = register_and_verify()

    statuses = []
    try:
        for _ in range(15):
            res = requests.post(
                f"{base_url}/session.php",
                json={"username": creds["username"], "password": "wrong-on-purpose"},
            )
            statuses.append(res.status_code)
            if res.status_code == 429:
                break
    finally:
        clear_session_rate_limit_bucket(db)

    assert 429 in statuses, f"never got rate-limited across 15 attempts: {statuses}"
    assert 401 in statuses, f"the real credential check never ran at all: {statuses}"


def test_rate_limited_response_carries_retry_after(base_url, db, register_and_verify):
    creds = register_and_verify()
    try:
        for _ in range(15):
            res = requests.post(
                f"{base_url}/session.php",
                json={"username": creds["username"], "password": "wrong-on-purpose"},
            )
            if res.status_code == 429:
                assert "Retry-After" in res.headers
                return
        assert False, "never got rate-limited across 15 attempts"
    finally:
        clear_session_rate_limit_bucket(db)


def test_register_endpoint_rate_limits_repeated_attempts(base_url, db):
    # register.php: 5 attempts / hour per IP -- a much tighter budget than session.php's
    # own, which is exactly why register_and_verify (conftest.py) clears this same
    # bucket before every call: almost every other test in this suite registers a fresh
    # account for reasons that have nothing to do with *this* limit. This is the one
    # test that's actually supposed to trip it.
    with db.cursor() as cur:
        cur.execute("DELETE FROM rate_limits WHERE bucket_key LIKE 'register:%'")

    statuses = []
    try:
        for i in range(10):
            res = requests.post(
                f"{base_url}/register.php",
                json={"email": f"rate-limit-probe-{i}@example.test"},
            )
            statuses.append(res.status_code)
            if res.status_code == 429:
                break
    finally:
        with db.cursor() as cur:
            cur.execute("DELETE FROM rate_limits WHERE bucket_key LIKE 'register:%'")

    assert 429 in statuses, f"never got rate-limited across 10 attempts: {statuses}"
    assert 201 in statuses, f"no registration was ever actually allowed through: {statuses}"
