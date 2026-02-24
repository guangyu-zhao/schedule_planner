**English** | [中文](README-zh.md)

# Schedule Planner

A multi-user, self-hosted daily planner website with three main sections — **Schedule**, **Timer**, and **Statistics** — plus full user account management and 8-language internationalization.

## Features

### Schedule

The left side of the schedule page is for filling in your **plan**, and the right side is for recording **what actually happened**. Both columns display a 30-minute slot grid from 00:00 to 24:00.

- **Drag to create** — click and drag on empty slots to quickly create an event.
- **Copy from Plan** — when creating a plan event, click "Copy from Plan" in the new-event dialog to enter selection mode: the calendar remains navigable so you can jump to any date, then click any plan event to copy its title, category, priority, color, and notes into the new event form. Press Esc to return to editing without copying.
- **Drag to resize** — drag the top or bottom edge of an event to change its duration; overlapping neighbors adjust automatically.
- **Drag to move** — drag events to reposition them or move them between the Plan and Actual columns.
- **Linked plan/actual** — creating a plan event automatically generates a matching actual event; deleting either removes both.
- **Color, category & priority** — 20 preset colors, 5 categories (Work / Study / Personal / Exercise / Other), 3 priority levels.
- **Recurring events** — daily / weekdays / weekly / monthly auto-repeat.
- **Event templates** — save frequently-used events as templates for one-click creation.
- **Undo** — Ctrl+Z to undo create, edit, delete, resize, and complete operations.
- **Keyboard shortcuts** — Enter to edit, Space to toggle complete, Delete to remove, Escape to dismiss.
- **Trash & restore** — deleted events go to a 30-day trash bin and can be restored.

#### Notes

On the right side of the schedule page, there is also a **Markdown notes** area bound to the current date:

- **Multiple notes per day** — click **+ New Note** to create an additional note for the same date (only works if the current note has content). Click **☰ Select Note** to see a list of all notes for that day, with the first line shown as the title; click any row to switch to that note.
- Toggle between **Edit** and **Preview** tabs.
- Supports headings, bold, italic, lists, blockquotes, tables, code blocks, and inline code.
- LaTeX math formulas — inline `$...$` and block `$$...$$`.
- **Image upload** — drag an image from outside the browser into the editor, paste from clipboard (Ctrl+V), or click the image button to insert. Images are stored via the OSS abstraction layer; the token embedded in the Markdown is an opaque identifier that does not expose any internal IDs. Images also render when written as HTML `<img>` tags.
- Tab / Shift+Tab to indent / unindent selected lines.
- Auto-save with 800 ms debounce; safe across date switches. Empty notes are never persisted.

### Timer

Enter a task name, set a duration (5–180 min, with 15 / 25 / 45 / 60 min presets), and start a countdown. When the timer finishes, the record is saved in "Records" for that day.

- Pause, resume, add time (+5 / +30 min), stop early.
- **Pomodoro mode** — auto-break after each focus session (short 5 min / long 15 min every 4 sessions).
- **Ambient sounds** — rain, forest, café, white noise.
- Desktop notification and sound on completion.
- Per-day focus records and statistics.

### Statistics

View data analytics for the selected **day / week / month / all-time** period. Statistics are based on the **Actual** column of the schedule (not the Plan column) and timer records.

- Summary cards: event count, execution hours, focus time, timer completion rate.
- Charts: execution trend, category distribution, focus trend, priority distribution.

### Calendar Sidebar

All three sections have a calendar widget on the left showing the current month, a "Back to Today" button, and the current date. Click any date to jump to that day's records.

### User System

- **Email registration & login** — "Remember me" keeps sessions alive for 30 days.
- **Forgot password** — enter your email, receive a 6-digit verification code, enter it, and set a new password.
- **Profile** — customize username, bio, and upload an avatar (auto-cropped and resized).
- **Change password** — enter current password + new password twice.
- **Data export** — export all data as JSON, CSV, or iCal (.ics) calendar files.
- **Data import** — import data from previously exported JSON files.
- **Account deletion** — permanently delete account and all data after password confirmation.
- **Multi-user isolation** — each user's data is fully separated and invisible to others.

### Multi-Language Support

Supports 8 languages: **English**, **简体中文**, **繁體中文**, **Français**, **Deutsch**, **日本語**, **العربية** (RTL), **עברית** (RTL).

