# Sherpa Solutions LLC Website

Welcome to the official repository for the Sherpa Solutions LLC website.

## Overview
Sherpa Solutions LLC provides navigational expertise, operational infrastructure, and steadfast support to help enterprises scale in demanding landscapes. This website serves as the digital front door for our services and premium merchandise.

## Technologies Used
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: FastAPI (Python)
- **Database**: SQLite (managed via `database.py`)
- **Icons**: Font Awesome 6.4.0
- **Fonts**: Google Fonts (Outfit, Inter)

## Project Structure
- `index.html`: Homepage
- `services.html`: Detailed service offerings with interactive Sherpa Ascent pathing.
- `merchandise.html`: Hub for corporate apparel and executive accessories.
- `server.py`: FastAPI server handling routing and CMS integration.
- `cms.js`: Client-side script for dynamic content hydration from the backend.
- `styles.css`: Centralized design system and premium aesthetics.

## Local Development
1. Ensure Python 3.8+ is installed.
2. Install dependencies: `pip install fastapi uvicorn pydantic jinja2`
3. Start the server: `python -m uvicorn server:app --port 8001`
4. Visit `http://localhost:8000`

## Credits
© 2026 Sherpa Solutions LLC. All rights reserved.
