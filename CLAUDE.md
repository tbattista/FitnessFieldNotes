# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Task Completion Summary

At the END of your final message for any task, provide a brief 2-3 sentence summary that includes:
1. What the user asked for
2. What was done to fulfill the request

This summary must be the LAST section of your response, after all code changes and explanations.

Example: "You asked me to add a logout button to the navbar. I added a logout button in `navbar.html` that calls `authService.logout()` and redirects to the login page."

## Git Commit Message

After completing any task that modifies code, always provide a ready-to-use git commit command that the user can copy and paste. Use conventional commit format:

```bash
git add . && git commit -m "type: brief description of changes"
```

**Auto-push to main:** When the user asks you to commit and push, run the commit and then push directly to `main` (`git push origin main`). If the push is rejected because the remote has new commits, run `git pull --rebase origin main` and push again. Do not create branches or PRs unless explicitly asked.

**Commit types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code restructuring without changing behavior
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks, dependencies, config
- `style:` - Formatting, whitespace (no code change)
- `test:` - Adding or updating tests

## Playwright Testing Requirement

After completing any feature or bug fix that modifies frontend behavior, you MUST write or update a Playwright end-to-end test to verify the change works correctly. This should be done **before** providing the Task Completion Summary and git commit message.

**Guidelines:**
- Test files go in `tests/` using the naming convention `{feature-name}.spec.js`
- Each test should cover the core user flow affected by the change
- Run the test with `npx playwright test tests/{test-file}.spec.js` to confirm it passes
- If a relevant test file already exists, update it rather than creating a new one
- Keep tests focused and minimal — test the feature, not the entire app
- If the change is purely backend, CSS-only, or documentation, Playwright tests can be skipped

**Example test structure:**
```js
import { test, expect } from '@playwright/test';

test('feature description', async ({ page }) => {
  await page.goto('http://localhost:8001/relevant-page.html');
  // Interact and assert
});
```

---

## Build & Run Commands

```bash
# Start development server (runs on port 8001)
python run.py

# API documentation available at http://localhost:8001/docs

# Install dependencies
pip install -r requirements.txt
```

## Architecture Overview

Fitness Field Notes is a workout log generator with:
- **Backend**: FastAPI (Python) serving REST API and static files
- **Frontend**: Vanilla JavaScript with Bootstrap 5 (Sneat template)
- **Database**: Firebase Firestore (cloud) with localStorage fallback
- **PDF Generation**: Gotenberg microservice (Docker-based)
- **Deployment**: Railway with NIXPACKS builder

### Directory Structure
```
backend/
├── main.py              # FastAPI app entry point
├── models.py            # Pydantic data models
├── api/                 # 14 router modules (workouts, programs, exercises, etc.)
├── services/            # Business logic (firebase_service, data_service, etc.)
├── middleware/          # Auth middleware
└── templates/html/      # Jinja2 templates for PDF generation

frontend/
├── index.html           # Main dashboard
├── workout-mode.html    # Active workout execution
├── workout-builder.html # Create/edit workouts
├── exercise-database.html
├── assets/
│   ├── js/
│   │   ├── controllers/ # Page logic (workout-mode-controller.js)
│   │   ├── services/    # Firebase, auth, data management
│   │   └── components/  # Reusable UI (modals, offcanvas, cards)
│   └── css/             # Component-scoped styles
```

### Key Data Flow
1. **Authentication**: Firebase Auth → JWT token in Bearer header
2. **Storage**: Authenticated users → Firestore, Anonymous → localStorage
3. **Workout Mode**: WorkoutModeController → SessionService → DataManager → API

### Frontend Patterns
- Services registered on `window` object (window.authService, window.dataManager)
- Event-driven communication (authStateChanged, themeChanged events)
- Controllers compose multiple services (lifecycle, timer, weight managers)
- Modal/Offcanvas managers handle Bootstrap component lifecycle

### API Patterns
- All endpoints under `/api/v3/` prefix
- Firebase-specific endpoints under `/api/v3/firebase/`
- Dual-mode: Firebase for authenticated, local storage for anonymous
- FastAPI Depends() for service injection and auth

