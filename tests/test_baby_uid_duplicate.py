"""Baby UID duplicate detection within the same site (screening_id prefix)."""


def test_baby_uid_duplicate_returns_409(client, nurse_token, db_session):
    headers = {"Authorization": f"Bearer {nurse_token}"}

    first = client.post(
        "/birth-resuscitation/",
        json={
            "screening_id": "01-9101",
            "enrollment_id": "01-A-9101",
            "baby_uid": "555001",
        },
        headers=headers,
    )
    assert first.status_code == 200, first.text

    conflict = client.post(
        "/birth-resuscitation/",
        json={
            "screening_id": "01-9102",
            "enrollment_id": "01-A-9102",
            "baby_uid": "555001",
        },
        headers=headers,
    )
    assert conflict.status_code == 409, conflict.text
    assert "555001" in conflict.json()["detail"]


def test_baby_uid_check_endpoint(client, nurse_token):
    headers = {"Authorization": f"Bearer {nurse_token}"}
    client.post(
        "/birth-resuscitation/",
        json={
            "screening_id": "01-9103",
            "enrollment_id": "01-A-9103",
            "baby_uid": "555002",
        },
        headers=headers,
    )

    ok = client.get(
        "/birth-resuscitation/check-baby-uid",
        params={
            "baby_uid": "555002",
            "screening_id": "01-9103",
            "enrollment_id": "01-A-9103",
        },
        headers=headers,
    )
    assert ok.status_code == 200
    assert ok.json()["duplicate"] is False

    dup = client.get(
        "/birth-resuscitation/check-baby-uid",
        params={
            "baby_uid": "555002",
            "screening_id": "01-9104",
            "enrollment_id": "01-A-9104",
        },
        headers=headers,
    )
    assert dup.status_code == 200
    assert dup.json()["duplicate"] is True
    assert dup.json()["screening_id"] == "01-9103"


def test_enrollment_id_duplicate_check(client, nurse_token):
    headers = {"Authorization": f"Bearer {nurse_token}"}
    client.post(
        "/birth-resuscitation/",
        json={
            "screening_id": "01-9201",
            "enrollment_id": "01-A-201",
            "baby_uid": "9201",
        },
        headers=headers,
    )

    dup = client.get(
        "/birth-resuscitation/check-enrollment-id",
        params={
            "enrollment_id": "01-A-201",
            "screening_id": "01-9202",
        },
        headers=headers,
    )
    assert dup.status_code == 200
    assert dup.json()["duplicate"] is True
