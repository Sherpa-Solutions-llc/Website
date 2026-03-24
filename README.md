# Sherpa Solutions: Software Revision 2

Welcome to the official repository for the **Sherpa Solutions LLC** platform.

![Software Revision 2](https://img.shields.io/badge/Revision-2.0-orange?style=for-the-badge) ![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat&logo=fastapi) ![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=flat&logo=railway)

## Overview
Sherpa Solutions LLC provides navigational expertise, operational infrastructure, and steadfast support to help enterprises scale in demanding landscapes. **Software Revision 2** completely scales out our interactive global capability, introducing a hybrid static-dynamic hosting architecture to power the real-time *Live Earth* intelligence dashboard.

## Live Earth Architecture (Rev 2)
The flagship feature of Revision 2 is the **Live Earth** engine: a hyper-optimized CesiumJS/Three.js 3D globe visualization that streams live global data.
* **Aggregator/Cache Backbone:** The FastAPI backend securely pre-fetches 15,000+ satellites (Celestrak) and active sea vessels (DigiTraffic) into background memory/SQLite to shield public APIs from our frontend traffic.
* **Asynchronous Priming:** The server handles massive data ingestion transparently without blocking healthchecks.
* **Hybrid Deployment:** The React/Vanilla-JS frontend is statically deployed to GitHub Pages (`sherpa-solutions-llc.com`) for unlimited edge caching, while the dynamic Data Cache is deployed to Railway (`sherpa-solutions-api-production.up.railway.app`).

## Development Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript, CesiumJS
- **Backend & API**: FastAPI (Python), Uvicorn, asyncio background tasks
- **Database**: SQLite (managed via local caches)
- **Deployment**: `github_final_upload.py` for automated file hashing, JS route rewriting, and CMS baking.

## Local Development
1. Ensure Python 3.11+ is installed.
2. Install dependencies: `pip install -r requirements.txt`
3. Prime the server: `python -m uvicorn server:app --port 8000`
4. The backend will automatically fetch real-time satellites and shipping vessels upon boot.

## Credits
© 2026 Sherpa Solutions LLC. All rights reserved.
