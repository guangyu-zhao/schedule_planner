**English** | [中文](README-zh.md)

# Schedule Planner

A multi-user, self-hosted daily planner with schedule management, Pomodoro timer, Markdown notes, and data analytics. Deploy to a server for team or personal remote use.

## Features

### User System

- **Email registration & login** — "Remember me" keeps sessions alive for 30 days.
- **Forgot password** — receive a 6-digit verification code via email and reset your password.
- **User profile** — customize username, bio, and upload an avatar (auto-cropped & resized).
- **Change password** — enter current password + new password twice.
- **Data export** — one-click export of all data as JSON or CSV files.
- **Data import** — import historical data from JSON files.
- **Account deletion** — permanently delete account and all data after password confirmation.
- **Multi-user data isolation** — each user's data is fully separated and invisible to others.
- **PWA support** — installable as a desktop/mobile app with offline static asset caching.

### Schedule

- **Dual-column day view** — side-by-side "Plan" and "Actual" columns on a 30-minute slot grid (00:00–24:00).
- **Drag-to-create** — click and drag on empty slots to quickly create events.
- **Edge-drag resize** with cascading compression — resize an event and overlapping neighbors adjust automatically.
- **Linked plan/actual events** — creating a plan event auto-generates a matching actual event; deleting either removes both.
- **Color, category & priority** — 20 preset colors, 5 categories, 3 priority levels.
- **Drag & drop move** — drag events between Plan and Actual columns and reposition freely.
- **Event templates** — save frequently-used events as templates for one-click creation.
- **Recurring events** — support daily / weekdays / weekly / monthly auto-repeat.
- **Undo** — Ctrl+Z to undo create / edit / delete / resize / complete operations.
- **Keyboard shortcuts** — Enter to edit, Space to toggle complete, Delete to remove, Escape to dismiss.

### Notes

- **Markdown editor** with live preview (edit / preview tabs).
- Supports **headings, bold, italic, lists, blockquotes, tables, fenced code blocks, inline code**.
- **LaTeX math** — inline `$...$` and block `$$...$$` via KaTeX.
- Faithful whitespace rendering — leading spaces, multiple spaces, and multiple blank lines are preserved as typed.
- Tab / Shift+Tab to indent / unindent selected lines.
- Auto-save with 800 ms debounce; safe across date switches.

### Pomodoro Timer

- Adjustable duration (5–180 min) with presets (15 / 25 / 45 / 60 min).
- Pause, resume, add time (+5 / +30 min), stop.
- Desktop notification + sound on completion.
- Per-day focus records and statistics.

### Statistics

- Period selector: day / week / month / all.
- Summary cards: event count, execution hours, focus time, timer completion rate.
- Charts (Chart.js): execution trend, category distribution, focus trend, priority distribution.

## Getting Started

### Prerequisites

- Python 3.9+

### Install & Run

```bash
git clone https://github.com/<your-username>/schedule_planner.git
cd schedule_planner
pip install -r requirements.txt
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser and register an account.

The SQLite database (`planner.db`) is created automatically on first run.

### Production Deployment

Use a WSGI server instead of the built-in dev server:

```bash
# Linux / macOS
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app

# Windows
pip install waitress
waitress-serve --port=5000 app:app
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Flask session signing key (must set in production) | Random |
| `MAIL_SERVER` | SMTP server address | `smtp.gmail.com` |
| `MAIL_PORT` | SMTP port | `587` |
| `MAIL_USERNAME` | SMTP username | Empty (codes printed to console) |
| `MAIL_PASSWORD` | SMTP password / app-specific password | Empty |
| `MAIL_DEFAULT_SENDER` | Sender email address | `noreply@schedule-planner.com` |
| `MAIL_USE_TLS` | Enable TLS | `true` |

## Project Structure