- The login page defaults to English; you can switch language before logging in.
- For first-time users, the language chosen on the login page is saved as their preference.
- For returning users, the site displays in their previously saved language regardless of the login page setting.
- Language can be changed anytime from the profile settings page.

## Getting Started

### Prerequisites

- Python 3.9+
- PostgreSQL 14+
- Redis 6+

### Install & Run

```bash
git clone https://github.com/<your-username>/schedule_planner.git
cd schedule_planner
cp .env.example .env        # create config file, edit as needed

# Start PostgreSQL and Redis (Docker recommended)
docker compose up -d postgres redis

pip install -r requirements.txt
python app.py
```

Open `http://localhost:5555` in your browser and register an account.

#### Migrating from SQLite

If you have existing data in a `planner.db` file, run the one-time migration script after starting PostgreSQL:

```bash
python migrate_sqlite_to_pg.py --sqlite-path planner.db --pg-url postgresql://planner:plannerpass@localhost:5432/planner_db
```

### Production Deployment

```bash
# Linux / macOS
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5555 app:app

# Windows
pip install waitress
waitress-serve --port=5555 app:app

# Start Celery worker for async email (in a separate terminal)
# Linux / macOS
celery -A celery_app.celery worker --loglevel=info --concurrency=2
# Windows
celery -A celery_app.celery worker --loglevel=info --pool=solo
```

### Configuration

All settings are managed through the **`.env`** file in the project root (loaded automatically via `python-dotenv`). Copy `.env.example` to `.env` and edit as needed; restart the server to apply changes.

#### Server

| Variable | Description | Default |
|----------|-------------|---------|
| `FLASK_ENV` | Runtime mode (`development` / `production`) | `development` |
| `FLASK_DEBUG` | Enable Flask debug mode | `false` |
| `HOST` | Listen address | `127.0.0.1` |
| `PORT` | Listen port | `5555` |
| `HTTPS` | Set to `1` to mark session cookies as Secure | `0` |
| `LOG_LEVEL` | Logging level (`DEBUG` / `INFO` / `WARNING` / `ERROR`) | `INFO` |

#### Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://planner:plannerpass@localhost:5432/planner_db` |

#### Cache & Sessions

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL (sessions & rate limiting) | `redis://localhost:6379/0` |
| `CELERY_BROKER_URL` | Celery broker URL | same as `REDIS_URL` |
| `CELERY_RESULT_BACKEND` | Celery result backend URL | `redis://localhost:6379/1` |
| `SESSION_KEY_PREFIX` | Redis key prefix for sessions | `sp_sess:` |
| `RATELIMIT_STORAGE_URI` | flask-limiter Redis URI | `redis://localhost:6379/2` |

#### Security

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Session signing key (must set in production) | Auto-generated and saved to `.secret_key` |
| `MAX_LOGIN_ATTEMPTS` | Failed login attempts before lockout | `10` |
| `LOGIN_LOCKOUT_SECONDS` | Lockout duration in seconds | `900` |

#### Monitoring

| Variable | Description | Default |
|----------|-------------|---------|
| `SENTRY_DSN` | Sentry DSN for error monitoring | Empty (disabled) |
| `SENTRY_TRACES_SAMPLE_RATE` | Sentry performance tracing sample rate | `0.1` |
| `SENTRY_ENVIRONMENT` | Sentry environment label | `development` |

#### Mail

| Variable | Description | Default |
|----------|-------------|---------|
| `MAIL_SERVER` | SMTP server address | `smtp.gmail.com` |
| `MAIL_PORT` | SMTP port | `587` |
| `MAIL_USERNAME` | SMTP username | Empty (codes printed to console) |
| `MAIL_PASSWORD` | SMTP password / app-specific password | Empty |
| `MAIL_DEFAULT_SENDER` | Sender email address | `noreply@schedule-planner.com` |
| `MAIL_USE_TLS` | Enable TLS | `true` |

#### File Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `STORAGE_TYPE` | Storage backend: `local` (filesystem) or `oss` (Alibaba Cloud OSS) | `local` |
| `UPLOAD_FOLDER` | Local upload directory (effective when `STORAGE_TYPE=local`) | `uploads/` under project root |
| `OSS_ACCESS_KEY_ID` | Alibaba Cloud OSS Access Key ID | Empty |
| `OSS_ACCESS_KEY_SECRET` | Alibaba Cloud OSS Access Key Secret | Empty |
| `OSS_ENDPOINT` | OSS endpoint (e.g. `https://oss-cn-hangzhou.aliyuncs.com`) | Empty |
| `OSS_BUCKET` | OSS bucket name | Empty |
| `OSS_BASE_URL` | OSS public base URL for file access | Empty |

