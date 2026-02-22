# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Setup
cp .env.example .env
pip install -r requirements.txt

# Run development server (http://127.0.0.1:5555)
python app.py

# Production (Linux/macOS)
gunicorn -w 4 -b 0.0.0.0:5555 app:app

# Production (Windows)
waitress-serve --port=5555 app:app
```

There is no test suite, linter, or build step configured.

## Architecture Overview

Flask backend with vanilla JS frontend. No frontend framework — all UI is class-based ES6.

### Backend (`routes/` blueprints)
Each file is a Flask blueprint registered in `app.py`:
- `auth.py` — register, login, password reset with rate limiting
- `events.py` — CRUD, drag-drop ordering, recurring events, soft-delete
- `user.py` — profile, avatar, settings, JSON/CSV/iCal export-import
- `timer.py` — focus session records
- `stats.py` — analytics, heatmap, streak calculation
- `notes.py` — per-date markdown notes
- `templates.py` — reusable event templates

`auth_utils.py` provides `@login_required` and sets `g.user_id` per request.
`database.py` owns the SQLite schema and all migrations (column additions, index creation).

### Storage Abstraction (`storage/`)
Factory pattern via `get_storage()` returns either `LocalStorage` or `OSSStorage` based on `STORAGE_TYPE` env var. Used only for avatar uploads currently.

### Frontend (`static/js/`)
Three main class instances initialized in `app.js`:
- `PlannerApp` (`planner.js`, 1200+ lines) — schedule grid, drag-drop, undo/redo stack
- `TimerManager` (`timer.js`) — countdown, pomodoro, Web Audio API ambient sounds
- `StatisticsManager` (`stats.js`) — Chart.js visualizations

`i18n.js` is a single 8-language translation dictionary; call `t('key')` anywhere. Language is stored in both `localStorage` and the user's DB record. Arabic/Hebrew trigger RTL layout via CSS.

### Database
SQLite with WAL mode. 9 tables: `users`, `events`, `deleted_events` (soft-delete, 30-day trash), `timer_records`, `event_templates`, `notes`, `user_settings`, `verification_codes`.

All tables use `user_id` foreign key for full multi-user data isolation. Schema migrations are additive — new columns are added via `ALTER TABLE` guards in `database.py`.

### Security
- CSRF: Origin/Referer validation on all POST/PUT/DELETE in `app.py` middleware
- Auth: pbkdf2 password hashing, 10-attempt lockout → 15-min block (flask-limiter)
- Sessions: HttpOnly, SameSite=Lax, 30-day expiry
- File uploads: MIME-type validation, 5 MB limit, path sanitization
- Security headers (CSP, X-Frame-Options, etc.) set globally in `app.py`

## Key Configuration (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `SECRET_KEY` | auto-generated | Saved to `.secret_key` on first run |
| `STORAGE_TYPE` | `local` | `local` or `oss` |
| `FLASK_ENV` | `development` | Set to `production` for deployment |
| `HTTPS` | `0` | Set to `1` to enable Secure cookie flag |
| `MAIL_*` | (empty) | Required for password reset emails |
| `OSS_*` | (empty) | Required when `STORAGE_TYPE=oss` |
