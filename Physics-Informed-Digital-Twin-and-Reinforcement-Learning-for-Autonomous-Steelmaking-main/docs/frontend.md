# Frontend Architecture

The Next.js interface gives operators a modern cockpit for orchestrating the AI steelmaking pipeline.

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript, React Server Components)
- **Styling:** Tailwind CSS with utility-first tokens and gradients aligned to the research brand
- **Data Layer:** Fetch actions hitting local Next API routes which in turn spawn the Python orchestrator (dev mode)
- **State:** Client components using React hooks for orchestration runs, optimistic timelines, and form state

## Key Screens

1. **Landing Page (`/`)**
   - Narrative hero describing the four modules
   - Module grid summarizing Digital Twin, PIML, Optimizer, RL Agent
   - Quick links to docs and dashboard

2. **Operations Dashboard (`/dashboard`)**
   - Scenario configuration form (config file, rollout count, reward weights)
   - Live status timeline and artifact cards
   - Action button calling the orchestrator via `/api/orchestrate`
   - Recent run history with metrics & download links

3. **API Route (`/api/orchestrate`)**
   - Node route that finds the repo root, resolves the Python binary (`PYTHON_BIN` env or default `.venv/Scripts/python.exe`), and spawns `main.py orchestrate --config ...`
   - Streams stdout/stderr back in the JSON payload for UI display

## Local Dev Workflow

```bash
cd frontend
npm install        # already executed during scaffolding
npm run dev        # starts Next dev server on http://localhost:3000
```

Before pressing "Run Orchestrator" in the dashboard, keep the Python virtual environment ready (`.venv` at repo root) and ensure dependencies are installed. If your Python binary differs, set `PYTHON_BIN` in `.env.local` inside `frontend/`.

## Deployment Notes

- The API route relies on spawning local Python processes, so it is meant for on-premise or self-hosted deployments. For cloud hosting (e.g., Vercel) replace it with calls to a long-running FastAPI service hosting the orchestrator.
- Sensitive configs and logs should be served via authenticated APIs—add middleware/auth providers before production use.
