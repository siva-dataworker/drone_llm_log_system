from flask import Flask, render_template, request, jsonify
import os
import json
import uuid
from datetime import datetime
from werkzeug.utils import secure_filename

from dronelog_ai.bin_to_csv import bin_to_csv
from dronelog_ai.analyzer import extract_features, run_rca
from dronelog_ai.explain import generate_explanation
from dronelog_ai.database import (
    init_sqlite_db, save_flight_analysis, query_sqlite,
    search_chromadb, get_fleet_summary
)

# Get absolute paths based on current working directory
cwd = os.getcwd()
template_folder = os.path.join(cwd, 'dronelog_ai', 'templates')
static_folder = os.path.join(cwd, 'dronelog_ai', 'static')

app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)

# Config
UPLOAD_FOLDER = "dronelog_ai/uploads"
ALLOWED_EXTENSIONS = {"bin"}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
init_sqlite_db()


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# ────────────────────────────────────────────────────────
# ROUTES
# ────────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve main page."""
    return render_template("index.html")


@app.route("/api/upload-bin", methods=["POST"])
def upload_bin():
    """
    Upload and process a .bin flight log file.
    Returns: Flight analysis with report
    """

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Only .bin files allowed"}), 400

    try:
        # Save uploaded file
        flight_id = f"flight_{uuid.uuid4().hex[:8]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        filename = secure_filename(file.filename)
        bin_path = os.path.join(app.config["UPLOAD_FOLDER"], f"{flight_id}.bin")
        file.save(bin_path)

        # Step 1: Convert .bin to CSV
        csv_path = os.path.join("dronelog_ai/csv_files", f"{flight_id}.csv")
        bin_to_csv(bin_path, csv_path)

        # Step 2: Extract features and run RCA
        import pandas as pd
        df = pd.read_csv(csv_path)
        features = extract_features(df)
        faults = run_rca(features)

        # Step 3: Generate LLM explanation
        explanation = generate_explanation(features, faults)

        # Step 4: Save to both databases
        db_result = save_flight_analysis(
            flight_id=flight_id,
            features=features,
            faults=faults,
            report=explanation["report"]
        )

        return jsonify({
            "success": True,
            "flight_id": flight_id,
            "original_filename": filename,
            "faults": faults,
            "report": explanation["report"],
            "features": {k: float(v) if isinstance(v, (int, float)) else str(v)
                        for k, v in features.items()},
            "db_status": db_result["status"],
            "db_message": db_result["message"]
        })

    except Exception as e:
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500


@app.route("/api/reports", methods=["GET"])
def get_reports():
    """
    Get all maintenance reports (for Q&A sidebar).
    Query params: limit (default 20)
    """

    limit = request.args.get("limit", 20, type=int)

    try:
        records = query_sqlite(limit=limit)

        reports = []
        for rec in records:
            reports.append({
                "flight_id": rec["flight_id"],
                "timestamp": rec["timestamp"],
                "duration_s": rec["duration_s"],
                "fault_count": rec["fault_count"],
                "headline": f"Flight {rec['flight_id']} - {rec['fault_count']} issue{'s' if rec['fault_count'] != 1 else ''}"
            })

        return jsonify({
            "success": True,
            "count": len(reports),
            "reports": reports
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/report/<flight_id>", methods=["GET"])
def get_report_detail(flight_id):
    """Get full report for a specific flight."""

    try:
        records = query_sqlite(filters={"flight_id": flight_id}, limit=1)

        if not records:
            return jsonify({"error": "Flight not found"}), 404

        rec = records[0]

        # Get the full report from ChromaDB
        search_results = search_chromadb(f"flight {flight_id}", n_results=1)

        report_text = ""
        if search_results and "document" in search_results[0]:
            report_text = search_results[0]["document"]

        return jsonify({
            "success": True,
            "flight_id": rec["flight_id"],
            "timestamp": rec["timestamp"],
            "duration_s": rec["duration_s"],
            "fault_count": rec["fault_count"],
            "faults": rec["fault_list"],
            "report": report_text,
            "features": {
                "motor_asym_pct": rec["motor_asym_pct"],
                "vib_peak": rec["vib_peak"],
                "vib_mean": rec["vib_mean"],
                "bat_drop_v": rec["bat_drop_v"],
                "hdop_max": rec["hdop_max"],
                "nsats_min": rec["nsats_min"]
            }
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/search-rag", methods=["POST"])
def search_rag():
    """
    RAG search: user question → ChromaDB semantic search → LLM answer.

    Request body:
    {
        "query": "user question",
        "flight_id": "optional - filter to specific flight",
        "n_results": "optional - number of similar reports (default 3)"
    }
    """

    data = request.get_json()

    if not data or "query" not in data:
        return jsonify({"error": "query required"}), 400

    query = data["query"]
    n_results = data.get("n_results", 3)
    flight_id = data.get("flight_id")

    try:
        # Step 1: Classify user intent (GREETING or SEARCH)
        from dronelog_ai.explain import classify_user_intent, generate_rag_answer
        intent = classify_user_intent(query)
        is_general_chat = (intent == "GREETING")

        # Step 2: Run RAG pipeline only for SEARCH intent
        search_results = []
        context_reports = ""
        relevant_flights = []
        relevance_scores = []

        if not is_general_chat:
            # Only search ChromaDB for non-greeting queries
            search_results = search_chromadb(query, n_results=n_results)

            if search_results and "error" not in search_results[0]:
                # Filter by flight_id if specified
                if flight_id:
                    search_results = [r for r in search_results if r["flight_id"] == flight_id]

                # Build context from retrieved reports
                if search_results:
                    context_reports = "\n---\n".join([
                        f"Flight {r['flight_id']} ({r['metadata']['timestamp']}):\n{r['document']}"
                        for r in search_results
                    ])
                    relevant_flights = [r["flight_id"] for r in search_results]
                    relevance_scores = [r["relevance"] for r in search_results]

        # Step 3: Generate LLM answer (with or without context)
        rag_result = generate_rag_answer(query, context_reports, is_general_chat=is_general_chat)

        if rag_result["status"] != "success":
            return jsonify({
                "success": False,
                "error": rag_result["answer"]
            }), 500

        return jsonify({
            "success": True,
            "query": query,
            "answer": rag_result["answer"],
            "relevant_flights": relevant_flights,
            "relevance_scores": relevance_scores,
            "model": rag_result["model"],
            "is_general_chat": is_general_chat,
            "intent": intent
        })

    except Exception as e:
        return jsonify({"error": f"RAG search failed: {str(e)}"}), 500


@app.route("/api/fleet-summary", methods=["GET"])
def fleet_summary():
    """Get fleet statistics."""

    try:
        summary = get_fleet_summary()
        return jsonify({"success": True, "summary": summary})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({"error": f"File too large. Max size: {MAX_FILE_SIZE / 1024 / 1024:.0f} MB"}), 413


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
