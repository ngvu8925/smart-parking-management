"""
Synthetic Water Dataset Generator for Machine Learning Training
Generates realistic multi-variate water quality datasets with diurnal variations,
correlated parameters, and realistic industrial/agricultural contamination patterns.
"""
import os
import numpy as np
import pandas as pd
from typing import Tuple

import config

FEATURE_COLUMNS = [
    "ph", "ec", "tds", "turbidity", "orp", 
    "chlorine", "temperature", "nh4", "no3", "uv254"
]

LABELS = [
    "NORMAL",
    "MUDDY_SEDIMENT",
    "SALINE_INTRUSION",
    "ACID_CONTAMINATION",
    "CHLORINE_DEPLETION",
    "AMMONIA_POLLUTION",
    "NITRATE_RUNOFF",
    "ORGANIC_POLLUTION",
    "MIXED_DISASTER"
]


def generate_normal_samples(n_samples: int = 15000) -> pd.DataFrame:
    """Generates clean baseline municipal water samples with physical correlations"""
    np.random.seed(42)

    # Base independent components
    temp = np.random.normal(27.5, 1.2, n_samples)
    ph = np.random.normal(7.20, 0.15, n_samples)
    turbidity = np.abs(np.random.normal(0.40, 0.12, n_samples))
    chlorine = np.clip(np.random.normal(0.50, 0.05, n_samples), 0.2, 0.8)
    nh4 = np.abs(np.random.normal(0.03, 0.01, n_samples))
    no3 = np.clip(np.random.normal(4.0, 0.5, n_samples), 1.0, 8.0)
    uv254 = np.clip(np.random.normal(0.020, 0.005, n_samples), 0.005, 0.045)

    # Correlated EC and TDS
    ec = np.random.normal(350.0, 25.0, n_samples)
    tds = (ec * 0.5) + np.random.normal(0, 3.0, n_samples)

    # Correlated ORP (increases with Chlorine and lower pH)
    orp = 620.0 + (chlorine - 0.50) * 150.0 - (ph - 7.20) * 60.0 + np.random.normal(0, 15.0, n_samples)

    df = pd.DataFrame({
        "ph": np.clip(ph, 6.5, 8.5),
        "ec": np.clip(ec, 200, 600),
        "tds": np.clip(tds, 100, 300),
        "turbidity": turbidity,
        "orp": np.clip(orp, 500, 800),
        "chlorine": chlorine,
        "temperature": np.clip(temp, 18, 35),
        "nh4": nh4,
        "no3": no3,
        "uv254": uv254,
        "label": "NORMAL",
        "is_anomaly": 0
    })
    return df