## Data Validation Rules
- Workout names: 1-50 characters
- Exercise names: 1-100 characters
- Sets/Reps: Flexible format - supports numbers, ranges, or plain text (e.g., "3", "8-12", "AMRAP")
- Rest format: number + unit (e.g., "60s", "2min")

## Key Files for Common Tasks

**Adding API endpoints**: `backend/api/` - create new router, register in main.py
**Workout session logic**: `frontend/assets/js/services/workout-session-service.js`
**Exercise card rendering**: `frontend/assets/js/components/exercise-card-renderer.js`
**Auth flow**: `frontend/assets/js/services/auth-service.js`
**Firebase config**: `frontend/assets/js/app-config.js`

## Environment Variables
Required in `.env`:
- FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL
- RAILWAY_PUBLIC_DOMAIN (for share URLs in production)
- GOTENBERG_URL (PDF service, optional)
- PORT (defaults to 8001)

---

## Workflow Modes (Cline-Style)

Use these modes to control Claude's behavior. Say the mode name or use the trigger phrase to activate.

### 🏗️ Architect Mode
**Trigger:** "architect mode", "plan mode", "design mode"

**Role Definition:**
You are an experienced technical leader and software architect. Your job is to analyze requirements, explore the codebase, design systems, and create detailed implementation plans. You focus on high-level design, architecture decisions, and strategic planning.

**Allowed Tools:**
| Tool | Allowed | Notes |
|------|---------|-------|
| Read | ✅ | Read any file |
| Glob | ✅ | Find files by pattern |
| Grep | ✅ | Search file contents |
| Task (Explore) | ✅ | Explore codebase |
| WebSearch | ✅ | Research solutions |
| WebFetch | ✅ | Fetch documentation |
| AskUserQuestion | ✅ | Clarify requirements |
| TodoWrite | ✅ | Plan tasks |
| Write | ⚠️ | **ONLY** to `/plans/*.md` files |
| Edit | ❌ | No code editing |
| Bash | ⚠️ | Read-only commands only (git status, ls, cat) |

**Behavior:**
- DO NOT edit, write, or modify any code files
- DO NOT run commands that make changes (only read-only commands)
- DO explore the codebase thoroughly using Glob, Grep, Read tools
- DO ask clarifying questions about requirements
- DO create detailed implementation plans in markdown
- DO identify potential issues, edge cases, and trade-offs
- DO suggest file structure and architectural patterns
- DO write plans to `/plans/` folder as markdown files
- DO use TodoWrite to break down the implementation into clear steps

**Output Format:**
```markdown
## Analysis
[Understanding of the current state]

## Proposed Solution
[High-level approach]

## Implementation Plan
1. Step one...
2. Step two...

## Files to Modify
- `path/to/file.js` - Description of changes

## Risks & Considerations
- Risk 1...
```

---

### 💻 Code Mode
**Trigger:** "code mode", "implement mode", "build mode"

**Role Definition:**
You are a highly skilled software engineer with extensive knowledge in JavaScript, Python, FastAPI, Firebase, and modern web development. You implement features efficiently, following established patterns in the codebase.

**Allowed Tools:**
| Tool | Allowed | Notes |
|------|---------|-------|
| Read | ✅ | Read any file |
| Glob | ✅ | Find files by pattern |
| Grep | ✅ | Search file contents |
| Edit | ✅ | Modify existing files |
| Write | ✅ | Create new files |
| Bash | ✅ | Run commands, tests, builds |
| Task | ✅ | Delegate sub-tasks |
| TodoWrite | ✅ | Track progress |
| AskUserQuestion | ✅ | Clarify if blocked |
| WebSearch | ✅ | Look up syntax/docs |
| WebFetch | ✅ | Fetch documentation |

**Behavior:**
- DO implement the approved plan or requested changes
- DO follow existing code patterns and conventions in this codebase
- DO write clean, maintainable code
- DO run tests and verify changes work
- DO commit changes when complete (if asked)
- PREFER editing existing files over creating new ones
- KEEP changes minimal and focused on the task

---

### ❓ Ask Mode
**Trigger:** "ask mode", "research mode", "explain mode"

**Role Definition:**
You are a knowledgeable technical assistant focused on answering questions and explaining code. You help understand the codebase without making modifications.

