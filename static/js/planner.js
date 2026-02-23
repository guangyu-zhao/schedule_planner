import { COLORS, CATEGORY_ICONS, SLOT_HEIGHT, TOTAL_SLOTS, MIN_EVENT_SLOTS, getCategoryLabel } from './constants.js';
import { fmtDateISO, escHtml, showToast } from './helpers.js';

export class PlannerApp {
    constructor() {
        this.selectedDate = new Date();
        this.calendarMonth = new Date();
        this.events = [];

        this.isDragging = false;
        this.dragCol = null;
        this.dragStartSlot = null;
        this.dragEndSlot = null;
        this.dragOverlay = null;

        this.isResizing = false;
        this.resizeEventId = null;
        this.resizeEdge = null;
        this.resizeCol = null;
        this.resizeSnapshot = null;

        this.editingEvent = null;
        this.editingColType = null;
        this.selectedColor = COLORS[0];
        this.toastTimer = null;
        this.popoverEventId = null;
        this.selectedEventId = null;
        this.undoHistory = [];
        this._undoing = false;

        this.isDragMoving = false;
        this.dragMoveEventId = null;
        this.dragMoveStartY = 0;
        this.dragMoveStartTop = 0;
        this.dragMoveEl = null;

        this.noteContent = '';
        this.noteSaveTimer = null;
        this.noteMode = 'edit';

        this.reminderTimers = [];
        this.notifiedEventIds = new Set();
        this._searchTimer = null;
        this._pendingHighlightId = null;
        this._markerCacheMonth = null;
        this._markerCacheEvents = new Set();
        this._markerCacheNotes = new Set();
        this._searchCase = false;
        this._searchWord = false;
        this._searchRegex = false;

        this._planPickMode = false;
        this._planPickResolve = null;

        this.init();
    }

    init() {
        this.populateTimeSelects();
        this.buildColorPicker();
        this.bindEvents();
        this.bindDocumentDragEvents();
        this.initNotes();
        this.renderCalendar();
        this.renderGrid();
        this.fetchEvents();
        this.fetchNote();
        this.scrollToCurrentTime();
        this.startTimeIndicator();
    }

    /* ---- Date helpers ---- */
    selectedDateStr() { return fmtDateISO(this.selectedDate); }
    isToday(d) { return fmtDateISO(d) === fmtDateISO(new Date()); }
    slotToTime(i) { return `${String(Math.floor(i / 2)).padStart(2, '0')}:${String((i % 2) * 30).padStart(2, '0')}`; }
    timeToSlot(t) { const [h, m] = t.split(':').map(Number); return h * 2 + (m >= 30 ? 1 : 0); }

    /* ================================================================
       CALENDAR SIDEBAR
       ================================================================ */
    renderCalendar() {
        const year = this.calendarMonth.getFullYear(), month = this.calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const dow = firstDay.getDay();
        const startDate = new Date(firstDay);
        startDate.setDate(firstDay.getDate() - (dow === 0 ? 6 : dow - 1));

        const sel = this.selectedDateStr();
        const todayStr = fmtDateISO(new Date());

        const weekdays = (window.I18n && window.I18n.t) ? window.I18n.t('cal.weekdays') : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const weekdaysArr = Array.isArray(weekdays) ? weekdays : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const weekdaysHtml = weekdaysArr.map(w => `<span>${w}</span>`).join('');

        const monthLabel = (window.I18n && window.I18n.formatMonth) ? window.I18n.formatMonth(year, month) : `${year}年${month + 1}月`;
        const todayBtn = (window.I18n && window.I18n.t) ? window.I18n.t('cal.today') : 'Today';

        let html = `<div class="cal-nav"><button class="sch-cal-prev">‹</button><span>${monthLabel}</span><button class="sch-cal-next">›</button></div>`;
        html += `<div class="cal-weekdays">${weekdaysHtml}</div>`;
        html += '<div class="cal-grid">';
        for (let i = 0; i < 42; i++) {
            const day = new Date(startDate);
            day.setDate(startDate.getDate() + i);
            const ds = fmtDateISO(day);
            let cls = 'cal-day';
            if (day.getMonth() !== month) cls += ' other-month';
            if (ds === todayStr) cls += ' today';
            if (ds === sel) cls += ' selected';
            html += `<div class="${cls}" data-date="${ds}">${day.getDate()}</div>`;
        }
        html += '</div>';
        html += `<button class="today-btn">${todayBtn}</button>`;

        const container = document.getElementById('scheduleCal');
        container.innerHTML = html;

        container.querySelector('.sch-cal-prev').addEventListener('click', () => {
            this.calendarMonth.setMonth(this.calendarMonth.getMonth() - 1);
            this.renderCalendar();
        });
        container.querySelector('.sch-cal-next').addEventListener('click', () => {
            this.calendarMonth.setMonth(this.calendarMonth.getMonth() + 1);
            this.renderCalendar();
        });
        container.querySelector('.today-btn').addEventListener('click', () => {
            this.selectedDate = new Date();
            this.calendarMonth = new Date();
            this.onDateChange();
        });
        container.querySelectorAll('.cal-day').forEach(el => {
            el.addEventListener('click', () => {
                const parts = el.dataset.date.split('-');
                this.selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                this.onDateChange();
            });
        });

        this.updateDateLabel();
        this.fetchCalendarMarkers();
    }

    updateDateLabel() {
        const d = this.selectedDate;
        const label = (window.I18n && window.I18n.formatDate) ? window.I18n.formatDate(d) : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
        document.getElementById('scheduleDateLabel').textContent = label;
    }

    onDateChange() {
        this.renderCalendar();
        this.renderGrid();
        this.fetchEvents();
        this.fetchNote();
        this.scrollToCurrentTime();
    }

    /* ================================================================
       GRID RENDERING – Dual Columns
       ================================================================ */
    renderGrid() {
        let gutter = '<div class="time-gutter">';
        for (let i = 0; i < TOTAL_SLOTS; i++) {
            gutter += `<div class="time-label">${i % 2 === 0 ? this.slotToTime(i) : ''}</div>`;
        }
        gutter += '</div>';

        const ds = this.selectedDateStr();
        let cols = '<div class="dual-columns">';
        for (const colType of ['plan', 'actual']) {
            cols += `<div class="day-column col-${colType}" data-col="${colType}" data-date="${ds}">`;
            for (let i = 0; i < TOTAL_SLOTS; i++) {
                cols += `<div class="time-slot" data-slot="${i}"></div>`;
            }
            cols += '</div>';
        }
        cols += '</div>';

        document.getElementById('scheduleGrid').innerHTML = gutter + cols;
        this.bindGridEvents();
    }

