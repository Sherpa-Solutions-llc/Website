@echo off
echo ===================================================
echo [ SHERPA OSINT MODULE ]
echo Booting Dashboards via Absolute Python Path...
echo ===================================================

cd /d "C:\Users\choos\Documents\Antigravity\sherpa_solutions\serpapi_tools"
set "PY_PATH=C:\Users\choos\AppData\Local\Programs\Python\Python312\python.exe"

echo Launching unified Streamlit Hub...
start "Sherpa Dashboards (Multipage)" cmd /k ""%PY_PATH%" -m streamlit run Home.py --server.port 8501 --server.headless true"

exit
