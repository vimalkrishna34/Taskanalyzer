# Smart Task Analyzer

A powerful task management tool that uses intelligent algorithms to prioritize your workload. It goes beyond simple to‑do lists by analyzing task importance, urgency, effort, and dependencies to suggest the best order of execution.

---

## Table of contents

* Project Overview
* Features
* Tech Stack
* Getting Started

  * Prerequisites
  * Backend setup
  * Frontend setup
* API

  * Data model
  * Endpoints
  * Sample requests / responses
* Priority Scoring Algorithm (detailed)
* Design decisions & trade‑offs
* Handling edge cases
* Frontend UI / UX notes
* Tests
* Time breakdown (approx.)
* Bonus challenges attempted
* Future improvements
* Contributing
* License

---

## Project Overview

**Smart Task Analyzer** is a mini application built as a technical assessment for a Software Development Intern position. The app scores and ranks tasks using a configurable algorithm that balances urgency, importance, effort, and dependencies. The goal is to help users identify which tasks to tackle first and why.

This repository is structured to be runnable locally (Django backend + static frontend) and focuses on algorithm design, code quality, and clear documentation of choices.

---

## Features

* Intelligent prioritization strategies:

  * Smart Balance (default)
  * Fastest Wins
  * High Impact
  * Deadline Driven
* Eisenhower Matrix View (visualization)
* Dependency management with cycle detection and reporting
* Date intelligence that treats business days specially (optional toggle)
* REST JSON API for analyze/suggest endpoints
* Simple responsive frontend (HTML / CSS / vanilla JS)

---

## Tech Stack

* Backend: Python 3.8+, Django 4.x
* Frontend: HTML5, CSS3, Vanilla JavaScript
* Database: SQLite (default Django)
* Testing: pytest / Django test framework (unit tests for scoring)

---

## Getting Started

### Prerequisites

* Python 3.8+
* pip
* Node.js (optional, only if you want a dev static server)

### Backend setup

1. `cd backend`
2. `pip install -r requirements.txt`
3. `python manage.py migrate`
4. `python manage.py runserver` (backend runs at `http://localhost:8000`)

### Frontend setup

1. `cd frontend`
2. Serve static files; example using Python's built-in server:

   ```bash
   python -m http.server 3000
   ```
3. Open `http://localhost:3000` in your browser.

---

## API

### Task data model

Each task JSON object should follow this structure:

```json
{
  "id": 1,
  "title": "Fix login bug",
  "due_date": "2025-11-30",
  "estimated_hours": 3,
  "importance": 8,
  "dependencies": [2, 5]
}
```

### Endpoints

* `POST /api/tasks/analyze/` — Accepts a JSON array of tasks and returns the same array with calculated `priority_score` and a short `reason` for each task.
* `GET /api/tasks/suggest/` — Returns the top 3 task suggestions for today with explanations for why they were chosen.

### Sample POST (/api/tasks/analyze/)

Request body:

```json
{ "tasks": [ { ... }, { ... } ], "strategy": "smart" }
```

Response body:

```json
{
  "tasks": [
    { "id": 1, "priority_score": 86.2, "reason": "High importance + due soon + blocks 2 tasks" },
    ...
  ]
}
```

---

## Priority Scoring Algorithm (300–500 words)

The scoring function combines multiple normalized factors into a single priority score on a 0–100 scale. The primary factors are: urgency, importance, effort, and dependency impact. The algorithm uses configurable weights for each factor so the same engine can behave in different modes (Smart Balance, Fastest Wins, High Impact, Deadline Driven).

**Normalization**: Each factor is converted to a 0–1 range to be comparable. Importance is taken directly from the user (1–10) and mapped to 0–1. Effort uses `estimated_hours` and is normalized using a soft cap (e.g., `min(hours, 20)/20`) and is inverted for quick‑win preference (low hours => higher quick‑win score). Urgency is computed from the difference between the task due date and `today` measured in business days; a custom decay function maps days‑remaining to [0,1] where tasks that are overdue get an urgency > 1 (clamped) and receive a strong boost. Dependency impact measures how many other tasks are blocked by this task (direct children) and also detects if completing this task unlocks multiple downstream items; this is scored proportionally and normalized.