    renderEvents() {
        document.querySelectorAll('#scheduleGrid .event').forEach(el => el.remove());
        document.querySelectorAll('#scheduleGrid .time-indicator').forEach(el => el.remove());

        for (const evt of this.events) {
            if (evt.date !== this.selectedDateStr()) continue;
            const colType = evt.col_type || 'plan';
            const col = document.querySelector(`#scheduleGrid .day-column[data-col="${colType}"]`);
            if (!col) continue;

            const startSlot = this.timeToSlot(evt.start_time);
            const endSlot = this.timeToSlot(evt.end_time);
            const top = startSlot * SLOT_HEIGHT;
            const height = Math.max((endSlot - startSlot) * SLOT_HEIGHT, SLOT_HEIGHT * 0.8);

            const el = document.createElement('div');
            el.className = `event priority-${evt.priority}${evt.completed ? ' completed' : ''}`;
            el.dataset.eventId = evt.id;
            el.style.top = top + 'px';
            el.style.height = height + 'px';
            el.style.background = this.hexToRgba(evt.color, evt.completed ? 0.3 : 0.85);
            el.style.color = this.getContrastColor(evt.color);

            const showMeta = height >= SLOT_HEIGHT * 1.6;
            const recurIcon = evt.recur_rule ? ' 🔁' : (evt.recur_parent_id ? ' 🔁' : '');
            el.innerHTML =
                `<div class="resize-handle resize-handle-top"></div>` +
                `<div class="event-title">${escHtml(evt.title)}${recurIcon}</div>` +
                (showMeta ? `<div class="event-meta">${escHtml(evt.start_time)}-${escHtml(evt.end_time)} · ${CATEGORY_ICONS[evt.category] || ''}${escHtml(getCategoryLabel(evt.category))}</div>` : '') +
                `<div class="resize-handle resize-handle-bottom"></div>`;

            el.addEventListener('click', e => {
                if (this.isResizing) return;
                e.stopPropagation();
                if (this._planPickMode) {
                    if (colType === 'plan') this.exitPlanPickMode(evt);
                    return;
                }
                this.showPopover(evt, e);
            });

            col.appendChild(el);

            if (this._pendingHighlightId === evt.id) {
                this._pendingHighlightId = null;
                requestAnimationFrame(() => {
                    el.classList.add('event-highlight');
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    el.addEventListener('animationend', () => el.classList.remove('event-highlight'), { once: true });
                });
            }
        }
        this.updateTimeIndicator();
        this.scheduleReminders();
        if (this.selectedEventId) {
            const sel = document.querySelector(`.event[data-event-id="${this.selectedEventId}"]`);
            if (sel) sel.classList.add('selected');
        }
    }

    scrollToCurrentTime() {
        const grid = document.getElementById('scheduleGrid');
        if (!grid) return;
        const now = new Date();
        grid.scrollTop = Math.max(0, ((now.getHours() * 60 + now.getMinutes()) / 30 - 4) * SLOT_HEIGHT);
    }

