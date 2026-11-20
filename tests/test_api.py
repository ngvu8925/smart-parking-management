"""
Integration tests for FastAPI endpoints
"""
import pytest
from fastapi.testclient import TestClient
from server.app import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_api_status(client):
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "anomaly_score" in data
    assert "actuators" in data


def test_api_scenarios(client):
    res = client.get("/api/scenarios")
    assert res.status_code == 200
    data = res.json()
    assert "scenarios" in data
    assert len(data["scenarios"]) > 0


def test_api_activate_scenario(client):
    res = client.post("/api/scenarios/activate", json={"scenario_id": "salt_spike"})
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_api_actuator_valve(client):
    res = client.post("/api/actuators/valve", json={"action": "CLOSE", "mode": "MANUAL"})
    assert res.status_code == 200
    assert res.json()["actuators"]["valve_state"] == "CLOSED"

    res_open = client.post("/api/actuators/valve", json={"action": "OPEN", "mode": "AUTO"})
    assert res_open.status_code == 200
    assert res_open.json()["actuators"]["valve_state"] == "OPEN"