> **Switch to OSS**: set `STORAGE_TYPE=oss` and fill in the `OSS_*` variables — no code changes needed.

## Project Structure

```
schedule_planner/
│
├── .env                    # Environment configuration (not tracked in git)
├── .env.example            # Configuration template — copy to .env to start
├── docker-compose.yml      # Local dev: PostgreSQL 16 + Redis 7 containers
│
├── app.py                  # Application entry point — creates the Flask app,
│                           #   registers middleware (CSRF check, security
│                           #   headers, Redis-backed rate limiting), periodic
│                           #   maintenance, Redis session setup, Sentry init,
│                           #   and error handlers.
│
├── config.py               # Centralized configuration — loads .env via
│                           #   python-dotenv, reads SECRET_KEY from env or
│                           #   .secret_key file, defines DATABASE_URL,
│                           #   REDIS_URL, Celery URLs, Sentry settings,
│                           #   mail settings, session lifetime, and more.
│
├── database.py             # Database layer — PostgreSQL connection pool
│                           #   (psycopg2.ThreadedConnectionPool, 2–20 conns),
│                           #   _ConnWrapper for SQLite-compatible .execute()
│                           #   interface, full schema creation (users, events,
│                           #   timer_records, notes, note_images,
│                           #   event_templates, user_settings,
│                           #   verification_codes, deleted_events,
│                           #   user_sessions), index creation, and
│                           #   periodic optimization via ANALYZE.
│
├── redis_client.py         # Redis singleton — get_redis() returns a shared
│                           #   Redis client used for session revocation and
│                           #   login rate limiting.
│
├── celery_app.py           # Celery application factory — configures broker
│                           #   and result backend (both Redis), registers
│                           #   task modules, and initializes Sentry for
│                           #   worker-side error capture.
│
├── tasks/
│   ├── __init__.py         # Package init
│   └── email_tasks.py      # Async email task — send_verification_email_task
│                           #   with 3 retries (60 s delay), wraps SMTP logic.
│
├── migrate_sqlite_to_pg.py # One-time SQLite → PostgreSQL migration script;
│                           #   idempotent (ON CONFLICT DO NOTHING), resets
│                           #   SERIAL sequences, verifies row counts.
│
├── auth_utils.py           # Authentication utilities — @login_required
│                           #   decorator, get_current_user(), password
│                           #   validation, verification code generation,
│                           #   async email dispatch (Celery) with sync
│                           #   fallback, code storage/verification.
│
├── storage/                # Pluggable file-storage abstraction
│   ├── __init__.py         # Factory function get_storage() — returns the
│   │                       #   singleton Storage instance based on the
│   │                       #   STORAGE_TYPE environment variable.
│   ├── base.py             # Abstract Storage interface — defines save(),
│   │                       #   delete(), exists(), and url() methods.
│   ├── local.py            # LocalStorage — stores files on the local
│   │                       #   filesystem under UPLOAD_FOLDER.
│   └── oss.py              # OSSStorage — Alibaba Cloud OSS backend
│                           #   (structure ready; requires oss2 SDK).
│
├── requirements.txt        # Python dependencies
├── .secret_key             # Auto-generated session key (gitignored)
│
├── routes/                 # API route modules (one file per domain)
│   ├── __init__.py         # Registers all blueprints with the app
│   ├── main.py             # Page routes: / (main app) and /login
│   ├── auth.py             # Auth API: register, login, logout, forgot
│   │                       #   password, verify code, reset password;
│   │                       #   Redis-backed login rate limiting with lockout;
│   │                       #   session management APIs (list devices, revoke
│   │                       #   single device, revoke all other devices).
│   ├── user.py             # User API: get/update profile, upload avatar
│   │                       #   (auto-crop + resize via Pillow), change
│   │                       #   password, export data (JSON / CSV / iCal),
│   │                       #   import data, delete account.
│   ├── events.py           # Events API: CRUD, batch time update, linked
│   │                       #   plan/actual creation, duplicate to date,
│   │                       #   recurring event generation (daily / weekdays
│   │                       #   / weekly / monthly), search, trash & restore.
│   ├── timer.py            # Timer API: create/list/delete timer records,
│   │                       #   per-day stats (total, completed, seconds).
│   ├── notes.py            # Notes API: get/save per-date Markdown notes,
│   │                       #   search notes by keyword, upload/serve
│   │                       #   note images via OSS abstraction.
│   ├── stats.py            # Statistics API: daily stats (event count,
│   │                       #   hours, completion rate), date-range analytics,
│   │                       #   activity heatmap, streak calculation.
│   └── templates.py        # Event templates API: create/list/delete
│                           #   reusable event templates (max 50 per user).
│
├── templates/              # HTML templates
│   ├── auth.html           # Login / register / forgot-password page with
│   │                       #   language selector and feature showcase
│   ├── index.html          # Main app shell — top navigation bar, user
│   │                       #   menu dropdown, profile overlay, delete
│   │                       #   account modal, shortcuts help modal,
│   │                       #   offline banner, toast notifications
│   └── partials/
│       ├── schedule.html   # Schedule tab — calendar sidebar, dual-column
│       │                   #   time grid, notes editor with preview
│       ├── timer.html      # Timer tab — calendar sidebar, circular
│       │                   #   countdown display, controls, ambient sound
│       │                   #   selector, pomodoro settings, records list
│       ├── stats.html      # Statistics tab — calendar sidebar, period
│       │                   #   selector, summary cards, chart canvases
│       └── modal.html      # Event editor modal, right-click popover,
│                           #   toast notification container
│
├── static/
│   ├── manifest.json       # PWA manifest for installable web app
│   ├── service-worker.js   # Service worker for offline static caching
│   ├── icons/              # PWA icons (192×192, 512×512)
│   ├── css/
│   │   ├── base.css        # CSS custom properties (light/dark theme
│   │   │                   #   variables), reset, typography, scrollbar
│   │   ├── layout.css      # Top bar, tab navigation, page container,
│   │   │                   #   sidebar/content layout, RTL support
│   │   ├── components.css  # Modal dialog, popover menu, toast, buttons,
│   │   │                   #   color picker, date/time inputs
│   │   ├── auth.css        # Login/register page: split layout, form
│   │   │                   #   cards, feature cards, language selector
│   │   ├── user.css        # User avatar/menu dropdown, profile overlay,
│   │   │                   #   delete account modal, shortcuts modal
│   │   ├── schedule.css    # Calendar widget, time grid, event blocks,
│   │   │                   #   drag overlay, notes editor/preview
│   │   ├── timer.css       # Circular timer ring, preset buttons, ambient
│   │   │                   #   sound panel, pomodoro indicator, records
│   │   └── stats.css       # Summary cards, chart containers, period
│   │                       #   toggle buttons, range label
│   └── js/
│       ├── i18n.js         # Internationalization — translation
│       │                   #   dictionaries for all 8 languages, language
│       │                   #   get/set via localStorage, DOM translation
│       │                   #   via data-i18n attributes, Chinese-to-i18n-key
│       │                   #   error mapping for backend messages, date
│       │                   #   formatting per locale.
│       ├── app.js          # Entry point — initializes PlannerApp,
│       │                   #   TimerManager, StatisticsManager; sets up
│       │                   #   tab switching and visibility-change refresh.
│       ├── auth.js         # Login, register, forgot-password form handlers;
│       │                   #   sends selected language with auth requests.
│       ├── user.js         # User menu, profile editor (save profile,
│       │                   #   change avatar, change password, language
│       │                   #   switch), data export/import, account
│       │                   #   deletion, theme toggle (light/dark),
│       │                   #   keyboard shortcuts modal, device/session
│       │                   #   management (list, revoke, revoke-all),
│       │                   #   global 401 redirect interceptor.
│       ├── constants.js    # Shared constants: color palette, category
│       │                   #   icons/colors, priority colors, slot height,
│       │                   #   category/priority label helpers with i18n.
│       ├── helpers.js      # Utility functions: ISO date formatting,
│       │                   #   HTML escaping, toast notification display.
│       ├── planner.js           # PlannerApp core — class constructor,
│       │                        #   init(), bindEvents(), slot/date helpers.
│       │                        #   All feature mixins are merged onto the
│       │                        #   prototype via Object.assign.
│       ├── planner-calendar.js  # CalendarMixin — calendar rendering,
│       │                        #   date-change handler, calendar dot
│       │                        #   markers (has-event / has-note).
│       ├── planner-grid.js      # GridMixin — time grid and event block
│       │                        #   rendering, current-time indicator,
│       │                        #   notification scheduling.
│       ├── planner-events-api.js# EventsApiMixin — event CRUD, column
│       │                        #   move, batch update, undo history stack.
│       ├── planner-drag.js      # DragMixin — drag-to-create, edge-resize
│       │                        #   with cascade compression, column move.
│       ├── planner-modal.js     # ModalMixin — event editor modal, color
│       │                        #   picker, popover, tooltip, plan-pick.
│       ├── planner-notes.js     # NotesMixin — multi-note management,
│       │                        #   Markdown editor with live preview,
│       │                        #   image upload, auto-save, note list.
│       └── planner-search.js    # SearchMixin — keyword search across
│                                #   events and notes, jump-to-date.
│       ├── timer.js        # TimerManager class — countdown logic with
│       │                   #   pause/resume/stop/add-time, pomodoro cycle
│       │                   #   (auto short/long breaks), ambient sound
│       │                   #   generation (Web Audio API: rain, forest,
│       │                   #   café, white noise), record persistence,
│       │                   #   title bar countdown display.
│       └── stats.js        # StatisticsManager class — period switching,
│                           #   date range calculation, data fetching,
│                           #   summary card rendering, Chart.js chart
│                           #   creation (bar, doughnut, line charts).
│
└── uploads/
    ├── avatars/            # User-uploaded avatar images (local storage)
    └── note_images/        # Note-embedded images, stored per user (local storage)
```

