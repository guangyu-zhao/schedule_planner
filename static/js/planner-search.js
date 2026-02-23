import { escHtml } from './helpers.js';

/* ================================================================
   SEARCH + JUMP-TO-DATE MIXIN
   ================================================================ */
export const SearchMixin = {

    initSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchClearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const q = searchInput.value.trim();
                searchClearBtn.style.display = q ? 'inline-block' : 'none';
                this._onSearchInput(q);
            });
            searchInput.addEventListener('keydown', e => {
                if (e.key === 'Escape') { e.stopPropagation(); this._closeSearch(); }
            });
        }
        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', () => this._closeSearch());
        }
        document.addEventListener('click', e => {
            if (!e.target.closest('#scheduleSearchBar')) this._closeSearchDropdown();
        });

        const toggleMap = [
            ['searchCaseBtn',  () => { this._searchCase  = !this._searchCase;  }],
            ['searchWordBtn',  () => { this._searchWord  = !this._searchWord;  }],
            ['searchRegexBtn', () => {
                this._searchRegex = !this._searchRegex;
                if (!this._searchRegex) document.getElementById('searchInput')?.classList.remove('regex-error');
            }],
        ];
        toggleMap.forEach(([id, toggle]) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', () => {
                toggle();
                btn.classList.toggle('active');
                const q = document.getElementById('searchInput')?.value.trim();
                if (q) this._performSearch(q);
            });
        });
    },

    _onSearchInput(q) {
        clearTimeout(this._searchTimer);
        if (!q) { this._closeSearchDropdown(); return; }
        this._searchTimer = setTimeout(() => this._performSearch(q), 300);
    },

    async _performSearch(q) {
        const inp = document.getElementById('searchInput');
        try {
            const params = new URLSearchParams({
                q, limit: 15,
                case_sensitive: this._searchCase  ? '1' : '0',
                whole_word:     this._searchWord  ? '1' : '0',
                regex:          this._searchRegex ? '1' : '0',
            });
            const [evtRes, noteRes] = await Promise.all([
                fetch(`/api/events/search?${params}`),
                fetch(`/api/notes/search?${params}`),
            ]);
            if (!evtRes.ok) {
                const err = await evtRes.json().catch(() => ({}));
                inp?.classList.add('regex-error');
                this._renderSearchDropdown([], err.error);
                return;
            }
            inp?.classList.remove('regex-error');
            const events = (await evtRes.json()).map(e => ({ ...e, _type: 'event' }));
            const notes  = noteRes.ok ? (await noteRes.json()).map(n => ({ ...n, _type: 'note' })) : [];
            const combined = [...events, ...notes].sort((a, b) => b.date.localeCompare(a.date));
            this._renderSearchDropdown(combined);
        } catch (e) { /* network error: silently ignore */ }
    },

    _renderSearchDropdown(results, errorMsg) {
        const dropdown = document.getElementById('searchDropdown');
        const t = key => (window.I18n && window.I18n.t) ? window.I18n.t(key) : key;
        if (errorMsg) {
            dropdown.innerHTML = `<div class="search-no-results search-error">${escHtml(errorMsg)}</div>`;
            dropdown.classList.add('active');
            return;
        }
        if (!results.length) {
            dropdown.innerHTML = `<div class="search-no-results">${escHtml(t('schedule.noResults'))}</div>`;
        } else {
            dropdown.innerHTML = results.map(item => {
                if (item._type === 'note') {
                    const snippet = item.content.replace(/[#*`>_~\[\]!]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
                    return `<div class="search-result-item" data-type="note" data-date="${escHtml(item.date)}" data-note-id="${item.id}">
                        <span class="search-result-note-icon">&#128221;</span>
                        <span class="search-result-title">${escHtml(snippet || item.date)}</span>
                        <span class="search-result-meta">${escHtml(item.date)}</span>
                    </div>`;
                }
                return `<div class="search-result-item" data-type="event" data-event-id="${item.id}" data-date="${escHtml(item.date)}">
                    <span class="search-result-dot" style="background:${escHtml(item.color)}"></span>
                    <span class="search-result-title">${escHtml(item.title)}</span>
                    <span class="search-result-meta">${escHtml(item.date)} ${escHtml(item.start_time)}-${escHtml(item.end_time)}</span>
                </div>`;
            }).join('');
            dropdown.querySelectorAll('.search-result-item').forEach(el => {
                el.addEventListener('click', () => {
                    const date = el.dataset.date;
                    this._closeSearch();
                    if (el.dataset.type === 'note') {
                        const noteId = el.dataset.noteId ? parseInt(el.dataset.noteId, 10) : null;
                        this._jumpToDate(date, null, noteId);
                    } else {
                        this._jumpToDate(date, parseInt(el.dataset.eventId, 10));
                    }
                });
            });
        }
        dropdown.classList.add('active');
    },

    _closeSearchDropdown() {
        document.getElementById('searchDropdown')?.classList.remove('active');
    },

    _closeSearch() {
        const inp = document.getElementById('searchInput');
        const btn = document.getElementById('searchClearBtn');
        if (inp) { inp.value = ''; inp.classList.remove('regex-error'); }
        if (btn) btn.style.display = 'none';
        this._closeSearchDropdown();
    },

    _jumpToDate(dateStr, highlightEventId, highlightNoteId = null) {
        const [y, m, d] = dateStr.split('-').map(Number);
        this.selectedDate = new Date(y, m - 1, d);
        this._pendingHighlightId = highlightEventId;
        this._pendingHighlightNoteId = highlightNoteId;
        this.onDateChange();
    },
};
