**English** | [中文](README-zh.md)

# Schedule Planner

A lightweight, self-hosted daily planner with schedule management, Pomodoro timer, and Markdown notes.

## Features

### Schedule

- **Dual-column day view** — side-by-side "Plan" and "Actual" columns on a 30-minute slot grid (00:00–24:00).
- **Drag-to-create** — click and drag on empty slots to quickly create events.
- **Edge-drag resize** with cascading compression — resize an event and overlapping neighbors adjust automatically.
- **Linked plan/actual events** — creating a plan event auto-generates a matching actual event; deleting either removes both.
- **Color, category & priority** — 20 preset colors, 5 categories, 3 priority levels.
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

Open [http://localhost:5000](http://localhost:5000) in your browser.

The SQLite database (`planner.db`) is created automatically on first run.

## Project Structure

```
schedule_planner/
├── app.py                 # Flask entry point
├── config.py              # App configuration
├── database.py            # DB connection & schema init
├── routes/                # Flask Blueprints
│   ├── __init__.py        # Blueprint registration
│   ├── main.py            # Page route (/)
│   ├── events.py          # Events CRUD API
│   ├── timer.py           # Timer records & stats API
│   ├── notes.py           # Notes API
│   └── stats.py           # Statistics & analytics API
├── planner.db             # SQLite database (auto-created)
├── requirements.txt
├── templates/
│   ├── index.html         # Main template (assembles partials)
│   └── partials/
│       ├── schedule.html  # Schedule page
│       ├── timer.html     # Timer page
│       ├── stats.html     # Statistics page
│       └── modal.html     # Modal, popover & toast
└── static/
    ├── css/
    │   ├── base.css       # Variables, reset, global styles
    │   ├── layout.css     # Top bar, tabs, page layout
    │   ├── schedule.css   # Schedule page styles
    │   ├── timer.css      # Timer page styles
    │   ├── stats.css      # Statistics page styles
    │   └── components.css # Modal, popover, toast, buttons
    └── js/
        ├── app.js         # Entry point & tab init
        ├── constants.js   # Shared constants
        ├── helpers.js     # Utility functions
        ├── planner.js     # Schedule (PlannerApp class)
        ├── timer.js       # Timer (TimerManager class)
        └── stats.js       # Statistics (StatisticsManager class)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events?start=&end=` | List events in date range |
| POST | `/api/events` | Create event (+ linked actual) |
| PUT | `/api/events/<id>` | Update event |
| PUT | `/api/events/batch` | Batch update times |
| DELETE | `/api/events/<id>` | Delete event (+ linked) |
| GET | `/api/stats?date=` | Day statistics |
| GET | `/api/notes?date=` | Get note for date |
| PUT | `/api/notes` | Save note |
| GET/POST/DELETE | `/api/timer/...` | Timer records & stats |
| GET | `/api/analytics?start=&end=` | Analytics data |

## License

MIT