## API Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register (email + username + password) |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user info |
| POST | `/api/auth/forgot-password` | Send password-reset verification code |
| POST | `/api/auth/verify-code` | Verify code |
| POST | `/api/auth/reset-password` | Reset password |
| GET | `/api/auth/sessions` | List all logged-in devices |
| DELETE | `/api/auth/sessions/<id>` | Revoke a specific device session |
| DELETE | `/api/auth/sessions/all-others` | Revoke all sessions except current |

### User

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user/profile` | Get profile |
| PUT | `/api/user/profile` | Update username, bio & language |
| POST | `/api/user/avatar` | Upload avatar |
| POST | `/api/user/change-password` | Change password |
| GET | `/api/user/settings` | Get user settings |
| PUT | `/api/user/settings` | Update user settings |
| GET | `/api/user/export` | Export all data (JSON) |
| GET | `/api/user/export-csv` | Export data (CSV) |
| GET | `/api/user/export-ical` | Export calendar (iCal) |
| POST | `/api/user/import` | Import data from JSON |
| DELETE | `/api/user/delete-account` | Delete account |

### Events

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events?start=&end=` | List events in date range |
| POST | `/api/events` | Create event |
| PUT | `/api/events/<id>` | Update event |
| PUT | `/api/events/batch` | Batch update event times |
| DELETE | `/api/events/<id>` | Soft-delete event (to trash) |
| POST | `/api/events/<id>/duplicate` | Duplicate event to a target date |
| POST | `/api/events/generate-recurring` | Generate recurring event instances |
| GET | `/api/events/search?q=` | Search events by keyword |
| GET | `/api/events/trash` | List trashed events |
| POST | `/api/events/trash/<id>/restore` | Restore event from trash |
| DELETE | `/api/events/trash` | Empty trash |

### Timer

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/timer/records?date=` | List timer records for a date |
| POST | `/api/timer/records` | Create timer record |
| DELETE | `/api/timer/records/<id>` | Delete timer record |
| GET | `/api/timer/stats?date=` | Get timer stats for a date |

### Notes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes?date=` | Get note for a date |
| PUT | `/api/notes` | Save note |
| GET | `/api/notes/search?q=` | Search notes by keyword |
| POST | `/api/notes` | Create new note for a date |
| PUT | `/api/notes/<id>` | Update note content |
| DELETE | `/api/notes/<id>` | Delete a note |
| POST | `/api/notes/images` | Upload note image; returns opaque token |
| GET | `/api/notes/images/<token>` | Serve note image by token |

### Statistics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats?date=` | Daily statistics |
| GET | `/api/stats/heatmap` | Activity heatmap (past year) |
| GET | `/api/stats/streak` | Streak & productivity data |
| GET | `/api/analytics?start=&end=` | Analytics for date range |

### Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/templates` | List event templates |
| POST | `/api/templates` | Create event template |
| DELETE | `/api/templates/<id>` | Delete event template |

### Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth required) |

> All API endpoints except `/api/auth/*` and `/health` require a logged-in session. Unauthenticated requests return `401`.