```
schedule_planner/
├── app.py                 # Flask entry, session & rate-limit config
├── config.py              # App config (secret, mail, uploads, etc.)
├── database.py            # DB connection, schema init & migrations
├── auth_utils.py          # Auth utilities (decorator, codes, email)
├── routes/                # Flask Blueprints
│   ├── __init__.py        # Blueprint registration
│   ├── main.py            # Page routes (/, /login)
│   ├── auth.py            # Auth API (register, login, forgot password)
│   ├── user.py            # User API (profile, avatar, password, export)
│   ├── events.py          # Events CRUD API
│   ├── timer.py           # Timer records & stats API
│   ├── notes.py           # Notes API
│   └── stats.py           # Statistics & analytics API
├── planner.db             # SQLite database (auto-created)
├── uploads/               # User-uploaded files
│   └── avatars/           # User avatars
├── requirements.txt
├── templates/
│   ├── index.html         # Main template (with user menu & profile panel)
│   ├── auth.html          # Login / register / forgot password page
│   └── partials/
│       ├── schedule.html  # Schedule page
│       ├── timer.html     # Timer page
│       ├── stats.html     # Statistics page
│       └── modal.html     # Modal, popover & toast
└── static/
    ├── css/
    │   ├── base.css       # Variables, reset, global styles
    │   ├── layout.css     # Top bar, tabs, page layout
    │   ├── auth.css       # Login / register page styles
    │   ├── user.css       # User menu & profile panel styles
    │   ├── schedule.css   # Schedule page styles
    │   ├── timer.css      # Timer page styles
    │   ├── stats.css      # Statistics page styles
    │   └── components.css # Modal, popover, toast, buttons
    └── js/
        ├── app.js         # Entry point & tab init
        ├── auth.js        # Login / register / forgot password logic
        ├── user.js        # User menu, profile, global auth intercept
        ├── constants.js   # Shared constants
        ├── helpers.js     # Utility functions
        ├── planner.js     # Schedule (PlannerApp class)
        ├── timer.js       # Timer (TimerManager class)
        └── stats.js       # Statistics (StatisticsManager class)
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

### User

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user/profile` | Get profile |
| PUT | `/api/user/profile` | Update username & bio |
| POST | `/api/user/avatar` | Upload avatar |
| POST | `/api/user/change-password` | Change password |
| GET | `/api/user/export` | Export all data (JSON) |
| DELETE | `/api/user/delete-account` | Delete account |

### Schedule & Data

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events?start=&end=` | List events in date range |
| POST | `/api/events` | Create event (+ linked actual) |
| PUT | `/api/events/<id>` | Update event |
| PUT | `/api/events/batch` | Batch update times |
| DELETE | `/api/events/<id>` | Delete event (+ linked) |
| POST | `/api/events/<id>/duplicate` | Duplicate event to a target date |
| GET | `/api/events/search?q=&limit=` | Search events by keyword |
| GET | `/api/stats?date=` | Day statistics |
| GET | `/api/stats/streak` | Get streak & productivity data |
| GET | `/api/notes?date=` | Get note for date |
| PUT | `/api/notes` | Save note |
| GET | `/api/notes/search?q=&limit=` | Search notes by keyword |
| GET | `/api/timer/records?date=` | Get timer records |
| POST | `/api/timer/records` | Create timer record |
| DELETE | `/api/timer/records/<id>` | Delete timer record |
| GET | `/api/timer/stats?date=` | Get timer stats |
| GET | `/api/analytics?start=&end=` | Analytics data |

### Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth required) |

> All API endpoints except authentication and operations require a logged-in session. Unauthenticated requests return `401`.

## Security

- **Password hashing** — Werkzeug's `generate_password_hash` / `check_password_hash` (PBKDF2).
- **Signed cookie sessions** — `HttpOnly`, `SameSite=Lax` to prevent XSS and CSRF.
- **Rate limiting** — register 5/min, login 10/min, forgot-password 3/min (Flask-Limiter).
- **Input validation** — password strength (≥8 chars with letters + digits), email format, username length.
- **Data isolation** — all queries are scoped to `user_id`; cross-user access is impossible.
- **Verification code expiry** — 10-minute TTL, single-use.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Flask 3.0+, Flask-Limiter |
| Frontend | Vanilla JavaScript (ES Modules) |
| Database | SQLite (WAL mode) |
| Templating | Jinja2 |
| Image processing | Pillow |
| External libs | Chart.js, Marked.js, KaTeX |

## License

MIT
