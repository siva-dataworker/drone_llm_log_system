from pymavlink import mavutil
import pandas as pd

def bin_to_csv(bin_path, csv_path):
    mlog = mavutil.mavlink_connection(bin_path)
    
    records = []
    
    while True:
        msg = mlog.recv_match(
            type=['IMU', 'RCOU', 'BAT', 'GPS', 'ATT', 'VIBE'],
            blocking=False
        )
        if msg is None:
            break
            
        d = msg.to_dict()
        d['msg_type'] = msg.get_type()
        d['timestamp'] = getattr(msg, 'TimeUS', 0) / 1e6
        records.append(d)
    
    df = pd.DataFrame(records)
    df.to_csv(csv_path, index=False)
    print(f"Done — {len(df)} rows saved to {csv_path}")
    return df

# Test it
bin_to_csv(r"E:\Dronelog_ai\dronelog_ai\bin_files\flight7.bin", r"E:\Dronelog_ai\dronelog_ai\csv_files\flight7.csv")