"""
Scenario Manager for loading, scheduling, and transitioning simulation scenarios
"""
import os
import json
import logging
import time
from typing import Dict, List, Optional, Any
from simulator.physics import WaterPhysicsEngine
import config

logger = logging.getLogger("ScenarioManager")


class ScenarioManager:
    def __init__(self, physics_engine: WaterPhysicsEngine, scenarios_dir: Optional[str] = None):
        self.physics = physics_engine
        if scenarios_dir is None:
            scenarios_dir = os.path.join(os.path.dirname(__file__), "scenarios")
        self.scenarios_dir = scenarios_dir
        self.scenarios: Dict[str, Dict[str, Any]] = {}
        self.active_scenario_id = "normal"
        self.scenario_start_time = time.time()
        self.scenario_duration = 0  # 0 means indefinite
        self._load_all_scenarios()

    def _load_all_scenarios(self):
        if not os.path.exists(self.scenarios_dir):
            logger.warning("Scenarios directory does not exist: %s", self.scenarios_dir)
            return

        for fname in os.listdir(self.scenarios_dir):
            if fname.endswith(".json"):
                fpath = os.path.join(self.scenarios_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        sc_data = json.load(f)
                        self.scenarios[sc_data["id"]] = sc_data
                except Exception as e:
                    logger.error("Failed to load scenario %s: %s", fname, e)
        logger.info("Loaded %d scenarios from %s", len(self.scenarios), self.scenarios_dir)

    def list_scenarios(self) -> List[Dict[str, Any]]:
        return list(self.scenarios.values())

    def get_active_scenario(self) -> Dict[str, Any]:
        return self.scenarios.get(self.active_scenario_id, {
            "id": self.active_scenario_id,
            "name": "Custom / Unknown",
            "description": ""
        })

    def activate_scenario(self, scenario_id: str) -> bool:
        if scenario_id not in self.scenarios:
            logger.warning("Scenario not found: %s", scenario_id)
            return False

        sc = self.scenarios[scenario_id]
        self.active_scenario_id = scenario_id
        self.scenario_start_time = time.time()
        self.scenario_duration = sc.get("duration_seconds", 0)

        # Reset any previous fault injections
        self.physics.reset_all_faults()

        # Apply target parameters to physics engine
        targets = sc.get("targets", {})
        self.physics.set_targets(targets)

        # Apply specific faults (e.g. stuck sensor)
        faults = sc.get("faults", {})
        if "stuck_sensors" in faults:
            for s in faults["stuck_sensors"]:
                self.physics.set_stuck(s, True)

        logger.info("Activated scenario '%s': %s", scenario_id, sc.get("name"))
        return True

    def inject_custom_target(self, sensor: str, value: float):
        self.physics.set_targets({sensor: value})
        logger.info("Injected custom target: %s = %f", sensor, value)

    def step(self):
        """Check if timed scenario has completed and revert to normal if needed"""
        if self.scenario_duration > 0 and self.active_scenario_id != "normal":
            elapsed = time.time() - self.scenario_start_time
            if elapsed >= self.scenario_duration:
                logger.info("Scenario '%s' completed after %ds. Reverting to normal.", self.active_scenario_id, self.scenario_duration)
                self.activate_scenario("normal")
