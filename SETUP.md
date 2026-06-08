# Dronelog AI - Setup & Usage Guide

Complete flight log analysis system with LLM-powered maintenance reports and RAG-based Q&A chat.

## Architecture Overview

```
┌─────────────────────┐
│  Upload .bin File   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  bin_to_csv.py      │  Convert ArduPilot binary to CSV
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  analyzer.py        │  Extract 20 features + 8 RCA checks
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  explain.py         │  Send to Claude (via OpenRouter)
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  database.py                         │
│  ├─ SQLite (structured records)      │
│  └─ ChromaDB (vector embeddings)     │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────┐
│  RAG Q&A Chat       │
│  Query → Search →   │
│  Retrieve → Answer  │
└─────────────────────┘
```

## Installation

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Set OpenRouter API Key
You need an OpenRouter API key to use Claude for explanations and Q&A.

**Option A: Environment Variable**
```powershell
$env:OPENROUTER_API_KEY = "sk-or-v1-..."
```

**Option B: .env File**
Create a `.env` file in the project root:
```
OPENROUTER_API_KEY=sk-or-v1-...
```

**Get your key:** https://openrouter.ai/keys

### 3. Start the Server
```bash
# Windows
python -m dronelog_ai.app

# Or use the batch file
./run.bat
```

The server will start at **http://localhost:5000**

## Usage

### Tab 1: Upload & Analyze .bin Files

1. **Upload a flight log**
   - Drag & drop a `.bin` file from your drone
   - Or click the dropzone to select a file

2. **Click "Upload & Process"**
   - Converts `.bin` → CSV (using pymavlink)
   - Extracts 20 statistical features
   - Runs 8 fault detection rules
   - Sends to Claude for plain-English report
   - Saves to SQLite + ChromaDB

3. **View Results**
   - ✅ Detected faults with severity & recommendations
   - 📋 Maintenance report from LLM
   - 📊 Feature values extracted from the flight

### Tab 2: Q&A & Compare Reports

1. **View All Flight Reports**
   - Left sidebar shows all uploaded flights
   - Sorted by most recent first
   - Click any report to view details

2. **Ask Questions**
   - Select a flight from the sidebar
   - Type a question about that flight
   - Examples:
     - "Why did the motor vibration spike?"
     - "Compare this flight's battery health to others"
     - "What patterns suggest the ESC needs replacement?"

3. **RAG in Action**
   - Your question is converted to a vector
   - ChromaDB finds semantically similar flight reports
   - Claude generates an answer based on the retrieved reports
   - Shows which flights were referenced

## Database Schema

### SQLite (flights table)
Structured records for exact queries:
- `flight_id` - Unique identifier
- `timestamp` - When flight was uploaded
- `fault_count` - Number of detected faults
- `fault_list` - JSON array of faults
- 20 feature columns (motor, vibration, battery, GPS, attitude)
- `created_at` - When record was saved

**Example Query:**
```python
from dronelog_ai.database import query_sqlite
flights_with_high_vibration = query_sqlite(
    filters={"min_faults": 2},
    limit=10
)
```

### ChromaDB (flight_reports collection)
Vector embeddings for semantic search:
- `flight_id` - Reference to flight
- `document` - Full maintenance report text
- `metadata` - Timestamp, fault count, severity
- Vectors - Generated automatically for semantic search

**Example Query:**
```python
from dronelog_ai.database import search_chromadb
results = search_chromadb(
    "motor imbalance issues",
    n_results=3
)
```

## File Structure

```
dronelog_ai/
├── app.py                 # Flask web server
├── bin_to_csv.py          # Convert .bin → CSV
├── analyzer.py            # Feature extraction & RCA
├── explain.py             # LLM integration (Claude)
├── database.py            # SQLite + ChromaDB
├── templates/
│   └── index.html         # Tailwind CSS frontend
├── static/
│   └── js/main.js         # Frontend JavaScript
├── uploads/               # Uploaded .bin files
├── csv_files/             # Converted CSV files
├── db/
│   ├── flights.db         # SQLite database
│   └── chroma/            # ChromaDB persistent storage
```

## API Endpoints

### POST /api/upload-bin
Upload and process a `.bin` flight log.

**Response:**
```json
{
  "success": true,
  "flight_id": "flight_abc123_20240607_143022",
  "faults": [...],
  "report": "Plain-English maintenance report...",
  "features": {...},
  "db_status": "success"
}
```

