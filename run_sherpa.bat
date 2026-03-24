@echo off
echo Starting Sherpa Website on port 8001...
cd /d C:\Users\choos\Documents\Antigravity\sherpa_solutions
C:\Users\choos\Documents\Antigravity\agent_dashboard\venv\Scripts\python.exe -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
