import pandas as pd
import numpy as np

def extract_features(df):
    
    # Split by message type
    imu  = df[df['mavpackettype'] == 'IMU'].copy()
    rcou = df[df['mavpackettype'] == 'RCOU'].copy()
    bat  = df[df['mavpackettype'] == 'BAT'].copy()
    gps  = df[df['mavpackettype'] == 'GPS'].copy()
    att  = df[df['mavpackettype'] == 'ATT'].copy()
    vibe = df[df['mavpackettype'] == 'VIBE'].copy()

    features = {}

    # ── MOTOR FEATURES (RCOU) ──────────────────────────
    if not rcou.empty and all(c in rcou.columns for c in ['C1','C2','C3','C4']):
        motors = rcou[['C1','C2','C3','C4']].dropna()
        if not motors.empty:
            avg_others = motors[['C1','C2','C4']].mean(axis=1).mean()
            c3_mean    = motors['C3'].mean()
            features['motor_asym_pct']  = round((c3_mean / avg_others - 1) * 100, 2) if avg_others > 0 else 0
            features['motor3_std']      = round(motors['C3'].std(), 2)
            features['motor3_mean']     = round(c3_mean, 1)
            features['motor_max_diff']  = round(
                motors.max(axis=1).mean() - motors.min(axis=1).mean(), 2)
    else:
        features['motor_asym_pct'] = 0
        features['motor3_std']     = 0
        features['motor3_mean']    = 0
        features['motor_max_diff'] = 0

    # ── VIBRATION FEATURES (VIBE) ──────────────────────
    if not vibe.empty:
        vx = vibe['VibeX'].dropna()
        vy = vibe['VibeY'].dropna()
        vz = vibe['VibeZ'].dropna()

        if len(vx) > 20:
            vib_rms = np.sqrt(vx**2 + vy**2 + vz**2)
            features['vib_peak']    = round(vib_rms.max(), 4)
            features['vib_mean']    = round(vib_rms.mean(), 4)
            features['vib_trend']   = round(
                vib_rms.iloc[-20:].mean() - vib_rms.iloc[:20].mean(), 4)
        else:
            features['vib_peak']  = 0
            features['vib_mean']  = 0
            features['vib_trend'] = 0
    else:
        features['vib_peak']  = 0
        features['vib_mean']  = 0
        features['vib_trend'] = 0

    # ── BATTERY FEATURES (BAT) ────────────────────────
    if not bat.empty:
        volt = bat['Volt'].dropna()
        curr = bat['Curr'].dropna()

        if len(volt) > 5:
            features['bat_volt_start'] = round(float(volt.iloc[0]), 3)
            features['bat_volt_end']   = round(float(volt.iloc[-1]), 3)
            features['bat_drop_v']     = round(float(volt.iloc[0] - volt.iloc[-1]), 3)
            slope = np.polyfit(range(len(volt)), volt.values, 1)[0]
            features['bat_rate_vs']    = round(float(slope), 6)
        else:
            features['bat_volt_start'] = 0
            features['bat_volt_end']   = 0
            features['bat_drop_v']     = 0
            features['bat_rate_vs']    = 0

        if len(curr) > 0:
            features['bat_curr_peak'] = round(float(curr.max()), 2)
            features['bat_curr_mean'] = round(float(curr.mean()), 2)
        else:
            features['bat_curr_peak'] = 0
            features['bat_curr_mean'] = 0
    else:
        features.update({
            'bat_volt_start':0,'bat_volt_end':0,
            'bat_drop_v':0,'bat_rate_vs':0,
            'bat_curr_peak':0,'bat_curr_mean':0
        })

    # ── GPS FEATURES ──────────────────────────────────
    if not gps.empty:
        hdop  = gps['HDop'].dropna()
        nsats = gps['NSats'].dropna()
        features['hdop_max']   = round(float(hdop.max()), 2)   if len(hdop)  > 0 else 0
        features['hdop_mean']  = round(float(hdop.mean()), 2)  if len(hdop)  > 0 else 0
        features['nsats_min']  = int(nsats.min())               if len(nsats) > 0 else 0
    else:
        features['hdop_max']  = 0
        features['hdop_mean'] = 0
        features['nsats_min'] = 0

    # ── ATTITUDE FEATURES (ATT) ───────────────────────
    if not att.empty:
        roll  = att['Roll'].dropna()
        pitch = att['Pitch'].dropna()
        features['roll_std']   = round(float(roll.std()), 3)   if len(roll)  > 0 else 0
        features['pitch_std']  = round(float(pitch.std()), 3)  if len(pitch) > 0 else 0
        features['roll_max']   = round(float(roll.abs().max()),2) if len(roll) > 0 else 0
    else:
        features['roll_std']  = 0
        features['pitch_std'] = 0
        features['roll_max']  = 0

    # ── FLIGHT INFO ───────────────────────────────────
    ts = df['timestamp'].dropna()
    features['duration_s'] = round(float(ts.max() - ts.min()), 1) if len(ts) > 1 else 0
    features['total_rows'] = len(df)

    return features