    startTimeIndicator() {
        this.updateTimeIndicator();
        if (this._timeIndicatorInterval) clearInterval(this._timeIndicatorInterval);
        this._timeIndicatorInterval = setInterval(() => this.updateTimeIndicator(), 60000);
        this.requestNotificationPermission();
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    scheduleReminders() {
        for (const timer of this.reminderTimers) clearTimeout(timer);
        this.reminderTimers = [];

        if (!this.isToday(this.selectedDate)) return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const now = new Date();
        const todayStr = fmtDateISO(now);
        const planEvents = this.events.filter(
            e => e.date === todayStr && (e.col_type || 'plan') === 'plan' && !e.completed
        );

        const t = (k, p) => (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k;

        for (const evt of planEvents) {
            if (this.notifiedEventIds.has(evt.id)) continue;
            const [h, m] = evt.start_time.split(':').map(Number);
            const eventTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
            const reminderTime = eventTime.getTime() - 5 * 60 * 1000;
            const delay = reminderTime - now.getTime();

            if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
                const timer = setTimeout(() => {
                    this.notifiedEventIds.add(evt.id);
                    new Notification(t('notification.startingSoon'), {
                        body: t('notification.startingIn5', { title: evt.title, time: evt.start_time }),
                        icon: '/static/icons/icon-192.png',
                        tag: `event-${evt.id}`,
                    });
                }, delay);
                this.reminderTimers.push(timer);
            } else if (delay > -60000 && delay <= 0) {
                if (!this.notifiedEventIds.has(`now-${evt.id}`)) {
                    this.notifiedEventIds.add(`now-${evt.id}`);
                    new Notification(t('notification.nowStarting'), {
                        body: t('notification.started', { title: evt.title, time: `${evt.start_time}-${evt.end_time}` }),
                        icon: '/static/icons/icon-192.png',
                        tag: `event-now-${evt.id}`,
                    });
                }
            }
        }
    }

    updateTimeIndicator() {
        document.querySelectorAll('#scheduleGrid .time-indicator').forEach(el => el.remove());
        if (!this.isToday(this.selectedDate)) return;
        const now = new Date();
        const cols = document.querySelectorAll('#scheduleGrid .day-column');
        cols.forEach(col => {
            const ind = document.createElement('div');
            ind.className = 'time-indicator';
            ind.style.top = ((now.getHours() * 60 + now.getMinutes()) / 30) * SLOT_HEIGHT + 'px';
            col.appendChild(ind);
        });
    }

    /* ================================================================
       API
       ================================================================ */
    async fetchEvents() {
        const ds = this.selectedDateStr();
        try {
            await fetch('/api/events/generate-recurring', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start: ds, end: ds }),
            }).catch(() => {});
            const r = await fetch(`/api/events?start=${ds}&end=${ds}`);
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                const msg = (window.I18n && window.I18n.translateError) ? window.I18n.translateError(d.error) : d.error;
                showToast(msg || ((window.I18n && window.I18n.t) ? window.I18n.t('toast.loadFailed') : 'Failed to load events'), { type: 'error' });
                return;
            }
            this.events = await r.json();
            this.renderEvents();
        } catch (e) {
            console.error(e);
            showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.networkError') : 'Network error', { type: 'error' });
        }
    }

    async createEvent(data) {
        try {
            const r = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                const msg = (window.I18n && window.I18n.translateError) ? window.I18n.translateError(d.error) : d.error;
                showToast(msg || ((window.I18n && window.I18n.t) ? window.I18n.t('toast.createFailed') : 'Failed to create event'), { type: 'error' });
                return null;
            }
            const result = await r.json();
            if (result.event) this.events.push(result.event);
            this.renderEvents();
            this._markerCacheMonth = null;
            this.fetchCalendarMarkers();
            return result;
        } catch (e) {
            console.error(e);
            showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.networkError') : 'Network error', { type: 'error' });
            return null;
        }
    }

    async updateEvent(id, data) {
        try {
            const r = await fetch(`/api/events/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                const msg = (window.I18n && window.I18n.translateError) ? window.I18n.translateError(d.error) : d.error;
                showToast(msg || ((window.I18n && window.I18n.t) ? window.I18n.t('toast.updateFailed') : 'Failed to update event'), { type: 'error' });
                return null;
            }
            const u = await r.json();
            const idx = this.events.findIndex(e => e.id === id);
            if (idx !== -1) this.events[idx] = u;
            this.renderEvents();
            this._markerCacheMonth = null;
            this.fetchCalendarMarkers();
            return u;
        } catch (e) {
            console.error(e);
            showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.networkError') : 'Network error', { type: 'error' });
            return null;
        }
    }

    async deleteEvent(id) {
        try {
            const r = await fetch(`/api/events/${id}`, { method: 'DELETE' });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                const msg = (window.I18n && window.I18n.translateError) ? window.I18n.translateError(d.error) : d.error;
                showToast(msg || ((window.I18n && window.I18n.t) ? window.I18n.t('toast.deleteFailed') : 'Failed to delete'), { type: 'error' });
                return null;
            }
            const data = await r.json();
            this.events = this.events.filter(e => e.id !== id);
            this.renderEvents();
            this._markerCacheMonth = null;
            this.fetchCalendarMarkers();
            return data.event;
        } catch (e) {
            console.error(e);
            showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.networkError') : 'Network error', { type: 'error' });
            return null;
        }
    }

    async moveEventToColumn(evt, targetColType, startTime, endTime) {
        if (!this._undoing) this.undoHistory.push({ type: 'delete', eventData: { ...evt } });

        await this.deleteEvent(evt.id);
        const data = {
            title: evt.title, description: evt.description, date: evt.date,
            start_time: startTime, end_time: endTime, color: evt.color,
            category: evt.category, priority: evt.priority, completed: evt.completed,
            col_type: targetColType,
        };
        await this.createEvent(data);
        const key = targetColType === 'actual' ? 'toast.movedToActual' : 'toast.movedToPlan';
        showToast((window.I18n && window.I18n.t) ? window.I18n.t(key) : (targetColType === 'actual' ? 'Moved to Actual column' : 'Moved to Plan column'));
    }

    async batchUpdateEvents(items) {
        try {
            await fetch('/api/events/batch', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(items),
            });
            await this.fetchEvents();
        } catch (e) { console.error(e); }
    }


    /* ================================================================
       PLAN PICK MODE – choose a plan event to prefill actual creation
       ================================================================ */
    enterPlanPickMode() {
        return new Promise(resolve => {
            this._planPickMode = true;
            this._planPickResolve = resolve;

            const _planPickHints = {
                'en':    'Click a plan event to copy its details, or press Esc to skip',
                'zh-CN': '点击一个计划事项来复制其信息，或按 Esc 跳过',
                'zh-TW': '點擊一個計劃事項來複製其資訊，或按 Esc 跳過',
                'fr':    'Cliquez sur un événement planifié pour copier ses détails, ou appuyez sur Échap pour ignorer',
                'de':    'Klicken Sie auf ein geplantes Ereignis zum Kopieren, oder drücken Sie Esc zum Überspringen',
                'ja':    '計画イベントをクリックして詳細をコピー、またはEscでスキップ',
                'ar':    'انقر على حدث مخطط لنسخ تفاصيله، أو اضغط Esc للتخطي',
                'he':    'לחץ על אירוע מתוכנן להעתקת פרטיו, או לחץ Esc לדילוג',
            };
            const _lang = (() => { try { return localStorage.getItem('schedule_planner_lang') || 'en'; } catch(e) { return 'en'; } })();
            const _hintText = _planPickHints[_lang] || _planPickHints['en'];

            const overlay = document.createElement('div');
            overlay.id = 'planPickOverlay';
            overlay.addEventListener('wheel', e => {
                const grid = document.getElementById('scheduleGrid');
                if (grid) grid.scrollTop += e.deltaY;
            }, { passive: true });
            document.body.appendChild(overlay);

            const hint = document.createElement('div');
            hint.id = 'planPickHint';
            hint.textContent = _hintText;
            document.body.appendChild(hint);

            document.body.classList.add('plan-pick-mode');
        });
    }

    exitPlanPickMode(selectedEvt) {
        this._planPickMode = false;
        document.getElementById('planPickOverlay')?.remove();
        document.getElementById('planPickHint')?.remove();
        document.body.classList.remove('plan-pick-mode');
        if (this._planPickResolve) {
            const resolve = this._planPickResolve;
            this._planPickResolve = null;
            resolve(selectedEvt);
        }
    }

    /* ================================================================
       DRAG-TO-CREATE
       ================================================================ */
    bindGridEvents() {
        const container = document.querySelector('#scheduleGrid .dual-columns');
        if (!container) return;

        container.addEventListener('mousedown', e => {
            const handle = e.target.closest('.resize-handle');
            if (handle) {
                this.startResize(handle, e);
                return;
            }

            const slot = e.target.closest('.time-slot');
            if (!slot || e.target.closest('.event')) return;
            e.preventDefault();

            const col = slot.closest('.day-column');
            this.isDragging = true;
            this.dragCol = col.dataset.col;
            this.dragStartSlot = parseInt(slot.dataset.slot);
            this.dragEndSlot = this.dragStartSlot;

            this.dragOverlay = document.createElement('div');
            this.dragOverlay.className = 'selection-overlay';
            col.appendChild(this.dragOverlay);
            this.updateDragOverlay();
            document.querySelectorAll('.event').forEach(el => { el.style.pointerEvents = 'none'; });
        });
    }

    bindDocumentDragEvents() {
        document.addEventListener('mousemove', e => {
            if (this.isResizing) { this.onResizeMove(e); return; }
            if (!this.isDragging) return;
            e.preventDefault();
            const col = document.querySelector(`#scheduleGrid .day-column[data-col="${this.dragCol}"]`);
            if (!col) return;
            const rect = col.getBoundingClientRect();
            const slot = Math.floor((e.clientY - rect.top) / SLOT_HEIGHT);
            this.dragEndSlot = Math.max(0, Math.min(TOTAL_SLOTS - 1, slot));
            this.updateDragOverlay();
        });

        document.addEventListener('mouseup', async e => {
            if (this.isResizing) { this.onResizeEnd(); return; }
            if (!this.isDragging) return;
            this.isDragging = false;
            document.querySelectorAll('.event').forEach(el => { el.style.pointerEvents = ''; });
            if (this.dragOverlay) { this.dragOverlay.remove(); this.dragOverlay = null; }
            const minS = Math.min(this.dragStartSlot, this.dragEndSlot);
            const maxS = Math.max(this.dragStartSlot, this.dragEndSlot) + 1;
            this.editingColType = this.dragCol;
            const dateStr = this.selectedDateStr();
            const startTime = this.slotToTime(minS);
            const endTime = this.slotToTime(Math.min(maxS, TOTAL_SLOTS));

            if (this.dragCol === 'actual') {
                const planEvents = this.events.filter(
                    ev => ev.date === dateStr && (ev.col_type || 'plan') === 'plan'
                );
                if (planEvents.length > 0) {
                    const selectedPlanEvt = await this.enterPlanPickMode();
                    this.showCreateModal(dateStr, startTime, endTime, selectedPlanEvt);
                    return;
                }
            }

            this.showCreateModal(dateStr, startTime, endTime);
        });
    }

    updateDragOverlay() {
        if (!this.dragOverlay) return;
        const minS = Math.min(this.dragStartSlot, this.dragEndSlot);
        const maxS = Math.max(this.dragStartSlot, this.dragEndSlot);
        this.dragOverlay.style.top = minS * SLOT_HEIGHT + 'px';
        this.dragOverlay.style.height = (maxS - minS + 1) * SLOT_HEIGHT + 'px';
    }

    /* ================================================================
       EDGE-DRAG RESIZE WITH CASCADING COMPRESSION
       ================================================================ */
    startResize(handle, e) {
        e.preventDefault();
        e.stopPropagation();

        const eventEl = handle.closest('.event');
        const id = parseInt(eventEl.dataset.eventId);
        const col = eventEl.closest('.day-column');

        this.isResizing = true;
        this.resizeEventId = id;
        this.resizeEdge = handle.classList.contains('resize-handle-top') ? 'top' : 'bottom';
        this.resizeCol = col.dataset.col;

        this.resizeSnapshot = this.getColumnEvents(this.resizeCol).map(ev => ({
            id: ev.id,
            startSlot: this.timeToSlot(ev.start_time),
            endSlot: this.timeToSlot(ev.end_time),
        }));

        eventEl.classList.add('resizing');
        document.querySelectorAll('.event').forEach(el => { el.style.pointerEvents = 'none'; });
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    }

    getColumnEvents(colType) {
        return this.events
            .filter(e => e.date === this.selectedDateStr() && (e.col_type || 'plan') === colType)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
    }

    onResizeMove(e) {
        const col = document.querySelector(`#scheduleGrid .day-column[data-col="${this.resizeCol}"]`);
        if (!col) return;

        const rect = col.getBoundingClientRect();
        let targetSlot = Math.round((e.clientY - rect.top) / SLOT_HEIGHT);
        targetSlot = Math.max(0, Math.min(TOTAL_SLOTS, targetSlot));

        const snapshot = this.resizeSnapshot.map(s => ({ ...s }));
        const idx = snapshot.findIndex(s => s.id === this.resizeEventId);
        if (idx === -1) return;

        if (this.resizeEdge === 'bottom') {
            snapshot[idx].endSlot = Math.max(snapshot[idx].startSlot + MIN_EVENT_SLOTS, targetSlot);
            for (let i = idx + 1; i < snapshot.length; i++) {
                const prev = snapshot[i - 1];
                if (snapshot[i].startSlot < prev.endSlot) {
                    snapshot[i].startSlot = prev.endSlot;
                    if (snapshot[i].endSlot < snapshot[i].startSlot + MIN_EVENT_SLOTS) {
                        snapshot[i].endSlot = snapshot[i].startSlot + MIN_EVENT_SLOTS;
                    }
                }
            }
            const last = snapshot[snapshot.length - 1];
            if (last.endSlot > TOTAL_SLOTS) {
                last.endSlot = TOTAL_SLOTS;
                if (last.startSlot > last.endSlot - MIN_EVENT_SLOTS) {
                    last.startSlot = last.endSlot - MIN_EVENT_SLOTS;
                }
                for (let i = snapshot.length - 2; i >= idx; i--) {
                    const next = snapshot[i + 1];
                    if (snapshot[i].endSlot > next.startSlot) {
                        snapshot[i].endSlot = next.startSlot;
                        if (snapshot[i].startSlot > snapshot[i].endSlot - MIN_EVENT_SLOTS) {
                            snapshot[i].startSlot = snapshot[i].endSlot - MIN_EVENT_SLOTS;
                        }
                    }
                }
            }
        } else {
            snapshot[idx].startSlot = Math.min(snapshot[idx].endSlot - MIN_EVENT_SLOTS, targetSlot);
            for (let i = idx - 1; i >= 0; i--) {
                const next = snapshot[i + 1];
                if (snapshot[i].endSlot > next.startSlot) {
                    snapshot[i].endSlot = next.startSlot;
                    if (snapshot[i].startSlot > snapshot[i].endSlot - MIN_EVENT_SLOTS) {
                        snapshot[i].startSlot = snapshot[i].endSlot - MIN_EVENT_SLOTS;
                    }
                }
            }
            const first = snapshot[0];
            if (first.startSlot < 0) {
                first.startSlot = 0;
                if (first.endSlot < first.startSlot + MIN_EVENT_SLOTS) {
                    first.endSlot = first.startSlot + MIN_EVENT_SLOTS;
                }
                for (let i = 1; i <= idx; i++) {
                    const prev = snapshot[i - 1];
                    if (snapshot[i].startSlot < prev.endSlot) {
                        snapshot[i].startSlot = prev.endSlot;
                        if (snapshot[i].endSlot < snapshot[i].startSlot + MIN_EVENT_SLOTS) {
                            snapshot[i].endSlot = snapshot[i].startSlot + MIN_EVENT_SLOTS;
                        }
                    }
                }
            }
        }

        for (const s of snapshot) {
            const evt = this.events.find(ev => ev.id === s.id);
            if (evt) {
                evt.start_time = this.slotToTime(s.startSlot);
                evt.end_time = this.slotToTime(s.endSlot);
            }
        }
        this.renderEvents();

        const resEl = document.querySelector(`.event[data-event-id="${this.resizeEventId}"]`);
        if (resEl) resEl.classList.add('resizing');
    }

    onResizeEnd() {
        this.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.querySelectorAll('.event').forEach(el => {
            el.style.pointerEvents = '';
            el.classList.remove('resizing');
        });

        const original = this.resizeSnapshot;
        const current = this.getColumnEvents(this.resizeCol).map(ev => ({
            id: ev.id,
            start_time: ev.start_time,
            end_time: ev.end_time,
        }));

        const changed = current.filter(c => {
            const o = original.find(x => x.id === c.id);
            if (!o) return false;
            return this.slotToTime(o.startSlot) !== c.start_time || this.slotToTime(o.endSlot) !== c.end_time;
        });

        if (changed.length > 0) {
            if (!this._undoing) this.undoHistory.push({
                type: 'resize',
                items: original.map(o => ({
                    id: o.id,
                    start_time: this.slotToTime(o.startSlot),
                    end_time: this.slotToTime(o.endSlot),
                })),
            });
            this.batchUpdateEvents(changed);
        }

        this.resizeSnapshot = null;
        this.resizeEventId = null;
    }

    /* ================================================================
       UI HELPERS
       ================================================================ */
    populateTimeSelects() {
        const ss = document.getElementById('eventStart'), es = document.getElementById('eventEnd');
        ss.innerHTML = '';
        es.innerHTML = '';
        for (let i = 0; i < TOTAL_SLOTS; i++) ss.innerHTML += `<option value="${this.slotToTime(i)}">${this.slotToTime(i)}</option>`;
        for (let i = 1; i <= TOTAL_SLOTS; i++) es.innerHTML += `<option value="${this.slotToTime(i)}">${this.slotToTime(i)}</option>`;
    }

    buildColorPicker() {
        const picker = document.getElementById('colorPicker');
        picker.innerHTML = '';
        for (const c of COLORS) {
            const el = document.createElement('div');
            el.className = 'color-option' + (c === this.selectedColor ? ' selected' : '');
            el.style.background = c;
            el.addEventListener('click', () => {
                picker.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
                el.classList.add('selected');
                this.selectedColor = c;
            });
            picker.appendChild(el);
        }
    }

    getNextColor(date) {
        const used = this.events.filter(e => e.date === date).map(e => e.color);
        for (const c of COLORS) { if (!used.includes(c)) return c; }
        return COLORS[used.length % COLORS.length];
    }

    _populateModalSelects() {
        const t = key => (window.I18n && window.I18n.t) ? window.I18n.t(key) : key;
        const categories = [
            { value: '工作', icon: '💼', key: 'category.work' },
            { value: '学习', icon: '📚', key: 'category.study' },
            { value: '个人', icon: '👤', key: 'category.personal' },
            { value: '运动', icon: '🏃', key: 'category.exercise' },
            { value: '其他', icon: '📌', key: 'category.other' },
        ];
        const priorities = [
            { value: '1', icon: '🔴', key: 'priority.high' },
            { value: '2', icon: '🟡', key: 'priority.medium' },
            { value: '3', icon: '🟢', key: 'priority.low' },
        ];
        document.getElementById('eventCategory').innerHTML =
            categories.map(c => `<option value="${c.value}">${c.icon} ${escHtml(t(c.key))}</option>`).join('');
        document.getElementById('eventPriority').innerHTML =
            priorities.map(p => `<option value="${p.value}">${p.icon} ${escHtml(t(p.key))}</option>`).join('');
    }

    showCreateModal(date, startTime, endTime, presetEvt = null) {
        this.editingEvent = null;
        this.selectedColor = presetEvt ? presetEvt.color : this.getNextColor(date);
        document.getElementById('modalTitle').textContent = (window.I18n && window.I18n.t) ? window.I18n.t('modal.newEvent') : 'New Event';
        document.getElementById('eventTitle').value = presetEvt ? presetEvt.title : '';
        document.getElementById('eventDate').value = date;
        document.getElementById('eventStart').value = startTime;
        document.getElementById('eventEnd').value = endTime;
        this._populateModalSelects();
        document.getElementById('eventCategory').value = presetEvt ? presetEvt.category : '工作';
        document.getElementById('eventPriority').value = presetEvt ? String(presetEvt.priority) : '1';
        document.getElementById('eventDescription').value = '';
        document.getElementById('deleteBtn').style.display = 'none';
        document.getElementById('completeBtn').style.display = 'none';
        document.getElementById('saveBtn').textContent = (window.I18n && window.I18n.t) ? window.I18n.t('modal.save') : 'Save';
        this.buildColorPicker();
        this.openModal();
        setTimeout(() => document.getElementById('eventTitle').focus(), 100);
    }

    showEditModal(event) {
        this.editingEvent = event;
        this.editingColType = event.col_type || 'plan';
        this.selectedColor = event.color;
        document.getElementById('modalTitle').textContent = (window.I18n && window.I18n.t) ? window.I18n.t('modal.editEvent') : 'Edit Event';
        document.getElementById('eventTitle').value = event.title;
        document.getElementById('eventDate').value = event.date;
        document.getElementById('eventStart').value = event.start_time;
        document.getElementById('eventEnd').value = event.end_time;
        this._populateModalSelects();
        document.getElementById('eventCategory').value = event.category;
        document.getElementById('eventPriority').value = String(event.priority);
        document.getElementById('eventDescription').value = event.description || '';
        document.getElementById('deleteBtn').style.display = 'inline-flex';
        document.getElementById('completeBtn').style.display = 'none';
        document.getElementById('saveBtn').textContent = (window.I18n && window.I18n.t) ? window.I18n.t('modal.update') : 'Update';
        this.buildColorPicker();
        this.openModal();
    }

    openModal() { document.getElementById('modalOverlay').classList.add('active'); }
    closeModal() { document.getElementById('modalOverlay').classList.remove('active'); this.editingEvent = null; this.editingColType = null; }

    async saveEvent() {
        const title = document.getElementById('eventTitle').value.trim();
        if (!title) {
            const el = document.getElementById('eventTitle');
            el.focus();
            el.style.borderColor = 'var(--danger)';
            setTimeout(() => el.style.borderColor = '', 2000);
            return;
        }
        const data = {
            title,
            date: document.getElementById('eventDate').value,
            start_time: document.getElementById('eventStart').value,
            end_time: document.getElementById('eventEnd').value,
            color: this.selectedColor,
            category: document.getElementById('eventCategory').value,
            priority: parseInt(document.getElementById('eventPriority').value),
            description: document.getElementById('eventDescription').value.trim(),
            completed: this.editingEvent ? this.editingEvent.completed : 0,
        };
        if (data.start_time >= data.end_time) {
            showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.startTimeError') : 'End time must be after start time');
            return;
        }

        if (this.editingEvent) {
            if (!this._undoing) this.undoHistory.push({ type: 'edit', id: this.editingEvent.id, prevData: { ...this.editingEvent } });
            await this.updateEvent(this.editingEvent.id, data);
            showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.eventUpdated') : 'Event updated');
        } else {
            const colType = this.editingColType || 'plan';
            data.col_type = colType;
            const result = await this.createEvent(data);
            if (result && result.event) {
                if (!this._undoing) this.undoHistory.push({ type: 'create', eventIds: [result.event.id] });
            }
            showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.eventCreated') : 'Event created');
        }
        this.closeModal();
    }

    selectEvent(id) {
        this.deselectEvent();
        this.selectedEventId = id;
        const el = document.querySelector(`.event[data-event-id="${id}"]`);
        if (el) el.classList.add('selected');
    }

    deselectEvent() {
        this.selectedEventId = null;
        document.querySelectorAll('.event.selected').forEach(el => el.classList.remove('selected'));
    }

    showPopover(event, mouseEvent) {
        this.hidePopover();
        this.popoverEventId = event.id;
        this.selectEvent(event.id);

        const isActual = (event.col_type || 'plan') === 'actual';
        const completeBtn = document.getElementById('popoverComplete');
        if (isActual) {
            completeBtn.style.display = 'none';
        } else {
            completeBtn.style.display = '';
            const undoLabel = (window.I18n && window.I18n.t) ? window.I18n.t('popover.undoComplete') : 'Undo Complete';
            const completeLabel = (window.I18n && window.I18n.t) ? window.I18n.t('popover.complete') : 'Complete';
            completeBtn.innerHTML = event.completed
                ? `<span class="popover-icon">↩</span> ${undoLabel}`
                : `<span class="popover-icon">✓</span> ${completeLabel}`;
        }

        const rect = mouseEvent.target.closest('.event').getBoundingClientRect();
        let left = rect.right + 6, top = rect.top;
        if (left + 140 > window.innerWidth) left = rect.left - 140;
        if (top + 130 > window.innerHeight) top = window.innerHeight - 140;
        const pop = document.getElementById('actionPopover');
        pop.style.left = left + 'px';
        pop.style.top = Math.max(4, top) + 'px';
        pop.classList.add('active');
    }

    hidePopover() { document.getElementById('actionPopover').classList.remove('active'); this.popoverEventId = null; }

    async handlePopoverAction(action) {
        const id = this.popoverEventId || this.selectedEventId;
        const event = this.events.find(e => e.id === id);
        if (!event) return;
        this.hidePopover();
        if (action === 'complete') {
            if ((event.col_type || 'plan') === 'actual') return;
            const prevCompleted = event.completed;
            if (!this._undoing) this.undoHistory.push({ type: 'complete', id, prevCompleted });
            await this.updateEvent(id, { ...event, completed: prevCompleted ? 0 : 1 });
            const msg = prevCompleted
                ? ((window.I18n && window.I18n.t) ? window.I18n.t('toast.unmarkedComplete') : 'Unmarked complete')
                : ((window.I18n && window.I18n.t) ? window.I18n.t('toast.markedComplete') : 'Marked complete ✓');
            showToast(msg);
        } else if (action === 'edit') {
            this.showEditModal(event);
        } else if (action === 'delete') {
            if (!this._undoing) this.undoHistory.push({ type: 'delete', eventData: { ...event } });
            const d = await this.deleteEvent(id);
            if (d) {
                showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.eventDeleted') : 'Event deleted', { undo: true });
            }
            this.deselectEvent();
        }
    }

    undoLastAction() {
        document.getElementById('toast').classList.remove('active');
        this.undo();
    }

    async undo() {
        const t = (k) => (window.I18n && window.I18n.t) ? window.I18n.t(k) : k;
        if (this.undoHistory.length === 0) {
            showToast(t('toast.noUndo'));
            return;
        }
        const action = this.undoHistory.pop();
        this._undoing = true;
        try {
            if (action.type === 'create') {
                for (const id of action.eventIds) {
                    await fetch(`/api/events/${id}`, { method: 'DELETE' });
                    this.events = this.events.filter(e => e.id !== id);
                }
                this.renderEvents();
                showToast(t('toast.undoCreate'));
            } else if (action.type === 'edit') {
                await this.updateEvent(action.id, action.prevData);
                showToast(t('toast.undoEdit'));
            } else if (action.type === 'delete') {
                const ev = action.eventData;
                await this.createEvent({
                    title: ev.title, description: ev.description, date: ev.date,
                    start_time: ev.start_time, end_time: ev.end_time, color: ev.color,
                    category: ev.category, priority: ev.priority, completed: ev.completed,
                    col_type: ev.col_type || 'plan',
                });
                showToast(t('toast.undoDelete'));
            } else if (action.type === 'complete') {
                const evt = this.events.find(e => e.id === action.id);
                if (evt) {
                    await this.updateEvent(action.id, { ...evt, completed: action.prevCompleted });
                    showToast(t('toast.undoComplete'));
                }
            } else if (action.type === 'resize') {
                await this.batchUpdateEvents(action.items);
                showToast(t('toast.undoResize'));
            }
        } finally {
            this._undoing = false;
        }
    }

    bindEvents() {
        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveEvent());
        document.getElementById('deleteBtn').addEventListener('click', async () => {
            if (!this.editingEvent) return;
            const ev = this.editingEvent;
            if (!this._undoing) this.undoHistory.push({ type: 'delete', eventData: { ...ev } });
            await this.deleteEvent(ev.id);
            this.closeModal();
            showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.eventDeleted') : 'Event deleted', { undo: true });
        });
        document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) this.closeModal(); });
        document.getElementById('popoverComplete').addEventListener('click', () => this.handlePopoverAction('complete'));
        document.getElementById('popoverEdit').addEventListener('click', () => this.handlePopoverAction('edit'));
        document.getElementById('popoverDelete').addEventListener('click', () => this.handlePopoverAction('delete'));
        document.getElementById('toastAction').addEventListener('click', () => this.undoLastAction());
        document.addEventListener('click', e => {
            if (!e.target.closest('.popover') && !e.target.closest('.event')) {
                this.hidePopover();
                this.deselectEvent();
            }
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (this._planPickMode) {
                    this.exitPlanPickMode(null);
                    return;
                }
                if (document.getElementById('searchDropdown').classList.contains('active')) {
                    this._closeSearch(); return;
                }
                if (document.getElementById('actionPopover').classList.contains('active')) this.hidePopover();
                else if (document.getElementById('modalOverlay').classList.contains('active')) this.closeModal();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                const activeTag = document.activeElement.tagName;
                if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
                e.preventDefault();
                this.undo();
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey && document.getElementById('modalOverlay').classList.contains('active') && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                this.saveEvent();
                return;
            }

            if (document.getElementById('modalOverlay').classList.contains('active')) return;
            const tag = document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            if (e.key === 'Enter' && this.selectedEventId) {
                e.preventDefault();
                this.handlePopoverAction('edit');
                return;
            }

            if ((e.key === 'Backspace' || e.key === 'Delete') && this.selectedEventId) {
                e.preventDefault();
                this.handlePopoverAction('delete');
                return;
            }

            if (e.key === ' ' && this.selectedEventId) {
                const evt = this.events.find(ev => ev.id === this.selectedEventId);
                if (evt && (evt.col_type || 'plan') === 'plan') {
                    e.preventDefault();
                    this.handlePopoverAction('complete');
                }
                return;
            }

            if (e.key === 'n' || e.key === 'N') {
                if (document.querySelector('.page.active')?.id !== 'schedulePage') return;
                e.preventDefault();
                const now = new Date();
                const startSlot = now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0);
                const endSlot = Math.min(startSlot + 2, TOTAL_SLOTS);
                this.editingColType = 'plan';
                this.showCreateModal(this.selectedDateStr(), this.slotToTime(startSlot), this.slotToTime(endSlot));
            }
        });

        // Search
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
    }

    /* ================================================================
       NOTES PANEL
       ================================================================ */
    initNotes() {
        if (typeof marked !== 'undefined') {
            const extensions = [];
            if (typeof katex !== 'undefined') {
                extensions.push({
                    name: 'mathBlock',
                    level: 'block',
                    start(src) { return src.indexOf('$$'); },
                    tokenizer(src) {
                        const match = src.match(/^\$\$([\s\S]+?)\$\$/);
                        if (match) return { type: 'mathBlock', raw: match[0], text: match[1].trim() };
                    },
                    renderer(token) {
                        try { return '<div class="math-block">' + katex.renderToString(token.text, { throwOnError: false, displayMode: true }) + '</div>'; }
                        catch (e) { return '<pre>' + token.raw + '</pre>'; }
                    }
                });
                extensions.push({
                    name: 'mathInline',
                    level: 'inline',
                    start(src) { return src.indexOf('$'); },
                    tokenizer(src) {
                        const match = src.match(/^\$([^\$\n]+?)\$/);
                        if (match) return { type: 'mathInline', raw: match[0], text: match[1] };
                    },
                    renderer(token) {
                        try { return katex.renderToString(token.text, { throwOnError: false }); }
                        catch (e) { return '<code>' + token.raw + '</code>'; }
                    }
                });
            }
            marked.use({
                breaks: true,
                gfm: true,
                extensions,
            });
        }

        const editor = document.getElementById('notesEditor');
        editor.addEventListener('input', () => {
            this.noteContent = editor.value;
            this.renderNotePreview();
            this.debounceSaveNote();
        });

        editor.addEventListener('keydown', e => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = editor.selectionStart;
                const end = editor.selectionEnd;
                const value = editor.value;

                if (start !== end) {
                    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                    let effectiveEnd = end;
                    if (end > start && value[end - 1] === '\n') effectiveEnd = end - 1;
                    let lineEnd = value.indexOf('\n', effectiveEnd);
                    if (lineEnd === -1) lineEnd = value.length;

                    const block = value.substring(lineStart, lineEnd);
                    const lines = block.split('\n');

                    if (e.shiftKey) {
                        let totalRemoved = 0;
                        let firstLineRemoved = 0;
                        const newLines = lines.map((line, i) => {
                            const m = line.match(/^( {1,2})/);
                            const removed = m ? m[1].length : 0;
                            totalRemoved += removed;
                            if (i === 0) firstLineRemoved = removed;
                            return removed > 0 ? line.substring(removed) : line;
                        });
                        editor.value = value.substring(0, lineStart) + newLines.join('\n') + value.substring(lineEnd);
                        editor.selectionStart = Math.max(lineStart, start - firstLineRemoved);
                        editor.selectionEnd = end - totalRemoved;
                    } else {
                        const newBlock = lines.map(l => '  ' + l).join('\n');
                        editor.value = value.substring(0, lineStart) + newBlock + value.substring(lineEnd);
                        editor.selectionStart = start + 2;
                        editor.selectionEnd = end + lines.length * 2;
                    }
                } else {
                    if (e.shiftKey) {
                        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                        const m = value.substring(lineStart).match(/^( {1,2})/);
                        if (m) {
                            const removed = m[1].length;
                            editor.value = value.substring(0, lineStart) + value.substring(lineStart + removed);
                            editor.selectionStart = editor.selectionEnd = Math.max(lineStart, start - removed);
                        }
                    } else {
                        editor.value = value.substring(0, start) + '  ' + value.substring(end);
                        editor.selectionStart = editor.selectionEnd = start + 2;
                    }
                }
                editor.dispatchEvent(new Event('input'));
            }
        });

        document.querySelectorAll('.notes-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.notes-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const mode = tab.dataset.mode;
                this.noteMode = mode;
                const body = document.querySelector('.notes-body');
                body.classList.remove('preview-only', 'edit-only');
                if (mode === 'preview') body.classList.add('preview-only');
                this.renderNotePreview();
            });
        });
    }

    async fetchNote() {
        this.flushPendingNoteSave();
        try {
            const r = await fetch(`/api/notes?date=${this.selectedDateStr()}`);
            const data = await r.json();
            this.noteContent = data.content || '';
            document.getElementById('notesEditor').value = this.noteContent;
            this.renderNotePreview();
        } catch (e) { console.error(e); }
    }

    updateSaveIndicator(state) {
        const ind = document.getElementById('noteSaveIndicator');
        if (!ind) return;
        ind.className = 'note-save-indicator';
        const t = (k) => (window.I18n && window.I18n.t) ? window.I18n.t(k) : k;
        if (state === 'saving') {
            ind.textContent = t('schedule.notesSaveIndicator.saving');
            ind.classList.add('saving');
        } else if (state === 'saved') {
            ind.textContent = t('schedule.notesSaveIndicator.saved');
            ind.classList.add('saved');
            clearTimeout(this._savedIndicatorTimer);
            this._savedIndicatorTimer = setTimeout(() => {
                ind.textContent = '';
                ind.className = 'note-save-indicator';
            }, 2000);
        } else {
            ind.textContent = '';
        }
    }

    debounceSaveNote() {
        if (this.noteSaveTimer) clearTimeout(this.noteSaveTimer);
        const dateToSave = this.selectedDateStr();
        const contentToSave = this.noteContent;
        this._pendingNoteSave = { date: dateToSave, content: contentToSave };
        this.updateSaveIndicator('saving');
        this.noteSaveTimer = setTimeout(async () => {
            this.noteSaveTimer = null;
            this._pendingNoteSave = null;
            try {
                const r = await fetch('/api/notes', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date: dateToSave, content: contentToSave }),
                });
                if (!r.ok) {
                    this.updateSaveIndicator('');
                    showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.noteSaveFailed') : 'Failed to save note', { type: 'error' });
                    return;
                }
                this.updateSaveIndicator('saved');
                this._markerCacheMonth = null;
                this.fetchCalendarMarkers();
            } catch (e) {
                console.error(e);
                this.updateSaveIndicator('');
                showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.noteNetworkError') : 'Network error, failed to save note', { type: 'error' });
            }
        }, 800);
    }

    flushPendingNoteSave() {
        if (this.noteSaveTimer) {
            clearTimeout(this.noteSaveTimer);
            this.noteSaveTimer = null;
        }
        if (this._pendingNoteSave) {
            const { date, content } = this._pendingNoteSave;
            this._pendingNoteSave = null;
            fetch('/api/notes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, content }),
            }).catch(e => console.error(e));
        }
    }

    async saveNote() {
        try {
            await fetch('/api/notes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: this.selectedDateStr(), content: this.noteContent }),
            });
        } catch (e) { console.error(e); }
    }

    renderNotePreview() {
        const preview = document.getElementById('notesPreview');
        const emptyText = (window.I18n && window.I18n.t) ? window.I18n.t('schedule.previewEmpty') : 'Preview area — type Markdown content in the editor above';
        if (!this.noteContent.trim()) {
            preview.innerHTML = `<p style="color:var(--text-muted);font-style:italic">${emptyText}</p>`;
            return;
        }
        if (typeof marked !== 'undefined') {
            let content = this.noteContent.replace(/\n{2,}/g, match => {
                const extra = match.length - 1;
                return '\n\n' + '<div class="blank-line"></div>\n\n'.repeat(extra);
            });
            let html = marked.parse(content);
            html = html.replace(/<br\s*\/?>/g, '<span class="hard-break"></span>');
            if (typeof DOMPurify !== 'undefined') {
                html = DOMPurify.sanitize(html, { ADD_TAGS: ['span'], ADD_ATTR: ['class'] });
            }
            preview.innerHTML = html;
        } else {
            preview.textContent = this.noteContent;
        }
    }

    _onSearchInput(q) {
        clearTimeout(this._searchTimer);
        if (!q) { this._closeSearchDropdown(); return; }
        this._searchTimer = setTimeout(() => this._performSearch(q), 300);
    }

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
    }

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
                    return `<div class="search-result-item" data-type="note" data-date="${escHtml(item.date)}">
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
                        this._jumpToDate(date, null);
                    } else {
                        this._jumpToDate(date, parseInt(el.dataset.eventId, 10));
                    }
                });
            });
        }
        dropdown.classList.add('active');
    }

    _closeSearchDropdown() {
        document.getElementById('searchDropdown')?.classList.remove('active');
    }

    _closeSearch() {
        const inp = document.getElementById('searchInput');
        const btn = document.getElementById('searchClearBtn');
        if (inp) { inp.value = ''; inp.classList.remove('regex-error'); }
        if (btn) btn.style.display = 'none';
        this._closeSearchDropdown();
    }

    _jumpToDate(dateStr, highlightEventId) {
        const [y, m, d] = dateStr.split('-').map(Number);
        this.selectedDate = new Date(y, m - 1, d);
        this._pendingHighlightId = highlightEventId;
        this.onDateChange();
    }

    async fetchCalendarMarkers() {
        const year  = this.calendarMonth.getFullYear();
        const month = this.calendarMonth.getMonth();
        const cacheKey = `${year}-${month}`;
        if (this._markerCacheMonth === cacheKey) {
            this._applyCalendarMarkers();
            return;
        }
        const start = fmtDateISO(new Date(year, month, 1));
        const end   = fmtDateISO(new Date(year, month + 1, 0));
        try {
            const [evtRes, noteRes] = await Promise.all([
                fetch(`/api/events/dates?start=${start}&end=${end}`),
                fetch(`/api/notes/dates?start=${start}&end=${end}`),
            ]);
            this._markerCacheEvents = new Set(evtRes.ok  ? await evtRes.json()  : []);
            this._markerCacheNotes  = new Set(noteRes.ok ? await noteRes.json() : []);
            this._markerCacheMonth  = cacheKey;
            this._applyCalendarMarkers();
        } catch (e) { /* ignore */ }
    }

    _applyCalendarMarkers() {
        document.querySelectorAll('#scheduleCal .cal-day').forEach(el => {
            el.querySelectorAll('.cal-markers').forEach(m => m.remove());
            const ds = el.dataset.date;
            const hasEvent = this._markerCacheEvents.has(ds);
            const hasNote  = this._markerCacheNotes.has(ds);
            if (!hasEvent && !hasNote) return;
            const wrap = document.createElement('div');
            wrap.className = 'cal-markers';
            if (hasEvent) wrap.insertAdjacentHTML('beforeend', '<span class="cal-marker cal-marker-event"></span>');
            if (hasNote)  wrap.insertAdjacentHTML('beforeend', '<span class="cal-marker cal-marker-note"></span>');
            el.appendChild(wrap);
        });
    }

    hexToRgba(hex, a) { return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`; }
    getContrastColor(hex) { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#2d3436' : '#ffffff'; }
}