### GET /api/reports
Get all flight reports.

**Query params:**
- `limit` (default: 20) - Max reports to return

**Response:**
```json
{
  "success": true,
  "count": 5,
  "reports": [
    {
      "flight_id": "flight_abc123_20240607_143022",
      "timestamp": "2024-06-07T14:30:22",
      "fault_count": 2,
      "headline": "Flight flight_abc123... - 2 issues"
    }
  ]
}
```

### GET /api/report/<flight_id>
Get detailed report for a specific flight.

**Response:**
```json
{
  "success": true,
  "flight_id": "flight_abc123...",
  "faults": [...],
  "report": "Full maintenance report...",
  "features": {...}
}
```

### POST /api/search-rag
RAG search: semantic search + LLM answer.

**Request:**
```json
{
  "query": "Why did motor 3 vibration spike?",
  "flight_id": "flight_abc123_...",
  "n_results": 3
}
```

**Response:**
```json
{
  "success": true,
  "query": "Why did motor 3 vibration spike?",
  "answer": "Based on the flight reports, motor 3 vibration increased because...",
  "relevant_flights": ["flight_abc123_...", "flight_def456_..."],
  "relevance_scores": [0.92, 0.78]
}
```

### GET /api/fleet-summary
Get fleet statistics across all flights.

**Response:**
```json
{
  "success": true,
  "summary": {
    "total_flights": 42,
    "avg_faults_per_flight": 1.8,
    "avg_flight_duration_s": 1245.5,
    "avg_peak_vibration": 0.0342,
    "avg_battery_drop": 2.4
  }
}
```

## Features Extracted (20 total)

### Motor Health (4)
- `motor_asym_pct` - Asymmetry across motors
- `motor3_std` - Standard deviation of motor 3
- `motor3_mean` - Mean output of motor 3
- `motor_max_diff` - Max difference between any two motors

### Vibration (3)
- `vib_peak` - Peak vibration magnitude
- `vib_mean` - Average vibration
- `vib_trend` - Vibration trend over flight (rising/falling)

### Battery (5)
- `bat_volt_start` - Starting voltage
- `bat_volt_end` - Ending voltage
- `bat_drop_v` - Total voltage drop
- `bat_rate_vs` - Voltage drop rate
- `bat_curr_peak` - Peak current draw

### GPS (3)
- `hdop_max` - Max horizontal dilution of precision
- `hdop_mean` - Average HDOP
- `nsats_min` - Minimum satellite count

### Attitude (5)
- `roll_std` - Roll standard deviation
- `pitch_std` - Pitch standard deviation
- `roll_max` - Max roll angle
- ... (2 more attitude metrics)

## Fault Detection Rules (8 RCA checks)

1. **Motor Asymmetry** - Motors not balanced
2. **Motor 3 Failure** - Motor 3 specific issues
3. **High Vibration** - Structural/propeller issues
4. **Vibration Trend** - Increasing vibration over time
5. **Battery Degradation** - Voltage drop rate too high
6. **GPS Quality** - Poor signal or low satellite count
7. **Attitude Instability** - High roll/pitch variance
8. **ESC Issues** - Motor control anomalies

Each fault includes:
- **severity** - HIGH / MEDIUM / LOW
- **description** - What was detected
- **evidence** - Specific feature values
- **recommended_action** - How to fix it

## Troubleshooting

### Port 5000 already in use
```bash
# Find and kill the process using port 5000
# Windows: Use Task Manager or:
netstat -ano | findstr :5000

# Or change port in app.py line ~260:
app.run(host="0.0.0.0", port=5001)
```

### ChromaDB install error
```bash
pip install --user --force-reinstall chromadb
```

### OpenRouter API errors
1. Check your API key is correct
2. Ensure it's set as `OPENROUTER_API_KEY` env var
3. Check you have credits at https://openrouter.ai
4. View logs in `app.py` error responses

### "No file selected" when uploading
- Ensure the file is actually a `.bin` file (ArduPilot format)
- Max file size is 500 MB
- Check network connectivity

## Next Steps

- Add authentication for multi-user access
- Export reports to PDF
- Webhook notifications for critical faults
- Mobile app for field analysis
- Dashboard with fleet metrics
- Alerts for anomalous flights

