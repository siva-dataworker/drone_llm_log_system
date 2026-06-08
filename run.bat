@echo off
echo Starting Dronelog AI...
echo.
echo Installing dependencies...
pip install -q -r requirements.txt

echo.
echo Starting Flask server on http://localhost:5000
echo Press Ctrl+C to stop
echo.

python -m dronelog_ai.app