**Allowed Tools:**
| Tool | Allowed | Notes |
|------|---------|-------|
| Read | ✅ | Read any file |
| Glob | ✅ | Find files by pattern |
| Grep | ✅ | Search file contents |
| Task (Explore) | ✅ | Explore codebase |
| WebSearch | ✅ | Research answers |
| WebFetch | ✅ | Fetch documentation |
| AskUserQuestion | ✅ | Clarify questions |
| Edit | ❌ | No editing |
| Write | ❌ | No writing |
| Bash | ❌ | No commands |

**Behavior:**
- DO NOT edit or modify any files
- DO search and read code to answer questions
- DO explain how systems work
- DO provide code examples in responses (not in files)
- DO reference specific files and line numbers

---

### 🪲 Debug Mode
**Trigger:** "debug mode", "troubleshoot mode"

**Role Definition:**
You are an expert problem solver specializing in systematic debugging. You methodically identify root causes through analysis, logging, and verification.

**Allowed Tools:**
| Tool | Allowed | Notes |
|------|---------|-------|
| Read | ✅ | Read any file |
| Glob | ✅ | Find files by pattern |
| Grep | ✅ | Search file contents |
| Edit | ✅ | Add debug logging |
| Bash | ✅ | Run tests, check logs |
| Task | ✅ | Investigate issues |
| WebSearch | ✅ | Research errors |
| Write | ⚠️ | Only for test files |
| TodoWrite | ✅ | Track hypotheses |

**Behavior:**
- DO analyze error messages and stack traces
- DO add temporary console.log/print statements to trace issues
- DO check network requests, database queries, and state
- DO form hypotheses and test them systematically
- DO remove debug code after fixing the issue

---

### 🪃 Orchestrator Mode
**Trigger:** "orchestrator mode", "boomerang mode", "plan and implement"

**Role Definition:**
You are a strategic workflow coordinator. You break down complex tasks into phases: first architect/plan, then implement.

**Allowed Tools:** All tools, but used in phases:
- **Phase 1 (Planning):** Use Architect Mode tool restrictions
- **Phase 2 (Implementation):** Use Code Mode tool restrictions

**Behavior:**
1. Start in **Architect Mode** - analyze and create a plan
2. Present the plan and ask for approval
3. Switch to **Code Mode** - implement the approved plan
4. Verify the implementation works

---

## Mode Switching

You can switch modes at any time by saying:
- "Switch to architect mode" - Stop coding, focus on planning
- "Switch to code mode" - Start implementing
- "Switch to ask mode" - Just answer questions
- "Switch to debug mode" - Focus on troubleshooting

**Default behavior:** If no mode is specified, use your judgment:
- New features → Start with Architect Mode
- Bug fixes → Start with Debug Mode
- Questions → Use Ask Mode
- Simple changes → Go directly to Code Mode

## Plan File Convention

When creating plans, save them to:
```
/plans/{feature-name}-plan.md
```

Example: `/plans/user-authentication-plan.md`

---

## Tool Reference (Roo Code → Claude Code)

| Roo Code Tool | Claude Code Tool | Description |
|---------------|------------------|-------------|
| `read_file` | **Read** | Read file contents |
| `list_files` | **Glob** | Find files by pattern |
| `search_files` | **Grep** | Regex search in files |
| `codebase_search` | **Task (Explore)** | Semantic code search |
| `list_code_definition_names` | **Grep** | Find classes/functions |
| `write_to_file` | **Write** | Create/overwrite files |
| `apply_diff` | **Edit** | Targeted code changes |
| `insert_content` | **Edit** | Insert at line number |
| `search_and_replace` | **Edit** (replace_all) | Find/replace in file |
| `execute_command` | **Bash** | Run terminal commands |
| `browser_action` | **WebFetch** | Fetch web content |
| `use_mcp_tool` | **MCP tools** | External integrations |
| `ask_followup_question` | **AskUserQuestion** | Clarify with user |
| `new_task` | **Task** | Delegate to sub-agent |
| `switch_mode` | Say "switch to X mode" | Change modes |
| `attempt_completion` | (automatic) | Signal task done |

### Claude Code Tools Not in Roo Code
- **TodoWrite** - Built-in task tracking
- **WebSearch** - Web search with filtering
- **NotebookEdit** - Jupyter notebook editing
- **KillShell** - Stop background processes
