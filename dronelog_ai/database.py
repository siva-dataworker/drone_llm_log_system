import sqlite3
import json
import os
from datetime import datetime
from typing import Dict, List, Tuple

# Database paths
DB_PATH = "dronelog_ai/db/flights.db"
CHROMA_PATH = "dronelog_ai/db/chroma"

# Ensure directories exist
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(CHROMA_PATH, exist_ok=True)

# Initialize ChromaDB client (persistent) - lazy load to avoid import errors
chroma_collection = None

def _init_chroma():
    global chroma_collection
    if chroma_collection is None:
        try:
            import chromadb
            chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
            chroma_collection = chroma_client.get_or_create_collection(
                name="flight_reports",
                metadata={"hnsw:space": "cosine"}
            )
        except ImportError:
            print("WARNING: ChromaDB not installed. Run: pip install chromadb")
            return False
    return True


def init_sqlite_db():
    """Create SQLite schema if it doesn't exist."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS flights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            flight_id TEXT UNIQUE NOT NULL,
            timestamp TEXT NOT NULL,
            duration_s REAL,
            total_rows INTEGER,
            fault_count INTEGER,
            fault_list TEXT,
            motor_asym_pct REAL,
            motor3_std REAL,
            motor3_mean REAL,
            motor_max_diff REAL,
            vib_peak REAL,
            vib_mean REAL,
            vib_trend REAL,
            bat_volt_start REAL,
            bat_volt_end REAL,
            bat_drop_v REAL,
            bat_rate_vs REAL,
            bat_curr_peak REAL,
            bat_curr_mean REAL,
            hdop_max REAL,
            hdop_mean REAL,
            nsats_min INTEGER,
            roll_std REAL,
            pitch_std REAL,
            roll_max REAL,
            created_at TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


def save_flight_analysis(
    flight_id: str,
    features: Dict,
    faults: List[Dict],
    report: str
) -> Dict:
    """
    Save flight analysis to both SQLite (structured) and ChromaDB (embeddings).

    Args:
        flight_id: Unique identifier for this flight
        features: Dict of 20 extracted features
        faults: List of detected faults
        report: Plain-English maintenance report from LLM

    Returns:
        Dict with status and saved record info
    """

    timestamp = features.get("timestamp", datetime.now().isoformat())

    # ── SAVE TO SQLITE ────────────────────────────────────
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    fault_list_json = json.dumps(faults)

    try:
        cursor.execute("""
            INSERT INTO flights (
                flight_id, timestamp, duration_s, total_rows, fault_count, fault_list,
                motor_asym_pct, motor3_std, motor3_mean, motor_max_diff,
                vib_peak, vib_mean, vib_trend,
                bat_volt_start, bat_volt_end, bat_drop_v, bat_rate_vs, bat_curr_peak, bat_curr_mean,
                hdop_max, hdop_mean, nsats_min,
                roll_std, pitch_std, roll_max,
                created_at
            )
            VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?
            )
        """, (
            flight_id,
            timestamp,
            features.get("duration_s", 0),
            features.get("total_rows", 0),
            len(faults),
            fault_list_json,
            features.get("motor_asym_pct", 0),
            features.get("motor3_std", 0),
            features.get("motor3_mean", 0),
            features.get("motor_max_diff", 0),
            features.get("vib_peak", 0),
            features.get("vib_mean", 0),
            features.get("vib_trend", 0),
            features.get("bat_volt_start", 0),
            features.get("bat_volt_end", 0),
            features.get("bat_drop_v", 0),
            features.get("bat_rate_vs", 0),
            features.get("bat_curr_peak", 0),
            features.get("bat_curr_mean", 0),
            features.get("hdop_max", 0),
            features.get("hdop_mean", 0),
            features.get("nsats_min", 0),
            features.get("roll_std", 0),
            features.get("pitch_std", 0),
            features.get("roll_max", 0),
            datetime.now().isoformat()
        ))

        conn.commit()
        sqlite_id = cursor.lastrowid
        conn.close()

    except sqlite3.IntegrityError:
        conn.close()
        return {
            "status": "error",
            "message": f"Flight {flight_id} already exists in database"
        }

    # ── SAVE TO CHROMADB ──────────────────────────────────
    chroma_status = "skipped"
    if _init_chroma():
        try:
            chroma_collection.add(
                ids=[flight_id],
                documents=[report],
                metadatas=[{
                    "flight_id": flight_id,
                    "fault_count": len(faults),
                    "timestamp": timestamp,
                    "severity": "HIGH" if any(f["severity"] == "HIGH" for f in faults) else "MEDIUM" if faults else "NONE"
                }]
            )
            chroma_status = "success"
        except Exception as e:
            chroma_status = f"failed: {str(e)}"

    return {
        "status": "success" if chroma_status == "success" else "partial",
        "message": f"Flight {flight_id} saved to SQLite (ID: {sqlite_id}), ChromaDB: {chroma_status}",
        "sqlite_id": sqlite_id,
        "chroma_id": flight_id if chroma_status == "success" else None
    }


def search_chromadb(query: str, n_results: int = 3) -> List[Dict]:
    """
    Semantic search in ChromaDB for similar flight reports.

    Args:
        query: User's question in plain English
        n_results: Number of similar reports to return

    Returns:
        List of dicts with flight_id, report snippet, metadata
    """

    if not _init_chroma():
        return [{"error": "ChromaDB not available"}]

    try:
        results = chroma_collection.query(
            query_texts=[query],
            n_results=n_results
        )

        if not results or not results["ids"] or len(results["ids"]) == 0:
            return []

        output = []
        for i, flight_id in enumerate(results["ids"][0]):
            output.append({
                "flight_id": flight_id,
                "document": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "relevance": 1 - results["distances"][0][i]  # Convert distance to similarity
            })

        return output

    except Exception as e:
        return [{"error": str(e)}]


def query_sqlite(
    filters: Dict = None,
    limit: int = 10
) -> List[Dict]:
    """
    Query SQLite for structured flight records.

    Args:
        filters: Dict with optional keys: flight_id, min_faults, min_duration_s, severity
        limit: Max number of records to return

    Returns:
        List of flight records as dicts
    """

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = "SELECT * FROM flights WHERE 1=1"
    params = []

    if filters:
        if "flight_id" in filters:
            query += " AND flight_id = ?"
            params.append(filters["flight_id"])

        if "min_faults" in filters:
            query += " AND fault_count >= ?"
            params.append(filters["min_faults"])

        if "min_duration_s" in filters:
            query += " AND duration_s >= ?"
            params.append(filters["min_duration_s"])

        if "severity" in filters:
            query += " AND fault_list LIKE ?"
            params.append(f'%"{filters["severity"]}"%')

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    # Convert to list of dicts with parsed fault_list
    results = []
    for row in rows:
        record = dict(row)
        try:
            record["fault_list"] = json.loads(record["fault_list"])
        except:
            record["fault_list"] = []
        results.append(record)

    return results


def get_fleet_summary() -> Dict:
    """
    Get summary statistics across all flights.

    Returns:
        Dict with counts, averages, and severity breakdown
    """

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Total flights
    cursor.execute("SELECT COUNT(*) FROM flights")
    total_flights = cursor.fetchone()[0]

    # Average features
    cursor.execute("""
        SELECT
            AVG(fault_count) as avg_faults,
            AVG(duration_s) as avg_duration,
            AVG(vib_peak) as avg_vib_peak,
            AVG(bat_drop_v) as avg_bat_drop
        FROM flights
    """)
    row = cursor.fetchone()
    avg_faults, avg_duration, avg_vib_peak, avg_bat_drop = row

    conn.close()

    return {
        "total_flights": total_flights,
        "avg_faults_per_flight": round(avg_faults or 0, 2),
        "avg_flight_duration_s": round(avg_duration or 0, 1),
        "avg_peak_vibration": round(avg_vib_peak or 0, 4),
        "avg_battery_drop": round(avg_bat_drop or 0, 3)
    }


# ── Quick test ────────────────────────────────────────
if __name__ == "__main__":
    from dronelog_ai.analyzer import extract_features, run_rca
    from dronelog_ai.explain import generate_explanation
    import pandas as pd

    # Initialize database
    init_sqlite_db()

    # Load and analyze flight
    df = pd.read_csv("dronelog_ai/csv_files/flight7.csv")
    features = extract_features(df)
    faults = run_rca(features)
    result = generate_explanation(features, faults)

    # Save to both databases
    print("\n── SAVING FLIGHT ANALYSIS ──")
    save_result = save_flight_analysis(
        flight_id="flight7",
        features=features,
        faults=faults,
        report=result["report"]
    )
    print(f"Status: {save_result['status']}")
    print(f"Message: {save_result['message']}\n")

    # Query SQLite
    print("── SQLITE RECORDS ──")
    records = query_sqlite(limit=2)
    for rec in records:
        print(f"Flight: {rec['flight_id']}, Faults: {rec['fault_count']}, Duration: {rec['duration_s']}s")

    # Semantic search
    print("\n── CHROMADB SEMANTIC SEARCH ──")
    search_results = search_chromadb("Motor imbalance and vibration issues", n_results=1)
    for res in search_results:
        if "error" not in res:
            print(f"Flight: {res['flight_id']}")
            print(f"Relevance: {res['relevance']:.3f}")
            print(f"Report preview: {res['document'][:200]}...")

    # Fleet summary
    print("\n── FLEET SUMMARY ──")
    summary = get_fleet_summary()
    for key, val in summary.items():
        print(f"{key}: {val}")