**Base formula (conceptual)**:

```
score = 100 * clamp( w_u * urgency + w_i * importance + w_e * (1 - effort) + w_d * dependency_impact )
```

* `w_u, w_i, w_e, w_d` are configurable weights that sum to 1 for stability. Defaults are used for each strategy: e.g., Smart Balance gives moderate weights to all factors, Fastest Wins heavily weights `effort`, High Impact emphasizes `importance`, Deadline Driven concentrates weight on `urgency`.

**Edge behaviors**:

* Overdue tasks: urgency grows with lateness and yields a higher score; however, a sharp cap prevents extremely old tasks from dominating indefinitely.
* Ties: stable secondary sorting uses due date (sooner first), then importance, then lower effort.
* Dependencies & cycles: before scoring, the system performs a graph traversal to detect circular dependencies. If a cycle is detected, affected tasks receive a low priority and are flagged with an explicit message to the user to resolve cycle(s). Blocking tasks (those with many dependents) are boosted since unblocking yields higher value.

This approach creates transparent, explainable scores; the API returns a short `reason` string for each task explaining dominant factors so users (and reviewers) can validate the scoring logic quickly.

---

## Design decisions & trade‑offs

* *Simplicity first*: The scoring formula is linear and explainable rather than using a complex ML model—this is intentional for clarity and evaluation.
* *Configurable weights*: Rather than hardcoding behaviour, strategies are implemented as preset weight profiles so testers can switch modes easily.
* *Business days*: Date calculations optionally treat weekends as non‑business days to better reflect work scheduling.
* *Circular dependencies*: Instead of trying to auto‑resolve cycles, the app reports them so the user can make a conscious decision.

---

## Handling edge cases

* **Missing data**: Tasks missing fields use sensible defaults and are flagged in the response. For example, missing `importance` defaults to 5, missing `estimated_hours` defaults to 2.
* **Invalid data**: API returns 400 with descriptive errors for malformed JSON or invalid date formats.
* **Circular dependencies**: Detected via DFS plus visited stacks; tasks involved in cycles are returned with `cycle_detected: true` and a friendly message.

---

## Frontend UI / UX notes

* Single‑page layout with two sections: Input (form + bulk JSON paste) and Output (sorted list + Eisenhower matrix)
* Strategy selector toggles server strategy parameter.
* Visual indicators: color coding for priority (High/Medium/Low) and small explanation badges for each task.
* Basic form validation prevents submitting clearly invalid data.

---

## Tests

* Include at least 3 unit tests for the scoring algorithm covering:

  * Urgency weighting (overdue vs future)
  * Dependency boosting (task that blocks multiple tasks)
  * Cycle detection (simple 3‑node cycle)

Run tests:

```bash
cd backend
python manage.py test
```

---

## Time breakdown (approximate)

* Algorithm design & tests: 1 hour 15 minutes
* Backend implementation & API: 1 hour
* Frontend UI & integration: 45 minutes
* Documentation & polishing: 15–30 minutes

---

## Bonus challenges attempted

* Cycle detection and reporting (implemented)
* Eisenhower matrix view (frontend visualization)
* Date intelligence (business day toggle) — basic support implemented

---

## Future improvements

* Add unit / integration tests for frontend flows
* Learning system to adapt weights from user feedback
* Visual dependency graph with interactive editing and automatic cycle suggestions
* Authentication and persistence for multiple users and long‑term learning

---

## Contributing

If you'd like to contribute or review the code:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-change`
3. Commit clearly and push: `git push origin feature/your-change`
4. Open a PR describing your changes
