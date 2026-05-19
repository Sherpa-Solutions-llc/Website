# Sherpa Solutions - System Directives

This document outlines the strict execution protocols and "Karpathy Skills" for any AI agent interacting with the Sherpa Solutions codebase.

## 1. Architectural Guardrails
- **DO NOT** modify the `server.py` database schema or FastAPI routing without explicit user approval.
- **DO NOT** execute system-level commands that alter global dependencies outside of the active `venv`.
- **Hybrid Architecture:** The frontend is served statically (HTML/Vanilla CSS/Vanilla JS) and communicates with `server.py` via REST. Keep these domains strictly separated.

## 2. Style & Aesthetics (The "Sherpa Method")
- **Frontend Rules:** 
  - Use Vanilla CSS. NO Tailwind unless explicitly requested.
  - Prioritize dark mode layouts, glassmorphism (`backdrop-filter`), and SVG micro-animations.
  - The primary brand color is Orange Sherpa (#FF7A00). Accent colors should complement dark backgrounds (#0f1115).
  - Do NOT use generic generic styling. Interfaces must feel premium and authoritative.

## 3. Security Protocols
- **API Protection:** Never bypass or remove rate limiters in `server.py`.
- **Data Privacy:** Do not output sensitive `.env` keys, even in scratchpads.
- **Headless Bot Defense:** All public-facing lead forms MUST implement behavioral validation.

## 4. Workflow (Agent Swarm)
- If tasked with audits, utilize `agent_audit.py` or `site_audit.py` and output results to `audit_results.txt`. Do not run raw requests blindly against production.
- Use the `scratch/` directory for temporary files.
