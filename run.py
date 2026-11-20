#!/usr/bin/env python3
"""
Smart Water Guardian - Entrypoint Launcher
Runs the complete simulation stack: Embedded MQTT Broker, Anomaly Engine,
Rule Engine, Physics Simulator, and Web Dashboard.
"""
import sys
import uvicorn
import config

BANNER = r"""
========================================================================
   ____                      __     _      __      __            
  / __/______ _  ___ _____  / /_   | | /| / /___ _/ /____  ____  
 _\ \ / __/  ' \/ _ `/ __/ / __/   | |/ |/ / _ `/ __/ -_)/ __/  
/___//_/ /_/_/_/\_,_/_/    \__/    |__/|__/\_,_/\__/\__//_/     
  / ___/_ _____ _________ ___/ (_)__ ____                       
 / (_ / // / _ `/ __/ _ `/ _  / / _ `/ _ \                      
 \___/\_,_/\_,_/_/  \_,_/\_,_/_/\_,_/_//_/                      
========================================================================
 Hệ Thống Giám Sát An Toàn Nguồn Nước Thông Minh & Cảnh Báo Sớm
 Multi-Variate Anomaly Detection • Physics Simulator • Real ESP32 MQTT
========================================================================
 [Dashboard Web UI]   -> http://localhost:8000
 [API Documentation]  -> http://localhost:8000/docs
 [Embedded MQTT Port] -> 1883 (Telemetry topic: water/telemetry)
========================================================================
"""

def main():
    print(BANNER)
    print(f"Starting server on {config.SERVER_HOST}:{config.SERVER_PORT}...")
    try:
        uvicorn.run(
            "server.app:app",
            host=config.SERVER_HOST,
            port=config.SERVER_PORT,
            log_level="info",
            reload=False
        )
    except KeyboardInterrupt:
        print("\n[INFO] Smart Water Guardian stopped by user.")
        sys.exit(0)


if __name__ == "__main__":
    main()