def generate_anomaly_samples(samples_per_class: int = 800) -> pd.DataFrame:
    """Generates synthetic contamination events matching realistic physical scenarios"""
    anomaly_frames = []

    # 1. Muddy Water / Suspended Solids
    t_turb = np.random.uniform(5.0, 25.0, samples_per_class)
    df_mud = pd.DataFrame({
        "ph": np.random.normal(7.10, 0.2, samples_per_class),
        "ec": np.random.normal(420.0, 40.0, samples_per_class),
        "tds": np.random.normal(210.0, 20.0, samples_per_class),
        "turbidity": t_turb,
        "orp": np.random.normal(540.0, 30.0, samples_per_class),
        "chlorine": np.random.normal(0.35, 0.05, samples_per_class),
        "temperature": np.random.normal(27.8, 1.0, samples_per_class),
        "nh4": np.random.normal(0.08, 0.02, samples_per_class),
        "no3": np.random.normal(5.2, 0.8, samples_per_class),
        "uv254": np.random.normal(0.045, 0.01, samples_per_class),
        "label": "MUDDY_SEDIMENT",
        "is_anomaly": 1
    })
    anomaly_frames.append(df_mud)

    # 2. Saline Intrusion / High Dissolved Minerals
    t_ec = np.random.uniform(1200.0, 3500.0, samples_per_class)
    df_salt = pd.DataFrame({
        "ph": np.random.normal(7.40, 0.25, samples_per_class),
        "ec": t_ec,
        "tds": t_ec * 0.5 + np.random.normal(0, 15.0, samples_per_class),
        "turbidity": np.random.normal(0.7, 0.2, samples_per_class),
        "orp": np.random.normal(590.0, 30.0, samples_per_class),
        "chlorine": np.random.normal(0.42, 0.05, samples_per_class),
        "temperature": np.random.normal(28.0, 1.0, samples_per_class),
        "nh4": np.random.normal(0.05, 0.02, samples_per_class),
        "no3": np.random.normal(6.5, 1.0, samples_per_class),
        "uv254": np.random.normal(0.025, 0.005, samples_per_class),
        "label": "SALINE_INTRUSION",
        "is_anomaly": 1
    })
    anomaly_frames.append(df_salt)

    # 3. Industrial Acid Contamination
    t_ph = np.random.uniform(3.5, 5.2, samples_per_class)
    df_acid = pd.DataFrame({
        "ph": t_ph,
        "ec": np.random.normal(850.0, 80.0, samples_per_class),
        "tds": np.random.normal(425.0, 40.0, samples_per_class),
        "turbidity": np.random.normal(1.2, 0.3, samples_per_class),
        "orp": np.random.normal(780.0, 40.0, samples_per_class),
        "chlorine": np.random.normal(0.15, 0.05, samples_per_class),
        "temperature": np.random.normal(29.0, 1.2, samples_per_class),
        "nh4": np.random.normal(0.04, 0.01, samples_per_class),
        "no3": np.random.normal(4.8, 0.5, samples_per_class),
        "uv254": np.random.normal(0.035, 0.01, samples_per_class),
        "label": "ACID_CONTAMINATION",
        "is_anomaly": 1
    })
    anomaly_frames.append(df_acid)

    # 4. Disinfection Failure (Chlorine Depletion)
    t_cl = np.random.uniform(0.00, 0.08, samples_per_class)
    df_cl = pd.DataFrame({
        "ph": np.random.normal(7.25, 0.15, samples_per_class),
        "ec": np.random.normal(340.0, 25.0, samples_per_class),
        "tds": np.random.normal(170.0, 15.0, samples_per_class),
        "turbidity": np.random.normal(0.5, 0.15, samples_per_class),
        "orp": np.random.normal(420.0, 30.0, samples_per_class),
        "chlorine": t_cl,
        "temperature": np.random.normal(27.5, 1.0, samples_per_class),
        "nh4": np.random.normal(0.09, 0.02, samples_per_class),
        "no3": np.random.normal(4.1, 0.5, samples_per_class),
        "uv254": np.random.normal(0.038, 0.008, samples_per_class),
        "label": "CHLORINE_DEPLETION",
        "is_anomaly": 1
    })
    anomaly_frames.append(df_cl)

    # 5. Ammonia / Wastewater Pollution
    t_nh4 = np.random.uniform(0.40, 2.50, samples_per_class)
    df_nh4 = pd.DataFrame({
        "ph": np.random.normal(7.65, 0.2, samples_per_class),
        "ec": np.random.normal(580.0, 50.0, samples_per_class),
        "tds": np.random.normal(290.0, 25.0, samples_per_class),
        "turbidity": np.random.normal(2.1, 0.5, samples_per_class),
        "orp": np.random.normal(460.0, 35.0, samples_per_class),
        "chlorine": np.random.normal(0.08, 0.03, samples_per_class),
        "temperature": np.random.normal(28.1, 1.0, samples_per_class),
        "nh4": t_nh4,
        "no3": np.random.normal(6.8, 1.0, samples_per_class),
        "uv254": np.random.normal(0.062, 0.015, samples_per_class),
        "label": "AMMONIA_POLLUTION",
        "is_anomaly": 1
    })
    anomaly_frames.append(df_nh4)

    # 6. Nitrate Agricultural Runoff
    t_no3 = np.random.uniform(18.0, 50.0, samples_per_class)
    df_no3 = pd.DataFrame({
        "ph": np.random.normal(7.30, 0.2, samples_per_class),
        "ec": np.random.normal(620.0, 50.0, samples_per_class),
        "tds": np.random.normal(310.0, 25.0, samples_per_class),
        "turbidity": np.random.normal(1.1, 0.3, samples_per_class),
        "orp": np.random.normal(580.0, 30.0, samples_per_class),
        "chlorine": np.random.normal(0.38, 0.05, samples_per_class),
        "temperature": np.random.normal(27.6, 1.0, samples_per_class),
        "nh4": np.random.normal(0.08, 0.02, samples_per_class),
        "no3": t_no3,
        "uv254": np.random.normal(0.030, 0.008, samples_per_class),
        "label": "NITRATE_RUNOFF",
        "is_anomaly": 1
    })
    anomaly_frames.append(df_no3)

    # 7. Organic Chemical Pollution
    t_uv = np.random.uniform(0.090, 0.250, samples_per_class)
    df_org = pd.DataFrame({
        "ph": np.random.normal(6.85, 0.25, samples_per_class),
        "ec": np.random.normal(490.0, 45.0, samples_per_class),
        "tds": np.random.normal(245.0, 25.0, samples_per_class),
        "turbidity": np.random.normal(2.4, 0.5, samples_per_class),
        "orp": np.random.normal(280.0, 40.0, samples_per_class),
        "chlorine": np.random.normal(0.05, 0.02, samples_per_class),
        "temperature": np.random.normal(28.5, 1.2, samples_per_class),
        "nh4": np.random.normal(0.22, 0.05, samples_per_class),
        "no3": np.random.normal(7.4, 1.0, samples_per_class),
        "uv254": t_uv,
        "label": "ORGANIC_POLLUTION",
        "is_anomaly": 1
    })
    anomaly_frames.append(df_org)

    # 8. Severe Mixed Disaster
    df_mix = pd.DataFrame({
        "ph": np.random.uniform(4.5, 5.5, samples_per_class),
        "ec": np.random.uniform(1500.0, 2500.0, samples_per_class),
        "tds": np.random.uniform(750.0, 1250.0, samples_per_class),
        "turbidity": np.random.uniform(7.0, 16.0, samples_per_class),
        "orp": np.random.uniform(200.0, 320.0, samples_per_class),
        "chlorine": np.random.uniform(0.01, 0.08, samples_per_class),
        "temperature": np.random.uniform(28.0, 31.0, samples_per_class),
        "nh4": np.random.uniform(0.6, 1.5, samples_per_class),
        "no3": np.random.uniform(12.0, 25.0, samples_per_class),
        "uv254": np.random.uniform(0.08, 0.18, samples_per_class),
        "label": "MIXED_DISASTER",
        "is_anomaly": 1
    })
    anomaly_frames.append(df_mix)

    return pd.concat(anomaly_frames, ignore_index=True)


def build_and_save_dataset(output_path: str = "ml/datasets/water_quality_ml_dataset.csv") -> pd.DataFrame:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    normal_df = generate_normal_samples(n_samples=16000)
    anomaly_df = generate_anomaly_samples(samples_per_class=1000)
    full_df = pd.concat([normal_df, anomaly_df], ignore_index=True).sample(frac=1.0, random_state=42).reset_index(drop=True)
    full_df.to_csv(output_path, index=False)
    print(f"[ML Dataset] Generated {len(full_df)} records ({len(normal_df)} normal, {len(anomaly_df)} anomalies). Saved to {output_path}")
    return full_df


if __name__ == "__main__":
    build_and_save_dataset()
