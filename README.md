# Fitness Field Notes

Your digital gym notebook. A minimalist workout log for lifters who just want to write down what they did.

Build programs, track sessions, and see your progress — no social feeds, no gamification, just your training data.

**Live at [fitnessfieldnotes.com](https://fitnessfieldnotes.com)**

## Features

- **Workout Builder** — Create and customize workout templates with exercises, sets, reps, and rest periods
- **Live Session Tracking** — Execute workouts in real-time with a guided session mode
- **AI-Powered Logging** — Paste or type your workout in plain text and let AI parse it into structured data
- **Exercise Database** — Browse exercises with GIF demonstrations, or add your own
- **Program Manager** — Build multi-week training programs from your workout templates
- **Public Workout Library** — Discover and share community workout templates
- **Import Anything** — Parse workouts from PDF, CSV, JSON, images, or plain text
- **Export & Share** — Share workouts via link, export as text/image, or print
- **Workout History & PRs** — View past sessions and track personal records
- **Works Without an Account** — Anonymous users get localStorage-backed tracking with no sign-up required

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI (Python) |
| Frontend | Vanilla JavaScript, Bootstrap 5 (Sneat template) |
| Database | Firebase Firestore (cloud) / localStorage (anonymous fallback) |
| Auth | Firebase Authentication |
| AI | Google Generative AI |
| PDF Export | Gotenberg (Docker microservice) |
| Testing | Playwright (E2E) |
| Deployment | Railway (NIXPACKS) |

## Screenshots

See [docs/user-flows/](docs/user-flows/) for detailed user flow screenshots across desktop and mobile.

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+ (for running tests only)
- A Firebase project with Firestore and Authentication enabled

### Setup

```bash
# Clone the repo
git clone https://github.com/tbattista/FitnessFieldNotes.git
cd FitnessFieldNotes

# Install Python dependencies
pip install -r requirements.txt

# Copy environment template and fill in your values
cp .env.example .env

# Start the dev server
python run.py
```

The app runs at **http://localhost:8001** and API docs are at **http://localhost:8001/docs**.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | Yes | Service account private key |
| `FIREBASE_CLIENT_EMAIL` | Yes | Service account email |
| `ENVIRONMENT` | No | `development` or `production` (default: development) |
| `PORT` | No | Server port (default: 8001) |
| `RAILWAY_PUBLIC_DOMAIN` | No | Public domain for share URLs |
| `GOTENBERG_URL` | No | Gotenberg service URL for PDF generation |

## Project Structure

```
backend/
├── main.py              # FastAPI entry point
├── models/              # Pydantic data models (split by domain)
│   ├── workout.py       # Workout & exercise models
│   ├── session.py       # Session tracking models
│   ├── program.py       # Program models
│   └── ...              # Additional domain models
├── api/                 # Route handlers (~20 routers)
├── services/            # Business logic & Firebase ops
│   └── parsers/         # AI, PDF, CSV, JSON, text, image parsers
├── middleware/           # Auth middleware
├── scripts/             # Seed data & maintenance utilities
└── templates/html/      # Jinja2 templates for PDF export

frontend/
├── index.html           # Main dashboard
├── launch.html          # Marketing landing page
├── workout-builder.html # Create/edit workouts
├── workout-mode.html    # Live session tracking
├── assets/
│   ├── js/
│   │   ├── controllers/ # Page-level logic
│   │   ├── services/    # Auth, data, Firebase services
│   │   └── components/  # Reusable UI components
│   └── css/             # Component-scoped styles

tests/                   # Playwright E2E tests
scripts/                 # Utility scripts (screenshots, data tools)
docs/user-flows/         # User flow documentation & screenshots
gotenberg-service/       # Gotenberg PDF microservice (Docker/Railway)
```

## Testing

```bash
# Install Playwright
npm install
npx playwright install

# Run all tests
npm test

# Specific test suites
npm run test:smoke       # Quick smoke tests
npm run test:api         # API health checks
npm run test:e2e         # Full workflow tests
npm run test:desktop     # Desktop browser tests
npm run test:mobile      # Mobile browser tests
```

## API

All endpoints are under `/api/v3/`. Firebase-specific endpoints use `/api/v3/firebase/`.

Authentication uses Bearer tokens (Firebase JWT). Anonymous users interact with localStorage on the client side — no API calls needed.

Full interactive docs available at `/docs` when running locally.

## Deployment

Deployed on [Railway](https://railway.app) using the NIXPACKS builder.

```bash
# Health check endpoint
GET /api/health
```

## License

All rights reserved.
