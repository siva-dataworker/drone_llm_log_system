import os
import requests
import json
from typing import Dict, List

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions"


def classify_user_intent(query: str) -> str:
    """
    Use LLM to classify user intent as GREETING or SEARCH.
    Returns: "GREETING" or "SEARCH"
    """

    classification_prompt = f"""Classify this message as GREETING or SEARCH.
GREETING: hello, hi, thanks, how are you, who are you, what can you do, help me
SEARCH: questions about data, flights, maintenance, issues, performance, comparisons

Message: "{query}"

Answer only: GREETING or SEARCH"""

    payload = {
        "model": "openrouter/auto",  # Auto-route to best available model
        "messages": [{"role": "user", "content": classification_prompt}],
        "temperature": 0,
        "max_tokens": 20,
    }

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "Dronelog AI",
    }

    try:
        response = requests.post(OPENROUTER_BASE_URL, json=payload, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()

        classification = data["choices"][0]["message"]["content"].strip().upper()

        # Validate response
        if "GREETING" in classification:
            return "GREETING"
        elif "SEARCH" in classification:
            return "SEARCH"
        else:
            return "SEARCH"

    except Exception as e:
        # Fallback: use simple keyword matching as backup
        greeting_keywords = ["hi", "hello", "hey", "thanks", "thank you", "how are you", "who are you", "what can you do"]
        if any(kw in query.lower() for kw in greeting_keywords):
            return "GREETING"
        return "SEARCH"


def format_analysis_for_llm(features: Dict, faults: List[Dict]) -> str:
    """Format extracted features and detected faults into a prompt for the LLM."""

    feature_text = "EXTRACTED FEATURES:\n"
    feature_text += f"  Flight Duration: {features.get('duration_s', 0)}s\n"
    feature_text += f"  Total Data Points: {features.get('total_rows', 0)}\n"
    feature_text += "\nMotor Performance:\n"
    feature_text += f"  Motor 3 Asymmetry: {features.get('motor_asym_pct', 0)}%\n"
    feature_text += f"  Motor 3 Mean PWM: {features.get('motor3_mean', 0)}\n"
    feature_text += f"  Motor 3 StdDev: {features.get('motor3_std', 0)}\n"
    feature_text += f"  Max Motor Difference: {features.get('motor_max_diff', 0)}\n"
    feature_text += "\nVibration Metrics:\n"
    feature_text += f"  Peak Vibration: {features.get('vib_peak', 0)} m/s²\n"
    feature_text += f"  Mean Vibration: {features.get('vib_mean', 0)} m/s²\n"
    feature_text += f"  Vibration Trend (rise): {features.get('vib_trend', 0)} m/s²\n"
    feature_text += "\nBattery Status:\n"
    feature_text += f"  Start Voltage: {features.get('bat_volt_start', 0)}V\n"
    feature_text += f"  End Voltage: {features.get('bat_volt_end', 0)}V\n"
    feature_text += f"  Total Voltage Drop: {features.get('bat_drop_v', 0)}V\n"
    feature_text += f"  Discharge Rate: {features.get('bat_rate_vs', 0)} V/s\n"
    feature_text += f"  Peak Current: {features.get('bat_curr_peak', 0)}A\n"
    feature_text += f"  Mean Current: {features.get('bat_curr_mean', 0)}A\n"
    feature_text += "\nGPS & Navigation:\n"
    feature_text += f"  Max HDOP: {features.get('hdop_max', 0)}\n"
    feature_text += f"  Mean HDOP: {features.get('hdop_mean', 0)}\n"
    feature_text += f"  Min Satellites: {features.get('nsats_min', 0)}\n"
    feature_text += "\nAttitude Stability:\n"
    feature_text += f"  Roll StdDev: {features.get('roll_std', 0)}°\n"
    feature_text += f"  Pitch StdDev: {features.get('pitch_std', 0)}°\n"
    feature_text += f"  Max Roll: {features.get('roll_max', 0)}°\n"

    fault_text = "DETECTED FAULTS:\n"
    if faults:
        for i, fault in enumerate(faults, 1):
            fault_text += f"\n{i}. [{fault['severity']}] {fault['type']}\n"
            fault_text += f"   Evidence: {fault['description']}\n"
            fault_text += f"   Action: {fault['recommended_action']}\n"
    else:
        fault_text += "None detected.\n"

    prompt = f"""{feature_text}\n{fault_text}

Based on the above drone flight telemetry, generate a concise maintenance report that:
1. Summarizes the overall health of the aircraft
2. Prioritizes actions by severity (HIGH faults first)
3. Provides specific, actionable maintenance steps
4. Notes any systems performing nominally

Format as plain English paragraphs suitable for a maintenance technician."""

    return prompt


def call_openrouter_api(prompt: str) -> Dict:
    """Call OpenRouter API with a prompt and return response."""
    payload = {
        "model": "openrouter/auto",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_tokens": 1000,
    }

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": "http://localhost:8501",
        "X-Title": "Dronelog AI",
    }

    try:
        response = requests.post(OPENROUTER_BASE_URL, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()

        if "error" in data:
            return {
                "content": f"Error from API: {data['error'].get('message', 'Unknown error')}",
                "model": None,
                "status": "error"
            }

        content = data["choices"][0]["message"]["content"]
        model = data.get("model", "unknown")

        return {
            "content": content,
            "model": model,
            "status": "success"
        }

    except requests.exceptions.RequestException as e:
        return {
            "content": f"Request failed: {str(e)}",
            "model": None,
            "status": "error"
        }
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        return {
            "content": f"Response parsing failed: {str(e)}",
            "model": None,
            "status": "error"
        }


def generate_explanation(features: Dict, faults: List[Dict]) -> Dict:
    """
    Send features and faults to OpenRouter API and get plain-English explanation.

    Returns:
        Dict with 'report' (str) and 'model_used' (str), or error info.
    """

    prompt = format_analysis_for_llm(features, faults)
    result = call_openrouter_api(prompt)

    return {
        "report": result["content"],
        "model_used": result["model"],
        "status": result["status"]
    }


def generate_rag_answer(query: str, context_reports: str, is_general_chat: bool = False) -> Dict:
    """
    Generate RAG answer using retrieved flight reports as context.

    Args:
        query: User's question
        context_reports: Concatenated relevant flight reports
        is_general_chat: If True, handle as general conversation (not flight-specific)

    Returns:
        Dict with 'answer', 'model', and 'status'
    """

    if is_general_chat or not context_reports.strip():
        # Handle general conversation (greetings, help requests, etc.)
        rag_prompt = f"""You are a helpful drone maintenance assistant. The user has asked you a question about their drone flight analysis system.

User Message: {query}

If this is a greeting (hi, hello, etc.), respond warmly and offer to help with drone maintenance questions.
If they're asking for help, explain how to use the system.
Always be helpful and professional."""
    else:
        # Handle flight-specific questions with context
        rag_prompt = f"""You are a drone maintenance expert. Answer the user's question based on the flight maintenance reports provided.

User Question: {query}

Relevant Flight Reports:
{context_reports}

Provide a clear, specific answer based on these reports. If comparing multiple flights, highlight differences and patterns. Be specific and cite the flights you're referencing."""

    result = call_openrouter_api(rag_prompt)

    return {
        "answer": result["content"],
        "model": result["model"],
        "status": result["status"]
    }


# ── Quick test ────────────────────────────────────────
if __name__ == "__main__":
    import pandas as pd
    from dronelog_ai.analyzer import extract_features, run_rca

    df = pd.read_csv(r"dronelog_ai\csv_files\flight7.csv")
    features = extract_features(df)
    faults = run_rca(features)

    print("\n── GENERATING EXPLANATION ──")
    result = generate_explanation(features, faults)

    print(f"Status: {result['status']}")
    print(f"Model: {result['model_used']}\n")
    print("MAINTENANCE REPORT:")
    print("-" * 60)
    print(result['report'])
