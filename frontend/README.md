## AI Steelmaking Cockpit (Next.js)

This folder hosts the operator-facing UI for the ultra-advanced digital twin + PIML + NSGA-II + RL controller. It surfaces module health, orchestrator controls, and run history without leaving the browser.

### Tech Stack

- Next.js 14 (App Router, TypeScript)
- Tailwind CSS v4
- Custom API route that spawns the Python orchestrator for local experimentation

### Prerequisites

- The Python project in the repo root must be set up (`.venv` + dependencies installed).
- Optionally set `PYTHON_BIN` in `frontend/.env.local` to point at your Python interpreter (defaults to `../.venv/Scripts/python.exe` on Windows or `../.venv/bin/python` on POSIX).

### Running the UI

```bash
cd frontend
npm install        # already executed once during scaffolding
npm run dev        # launches http://localhost:3000
```

Navigate to `/dashboard` to trigger orchestrations or `/docs` for quick links to the Markdown specs.

> The `/api/orchestrate` route spawns the Python CLI directly and is meant for self-hosted development. Replace it with calls to a hardened FastAPI service before deploying to serverless platforms.
