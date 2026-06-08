# 🚁 Dronelog AI - ArduPilot Flight Log Analysis & Q&A

Intelligent flight log analysis system that converts ArduPilot binary logs to structured data, detects faults using rule-based RCA, and provides LLM-powered maintenance insights with RAG-based Q&A.

## ✨ Features

- **Flight Log Analysis**: Converts `.bin` → CSV, extracts 20 features, runs 8 RCA checks
- **LLM Maintenance Reports**: Claude generates plain-English maintenance recommendations
- **RAG Q&A**: Semantic search + context-aware answers based on flight history
- **Dual Databases**: SQLite (structured) + ChromaDB (vector embeddings)
- **Dark Theme UI**: Black + Orange Perplexity-style interface

## 🚀 Quick Start

```bash
git clone https://github.com/siva-dataworker/drone_log_ai.git
cd drone_log_ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export OPENROUTER_API_KEY="sk-or-v1-YOUR_KEY"
python -m dronelog_ai.app
```

Visit: http://localhost:5000

## 📁 Project Structure

```
dronelog_ai/
├── bin_to_csv.py          # Binary log → CSV
├── analyzer.py            # Feature extraction + RCA
├── explain.py             # LLM integration
├── database.py            # SQLite + ChromaDB
├── app.py                 # Flask API
├── templates/index.html   # Web UI
└── static/js/main.js      # Frontend logic
```

## 🔑 Environment

```bash
export OPENROUTER_API_KEY="sk-or-v1-YOUR_KEY"
```

## 📚 Tech Stack

PyMAVLink • Pandas • NumPy • SciPy • Claude LLM • ChromaDB • SQLite • Flask • Tailwind CSS

## 📖 Deployment

For VPS deployment, see DEPLOYMENT.md

---

**Author**: Siva Dataworker
