"""
Unit tests for Simulator Physics and Scenario Management
"""
import pytest
from simulator.physics import WaterPhysicsEngine
from simulator.scenario_manager import ScenarioManager
import config


def test_physics_engine_step():
    engine = WaterPhysicsEngine(config.BASELINE_PROFILE)
    readings = engine.step(dt=1.0)

    assert "ph" in readings
    assert "turbidity" in readings
    assert 6.0 <= readings["ph"] <= 8.5
    assert readings["turbidity"] >= 0.0


def test_scenario_activation():
    engine = WaterPhysicsEngine(config.BASELINE_PROFILE)
    mgr = ScenarioManager(engine)

    scenarios = mgr.list_scenarios()
    assert len(scenarios) >= 5

    success = mgr.activate_scenario("muddy_water")
    assert success
    assert mgr.active_scenario_id == "muddy_water"
    assert engine.channels["turbidity"].target_value > 10.0


def test_stuck_sensor_fault():
    engine = WaterPhysicsEngine(config.BASELINE_PROFILE)
    engine.set_stuck("ph", True)

    val1 = engine.step(dt=1.0)["ph"]
    val2 = engine.step(dt=1.0)["ph"]
    val3 = engine.step(dt=1.0)["ph"]

    assert val1 == val2 == val3