def run_rca(f):
    faults = []

    # Motor
    if abs(f.get('motor_asym_pct', 0)) > 5:
        faults.append({
            "type":     "Motor Imbalance",
            "severity":  "HIGH" if abs(f['motor_asym_pct']) > 8 else "MEDIUM",
            "description":  f"Motor 3 running {f['motor_asym_pct']}% above others",
            "recommended_action":    "Inspect Motor 3 bearings before next flight"
        })

    if f.get('vib_trend', 0) > 0.15:
        faults.append({
            "type":     "Rising Vibration",
            "severity":  "MEDIUM",
            "description":  f"Vibration rose {f['vib_trend']:.3f} m/s² during flight",
            "recommended_action":    "Check propeller balance and motor mounts"
        })

    if f.get('vib_peak', 0) > 15:
        faults.append({
            "type":     "High Vibration",
            "severity":  "HIGH",
            "description":  f"Peak vibration {f['vib_peak']} m/s² exceeds threshold",
            "recommended_action":    "Inspect all propellers and motor bearings immediately"
        })

    if f.get('bat_rate_vs', 0) < -0.006:
        faults.append({
            "type":     "Fast Battery Drain",
            "severity":  "MEDIUM",
            "description":  f"Discharge rate {f['bat_rate_vs']:.5f} V/s — above normal",
            "recommended_action":    "Run battery capacity test before next flight"
        })

    if f.get('bat_drop_v', 0) > 3.0:
        faults.append({
            "type":     "High Voltage Drop",
            "severity":  "HIGH",
            "description":  f"Total voltage drop {f['bat_drop_v']}V during flight",
            "recommended_action":    "Battery may need replacement — cycle test recommended"
        })

    if f.get('hdop_max', 0) > 3.0:
        faults.append({
            "type":     "GPS Degraded",
            "severity":  "HIGH" if f['hdop_max'] > 5 else "MEDIUM",
            "description":  f"GPS HDOP peaked at {f['hdop_max']}",
            "recommended_action":    "Review flight area for GPS signal obstruction"
        })

    if f.get('nsats_min', 99) < 8:
        faults.append({
            "type":     "Low Satellites",
            "severity":  "HIGH",
            "description":  f"Satellite count dropped to {f['nsats_min']}",
            "recommended_action":    "Do not fly this location until GPS improves"
        })

    if f.get('roll_std', 0) > 8 or f.get('pitch_std', 0) > 8:
        faults.append({
            "type":     "Attitude Instability",
            "severity":  "MEDIUM",
            "description":  f"Roll std={f['roll_std']}° Pitch std={f['pitch_std']}°",
            "recommended_action":    "Check motor balance and PID tuning"
        })

    return faults


# ── Quick test ────────────────────────────────────────
if __name__ == "__main__":
    import json
    df = pd.read_csv(r"E:\Dronelog_ai\dronelog_ai\csv_files\flight7.csv")
    features = extract_features(df)
    faults   = run_rca(features)

    print("\n── FEATURES ──")
    for k, v in features.items():
        print(f"  {k}: {v}")

    print(f"\n── FAULTS DETECTED: {len(faults)} ──")
    for f in faults:
        print(f"  [{f['severity']}] {f['fault']}: {f['evidence']}")
        print(f"  → {f['action']}")







