import { COLORS, CATEGORY_ICONS, SLOT_HEIGHT, TOTAL_SLOTS, MIN_EVENT_SLOTS, DAY_NAMES } from './constants.js';
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

        let html = `<div class="cal-nav"><button class="sch-cal-prev">‹</button><span>${year}年${month + 1}月</span><button class="sch-cal-next">›</button></div>`;
        html += '<div class="cal-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>';
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
        html += '<button class="today-btn">回到今天</button>';

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
    }

    updateDateLabel() {
        const d = this.selectedDate;
        document.getElementById('scheduleDateLabel').textContent =
            `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${DAY_NAMES[d.getDay()]}`;
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
                (showMeta ? `<div class="event-meta">${escHtml(evt.start_time)}-${escHtml(evt.end_time)} · ${CATEGORY_ICONS[evt.category] || ''}${escHtml(evt.category)}</div>` : '') +
                `<div class="resize-handle resize-handle-bottom"></div>`;

            el.setAttribute('draggable', 'true');
            el.addEventListener('dragstart', e => {
                if (this.isResizing) { e.preventDefault(); return; }
                this.dragMoveEventId = evt.id;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(evt.id));
                el.classList.add('dragging');
            });
            el.addEventListener('dragend', () => {
                el.classList.remove('dragging');
                this.dragMoveEventId = null;
            });

            el.addEventListener('click', e => {
                if (this.isResizing) return;
                e.stopPropagation();
                this.showPopover(evt, e);
            });

            col.appendChild(el);
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

        for (const evt of planEvents) {
            if (this.notifiedEventIds.has(evt.id)) continue;
            const [h, m] = evt.start_time.split(':').map(Number);
            const eventTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
            const reminderTime = eventTime.getTime() - 5 * 60 * 1000;
            const delay = reminderTime - now.getTime();

            if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
                const timer = setTimeout(() => {
                    this.notifiedEventIds.add(evt.id);
                    new Notification('即将开始', {
                        body: `"${evt.title}" 将在 5 分钟后开始 (${evt.start_time})`,
                        icon: '/static/icons/icon-192.png',
                        tag: `event-${evt.id}`,
                    });
                }, delay);
                this.reminderTimers.push(timer);
            } else if (delay > -60000 && delay <= 0) {
                if (!this.notifiedEventIds.has(`now-${evt.id}`)) {
                    this.notifiedEventIds.add(`now-${evt.id}`);
                    new Notification('现在开始', {
                        body: `"${evt.title}" 已经开始 (${evt.start_time}-${evt.end_time})`,
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
            if (!r.ok) { const d = await r.json().catch(() => ({})); showToast(d.error || '加载日程失败', { type: 'error' }); return; }
            this.events = await r.json();
            this.renderEvents();
        } catch (e) { console.error(e); showToast('网络错误，无法加载日程', { type: 'error' }); }
    }

    async createEvent(data) {
        try {
            const r = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!r.ok) { const d = await r.json().catch(() => ({})); showToast(d.error || '创建日程失败', { type: 'error' }); return null; }
            const result = await r.json();
            if (result.event) this.events.push(result.event);
            this.renderEvents();
            return result;
        } catch (e) { console.error(e); showToast('网络错误', { type: 'error' }); return null; }
    }

    async updateEvent(id, data) {
        try {
            const r = await fetch(`/api/events/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!r.ok) { const d = await r.json().catch(() => ({})); showToast(d.error || '更新日程失败', { type: 'error' }); return null; }
            const u = await r.json();
            const idx = this.events.findIndex(e => e.id === id);
            if (idx !== -1) this.events[idx] = u;
            this.renderEvents();
            return u;
        } catch (e) { console.error(e); showToast('网络错误', { type: 'error' }); return null; }
    }

    async deleteEvent(id) {
        try {
            const r = await fetch(`/api/events/${id}`, { method: 'DELETE' });
            if (!r.ok) { const d = await r.json().catch(() => ({})); showToast(d.error || '删除失败', { type: 'error' }); return null; }
            const data = await r.json();
            this.events = this.events.filter(e => e.id !== id);
            this.renderEvents();
            return data.event;
        } catch (e) { console.error(e); showToast('网络错误', { type: 'error' }); return null; }
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
        showToast(`已移动到${targetColType === 'actual' ? '实际执行' : '计划'}列`);
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
       DRAG-TO-CREATE
       ================================================================ */
    bindGridEvents() {
        const container = document.querySelector('#scheduleGrid .dual-columns');
        if (!container) return;

        container.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        container.addEventListener('drop', e => {
            e.preventDefault();
            const eventId = parseInt(e.dataTransfer.getData('text/plain'));
            if (!eventId) return;
            const targetCol = e.target.closest('.day-column');
            if (!targetCol) return;
            const targetColType = targetCol.dataset.col;
            const evt = this.events.find(ev => ev.id === eventId);
            if (!evt) return;
            const currentColType = evt.col_type || 'plan';

            const rect = targetCol.getBoundingClientRect();
            const slot = Math.floor((e.clientY - rect.top) / SLOT_HEIGHT);
            const startSlot = Math.max(0, Math.min(slot, TOTAL_SLOTS - 1));
            const duration = this.timeToSlot(evt.end_time) - this.timeToSlot(evt.start_time);
            const endSlot = Math.min(startSlot + Math.max(duration, MIN_EVENT_SLOTS), TOTAL_SLOTS);

            if (currentColType !== targetColType) {
                this.moveEventToColumn(evt, targetColType, this.slotToTime(startSlot), this.slotToTime(endSlot));
            } else {
                this.updateEvent(evt.id, { ...evt, start_time: this.slotToTime(startSlot), end_time: this.slotToTime(endSlot) });
            }
        });

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

        document.addEventListener('mouseup', e => {
            if (this.isResizing) { this.onResizeEnd(); return; }
            if (!this.isDragging) return;
            this.isDragging = false;
            document.querySelectorAll('.event').forEach(el => { el.style.pointerEvents = ''; });
            if (this.dragOverlay) { this.dragOverlay.remove(); this.dragOverlay = null; }
            const minS = Math.min(this.dragStartSlot, this.dragEndSlot);
            const maxS = Math.max(this.dragStartSlot, this.dragEndSlot) + 1;
            this.editingColType = this.dragCol;
            this.showCreateModal(this.selectedDateStr(), this.slotToTime(minS), this.slotToTime(Math.min(maxS, TOTAL_SLOTS)));
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

    showCreateModal(date, startTime, endTime) {
        this.editingEvent = null;
        this.selectedColor = this.getNextColor(date);
        document.getElementById('modalTitle').textContent = '新建日程';
        document.getElementById('eventTitle').value = '';
        document.getElementById('eventDate').value = date;
        document.getElementById('eventStart').value = startTime;
        document.getElementById('eventEnd').value = endTime;
        document.getElementById('eventCategory').value = '工作';
        document.getElementById('eventPriority').value = '1';
        document.getElementById('eventDescription').value = '';
        document.getElementById('eventRecur').value = '';
        document.getElementById('deleteBtn').style.display = 'none';
        document.getElementById('completeBtn').style.display = 'none';
        document.getElementById('saveBtn').textContent = '保存';
        this.buildColorPicker();
        this.openModal();
        setTimeout(() => document.getElementById('eventTitle').focus(), 100);
    }

    showEditModal(event) {
        this.editingEvent = event;
        this.editingColType = event.col_type || 'plan';
        this.selectedColor = event.color;
        document.getElementById('modalTitle').textContent = '编辑日程';
        document.getElementById('eventTitle').value = event.title;
        document.getElementById('eventDate').value = event.date;
        document.getElementById('eventStart').value = event.start_time;
        document.getElementById('eventEnd').value = event.end_time;
        document.getElementById('eventCategory').value = event.category;
        document.getElementById('eventPriority').value = String(event.priority);
        document.getElementById('eventDescription').value = event.description || '';
        document.getElementById('eventRecur').value = event.recur_rule || '';
        document.getElementById('deleteBtn').style.display = 'inline-flex';
        document.getElementById('completeBtn').style.display = 'none';
        document.getElementById('saveBtn').textContent = '更新';
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
            recur_rule: document.getElementById('eventRecur').value || null,
        };
        if (data.start_time >= data.end_time) { showToast('结束时间必须晚于开始时间'); return; }

        if (this.editingEvent) {
            if (!this._undoing) this.undoHistory.push({ type: 'edit', id: this.editingEvent.id, prevData: { ...this.editingEvent } });
            await this.updateEvent(this.editingEvent.id, data);
            showToast('日程已更新');
        } else {
            const colType = this.editingColType || 'plan';
            data.col_type = colType;
            const result = await this.createEvent(data);
            if (result && result.event) {
                if (!this._undoing) this.undoHistory.push({ type: 'create', eventIds: [result.event.id] });
            }
            showToast('日程已创建');
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
            completeBtn.innerHTML = event.completed
                ? '<span class="popover-icon">↩</span> 取消完成'
                : '<span class="popover-icon">✓</span> 完成';
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
            showToast(prevCompleted ? '已取消完成' : '已标记完成 ✓');
        } else if (action === 'edit') {
            this.showEditModal(event);
        } else if (action === 'delete') {
            if (!this._undoing) this.undoHistory.push({ type: 'delete', eventData: { ...event } });
            const d = await this.deleteEvent(id);
            if (d) { showToast('日程已删除', { undo: true }); }
            this.deselectEvent();
        }
    }

    undoLastAction() {
        document.getElementById('toast').classList.remove('active');
        this.undo();
    }

    async undo() {
        if (this.undoHistory.length === 0) { showToast('没有可撤销的操作'); return; }
        const action = this.undoHistory.pop();
        this._undoing = true;
        try {
            if (action.type === 'create') {
                for (const id of action.eventIds) {
                    await fetch(`/api/events/${id}`, { method: 'DELETE' });
                    this.events = this.events.filter(e => e.id !== id);
                }
                this.renderEvents();
                showToast('已撤销创建');
            } else if (action.type === 'edit') {
                await this.updateEvent(action.id, action.prevData);
                showToast('已撤销编辑');
            } else if (action.type === 'delete') {
                const ev = action.eventData;
                await this.createEvent({
                    title: ev.title, description: ev.description, date: ev.date,
                    start_time: ev.start_time, end_time: ev.end_time, color: ev.color,
                    category: ev.category, priority: ev.priority, completed: ev.completed,
                    col_type: ev.col_type || 'plan',
                });
                showToast('已撤销删除');
            } else if (action.type === 'complete') {
                const evt = this.events.find(e => e.id === action.id);
                if (evt) {
                    await this.updateEvent(action.id, { ...evt, completed: action.prevCompleted });
                    showToast('已撤销完成状态变更');
                }
            } else if (action.type === 'resize') {
                await this.batchUpdateEvents(action.items);
                showToast('已撤销调整');
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
            showToast('日程已删除', { undo: true });
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
        if (state === 'saving') {
            ind.textContent = '保存中...';
            ind.classList.add('saving');
        } else if (state === 'saved') {
            ind.textContent = '已保存';
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
                if (!r.ok) { this.updateSaveIndicator(''); showToast('笔记保存失败', { type: 'error' }); return; }
                this.updateSaveIndicator('saved');
            } catch (e) {
                console.error(e);
                this.updateSaveIndicator('');
                showToast('网络错误，笔记保存失败', { type: 'error' });
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
        if (!this.noteContent.trim()) {
            preview.innerHTML = '<p style="color:var(--text-muted);font-style:italic">预览区域 — 在上方编辑器中输入 Markdown 内容</p>';
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

    hexToRgba(hex, a) { return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`; }
    getContrastColor(hex) { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#2d3436' : '#ffffff'; }
}
