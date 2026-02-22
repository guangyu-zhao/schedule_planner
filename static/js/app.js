const COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#DDA0DD', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8B500', '#6DBAAF', '#E8836B', '#7FB3D8',
    '#E056A0', '#00CEC9', '#FD79A8', '#55E6C1',
    '#FDA7DF', '#74B9FF', '#A3CB38', '#D980FA',
];
const CATEGORY_ICONS = { '工作': '💼', '学习': '📚', '个人': '👤', '运动': '🏃', '其他': '📌' };
const CATEGORY_COLORS = { '工作': '#6c5ce7', '学习': '#00b894', '个人': '#0984e3', '运动': '#e17055', '其他': '#b2bec3' };
const PRIORITY_LABELS = { 1: '高', 2: '中', 3: '低' };
const PRIORITY_COLORS = { 1: '#e74c3c', 2: '#fdcb6e', 3: '#00b894' };
const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const SLOT_HEIGHT = 28;
const TOTAL_SLOTS = 48;
const RING_CIRCUMFERENCE = 2 * Math.PI * 126;
const MIN_EVENT_SLOTS = 1;

/* ================================================================
   TAB NAVIGATION
   ================================================================ */
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.page + 'Page').classList.add('active');
            if (tab.dataset.page === 'stats' && window.stats) window.stats.onTabActive();
        });
    });
}

/* ================================================================
   HELPERS
   ================================================================ */
function fmtDateISO(date) {
    const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function escHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

/* ================================================================
   PLANNER APP (Schedule) – Dual-Column Single-Day View
   ================================================================ */
class PlannerApp {
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
        this.lastDeletedEvent = null;
        this.toastTimer = null;
        this.popoverEventId = null;
        this.selectedEventId = null;
        this.undoHistory = [];
        this._undoing = false;

        this.noteContent = '';
        this.noteSaveTimer = null;
        this.noteMode = 'edit';

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
        this.fetchStats();
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
        this.fetchStats();
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
            el.innerHTML =
                `<div class="resize-handle resize-handle-top"></div>` +
                `<div class="event-title">${escHtml(evt.title)}</div>` +
                (showMeta ? `<div class="event-meta">${evt.start_time}-${evt.end_time} · ${CATEGORY_ICONS[evt.category] || ''}${evt.category}</div>` : '') +
                `<div class="resize-handle resize-handle-bottom"></div>`;

            el.addEventListener('click', e => {
                if (this.isResizing) return;
                e.stopPropagation();
                this.showPopover(evt, e);
            });

            col.appendChild(el);
        }
        this.updateTimeIndicator();
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

    startTimeIndicator() { this.updateTimeIndicator(); setInterval(() => this.updateTimeIndicator(), 60000); }

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
            const r = await fetch(`/api/events?start=${ds}&end=${ds}`);
            this.events = await r.json();
            this.renderEvents();
        } catch (e) { console.error(e); }
    }

    async createEvent(data) {
        try {
            const r = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const result = await r.json();
            if (result.plan) this.events.push(result.plan);
            if (result.actual) this.events.push(result.actual);
            this.renderEvents();
            this.fetchStats();
            return result;
        } catch (e) { console.error(e); }
    }

    async updateEvent(id, data) {
        try {
            const r = await fetch(`/api/events/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const u = await r.json();
            const idx = this.events.findIndex(e => e.id === id);
            if (idx !== -1) this.events[idx] = u;
            this.renderEvents();
            this.fetchStats();
            return u;
        } catch (e) { console.error(e); }
    }

    async deleteEvent(id) {
        try {
            const evt = this.events.find(e => e.id === id);
            const r = await fetch(`/api/events/${id}`, { method: 'DELETE' });
            const data = await r.json();
            this.events = this.events.filter(e => e.id !== id);
            if (evt && evt.link_id) {
                this.events = this.events.filter(e => e.id !== evt.link_id);
            }
            this.renderEvents();
            this.fetchStats();
            return data.event;
        } catch (e) { console.error(e); }
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

    async fetchStats() {
        try {
            const r = await fetch(`/api/stats?date=${this.selectedDateStr()}`);
            const s = await r.json();
            document.getElementById('statTotal').textContent = s.total;
            document.getElementById('statCompleted').textContent = s.completed;
            document.getElementById('statHours').textContent = s.total_hours + 'h';
            document.getElementById('statRate').textContent = s.completion_rate + '%';
        } catch (e) { console.error(e); }
    }

    updateLocalStats() {
        const planEvts = this.events.filter(
            e => e.date === this.selectedDateStr() && (e.col_type || 'plan') === 'plan'
        );
        const total = planEvts.length;
        const completed = planEvts.filter(e => e.completed).length;
        let mins = 0;
        for (const e of planEvts) {
            const [sh, sm] = e.start_time.split(':').map(Number);
            const [eh, em] = e.end_time.split(':').map(Number);
            mins += (eh * 60 + em) - (sh * 60 + sm);
        }
        document.getElementById('statTotal').textContent = total;
        document.getElementById('statCompleted').textContent = completed;
        document.getElementById('statHours').textContent = (mins / 60).toFixed(1) + 'h';
        document.getElementById('statRate').textContent = total > 0 ? Math.round(completed / total * 100) + '%' : '0%';
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
        if (this.resizeCol === 'plan') this.updateLocalStats();

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
        };
        if (data.start_time >= data.end_time) { this.showToast('结束时间必须晚于开始时间'); return; }

        if (this.editingEvent) {
            if (!this._undoing) this.undoHistory.push({ type: 'edit', id: this.editingEvent.id, prevData: { ...this.editingEvent } });
            await this.updateEvent(this.editingEvent.id, data);
            this.showToast('日程已更新');
        } else {
            const colType = this.editingColType || 'plan';
            data.col_type = colType;
            const result = await this.createEvent(data);
            if (result) {
                const ids = [];
                if (result.plan) ids.push(result.plan.id);
                if (result.actual) ids.push(result.actual.id);
                if (!this._undoing) this.undoHistory.push({ type: 'create', eventIds: ids });
            }
            this.showToast('日程已创建');
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
            this.showToast(prevCompleted ? '已取消完成' : '已标记完成 ✓');
        } else if (action === 'edit') {
            this.showEditModal(event);
        } else if (action === 'delete') {
            const linkedEvt = event.link_id ? this.events.find(e => e.id === event.link_id) : null;
            if (!this._undoing) this.undoHistory.push({ type: 'delete', eventData: { ...event }, linkedData: linkedEvt ? { ...linkedEvt } : null });
            const d = await this.deleteEvent(id);
            if (d) { this.showToast('日程已删除'); }
            this.deselectEvent();
        }
    }

    showToast(message, showUndo = false) {
        const toast = document.getElementById('toast');
        if (this.toastTimer) clearTimeout(this.toastTimer);
        document.getElementById('toastMessage').textContent = message;
        document.getElementById('toastAction').style.display = showUndo ? 'inline-block' : 'none';
        toast.classList.add('active');
        this.toastTimer = setTimeout(() => { toast.classList.remove('active'); this.lastDeletedEvent = null; }, showUndo ? 6000 : 3000);
    }

    async undoDelete() {
        if (!this.lastDeletedEvent) return;
        const evt = this.lastDeletedEvent;
        this.lastDeletedEvent = null;
        document.getElementById('toast').classList.remove('active');
        await this.createEvent({
            title: evt.title, description: evt.description, date: evt.date,
            start_time: evt.start_time, end_time: evt.end_time, color: evt.color,
            category: evt.category, priority: evt.priority, completed: evt.completed,
            col_type: evt.col_type || 'plan',
        });
        this.showToast('已撤销删除');
    }

    async undo() {
        if (this.undoHistory.length === 0) { this.showToast('没有可撤销的操作'); return; }
        const action = this.undoHistory.pop();
        this._undoing = true;
        try {
            if (action.type === 'create') {
                for (const id of action.eventIds) {
                    await fetch(`/api/events/${id}`, { method: 'DELETE' });
                    this.events = this.events.filter(e => e.id !== id);
                }
                this.renderEvents();
                this.fetchStats();
                this.showToast('已撤销创建');
            } else if (action.type === 'edit') {
                await this.updateEvent(action.id, action.prevData);
                this.showToast('已撤销编辑');
            } else if (action.type === 'delete') {
                const ev = action.eventData;
                if (ev.col_type === 'plan' || !ev.col_type) {
                    await this.createEvent({
                        title: ev.title, description: ev.description, date: ev.date,
                        start_time: ev.start_time, end_time: ev.end_time, color: ev.color,
                        category: ev.category, priority: ev.priority, completed: ev.completed,
                        col_type: 'plan',
                    });
                } else {
                    await this.createEvent({
                        title: ev.title, description: ev.description, date: ev.date,
                        start_time: ev.start_time, end_time: ev.end_time, color: ev.color,
                        category: ev.category, priority: ev.priority, completed: ev.completed,
                        col_type: 'actual',
                    });
                }
                this.showToast('已撤销删除');
            } else if (action.type === 'complete') {
                const evt = this.events.find(e => e.id === action.id);
                if (evt) {
                    await this.updateEvent(action.id, { ...evt, completed: action.prevCompleted });
                    this.showToast('已撤销完成状态变更');
                }
            } else if (action.type === 'resize') {
                await this.batchUpdateEvents(action.items);
                this.showToast('已撤销调整');
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
            const linkedEvt = ev.link_id ? this.events.find(e => e.id === ev.link_id) : null;
            if (!this._undoing) this.undoHistory.push({ type: 'delete', eventData: { ...ev }, linkedData: linkedEvt ? { ...linkedEvt } : null });
            await this.deleteEvent(ev.id);
            this.closeModal();
            this.showToast('日程已删除');
        });
        document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) this.closeModal(); });
        document.getElementById('popoverComplete').addEventListener('click', () => this.handlePopoverAction('complete'));
        document.getElementById('popoverEdit').addEventListener('click', () => this.handlePopoverAction('edit'));
        document.getElementById('popoverDelete').addEventListener('click', () => this.handlePopoverAction('delete'));
        document.getElementById('toastAction').addEventListener('click', () => this.undoDelete());
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
                tokenizer: { code() { } },
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

    debounceSaveNote() {
        if (this.noteSaveTimer) clearTimeout(this.noteSaveTimer);
        const dateToSave = this.selectedDateStr();
        const contentToSave = this.noteContent;
        this._pendingNoteSave = { date: dateToSave, content: contentToSave };
        this.noteSaveTimer = setTimeout(async () => {
            this.noteSaveTimer = null;
            this._pendingNoteSave = null;
            try {
                await fetch('/api/notes', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date: dateToSave, content: contentToSave }),
                });
            } catch (e) { console.error(e); }
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
            preview.innerHTML = html;
        } else {
            preview.textContent = this.noteContent;
        }
    }

    hexToRgba(hex, a) { return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`; }
    getContrastColor(hex) { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#2d3436' : '#ffffff'; }
}

/* ================================================================
   TIMER MANAGER
   ================================================================ */
class TimerManager {
    constructor() {
        this.state = 'idle';
        this.totalSeconds = 25 * 60;
        this.remainingSeconds = 25 * 60;
        this.plannedMinutes = 25;
        this.elapsedSeconds = 0;
        this.intervalId = null;
        this.originalTitle = document.title;
        this.selectedDate = new Date();
        this.calendarMonth = new Date();
        this.init();
    }

    init() {
        this.bindEvents();
        this.renderCalendar();
        this.updateDisplay();
        this.fetchRecords();
        this.fetchStats();
    }

    selectedDateStr() { return fmtDateISO(this.selectedDate); }

    /* ---- Calendar ---- */
    renderCalendar() {
        const year = this.calendarMonth.getFullYear(), month = this.calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const dow = firstDay.getDay();
        const startDate = new Date(firstDay);
        startDate.setDate(firstDay.getDate() - (dow === 0 ? 6 : dow - 1));

        const sel = this.selectedDateStr();
        const todayStr = fmtDateISO(new Date());

        let html = `<div class="cal-nav"><button class="tcal-prev">‹</button><span>${year}年${month + 1}月</span><button class="tcal-next">›</button></div>`;
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

        const container = document.getElementById('timerCal');
        container.innerHTML = html;

        container.querySelector('.tcal-prev').addEventListener('click', () => {
            this.calendarMonth.setMonth(this.calendarMonth.getMonth() - 1);
            this.renderCalendar();
        });
        container.querySelector('.tcal-next').addEventListener('click', () => {
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
        document.getElementById('timerDateLabel').textContent =
            `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${DAY_NAMES[d.getDay()]}`;
    }

    onDateChange() {
        this.renderCalendar();
        this.fetchRecords();
        this.fetchStats();
    }

    bindEvents() {
        document.getElementById('timerMinus5').addEventListener('click', () => this.adjustTime(-5));
        document.getElementById('timerPlus5').addEventListener('click', () => this.adjustTime(5));
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.state !== 'idle') return;
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setMinutes(parseInt(btn.dataset.min));
            });
        });
        document.getElementById('timerStartBtn').addEventListener('click', () => this.start());
        document.getElementById('timerPauseBtn').addEventListener('click', () => this.togglePause());
        document.getElementById('timerAdd5').addEventListener('click', () => this.addTime(5));
        document.getElementById('timerAdd30').addEventListener('click', () => this.addTime(30));
        document.getElementById('timerStopBtn').addEventListener('click', () => this.stop());
    }

    setMinutes(min) { this.plannedMinutes = min; this.totalSeconds = min * 60; this.remainingSeconds = this.totalSeconds; this.updateDisplay(); }

    adjustTime(delta) {
        if (this.state !== 'idle') return;
        const n = this.plannedMinutes + delta;
        if (n < 5 || n > 180) return;
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.min) === n));
        this.setMinutes(n);
    }

    addTime(minutes) {
        if (this.state === 'idle') return;
        this.totalSeconds += minutes * 60;
        this.remainingSeconds += minutes * 60;
        this.plannedMinutes += minutes;
        this.updateDisplay();
        this.showToast(`已增加 ${minutes} 分钟`);
    }

    start() {
        const name = document.getElementById('timerTaskName').value.trim();
        if (!name) {
            const el = document.getElementById('timerTaskName');
            el.focus();
            el.style.borderColor = 'var(--danger)';
            setTimeout(() => el.style.borderColor = '', 2000);
            return;
        }
        this.state = 'running';
        this.elapsedSeconds = 0;
        this.remainingSeconds = this.totalSeconds;
        this.requestNotificationPermission();
        this.updateControlsVisibility();
        this.intervalId = setInterval(() => this.tick(), 1000);
        this.updateBadge(true);
    }

    togglePause() {
        if (this.state === 'running') {
            this.state = 'paused';
            clearInterval(this.intervalId);
            this.intervalId = null;
            document.getElementById('timerPauseBtn').textContent = '▶ 继续';
            document.getElementById('timerDisplay').classList.add('paused');
            document.getElementById('timerStateLabel').textContent = '已暂停';
        } else if (this.state === 'paused') {
            this.state = 'running';
            this.intervalId = setInterval(() => this.tick(), 1000);
            document.getElementById('timerPauseBtn').textContent = '⏸ 暂停';
            document.getElementById('timerDisplay').classList.remove('paused');
            document.getElementById('timerStateLabel').textContent = '专注中...';
        }
    }

    async stop() {
        const wasRunning = this.state === 'running' || this.state === 'paused';
        clearInterval(this.intervalId);
        this.intervalId = null;
        if (wasRunning && this.elapsedSeconds >= 10) await this.saveRecord(false);
        this.state = 'idle';
        this.remainingSeconds = this.totalSeconds;
        this.elapsedSeconds = 0;
        this.updateControlsVisibility();
        this.updateDisplay();
        this.updateBadge(false);
        document.title = this.originalTitle;
        document.getElementById('timerDisplay').classList.remove('paused');
    }

    async tick() {
        this.remainingSeconds--;
        this.elapsedSeconds++;
        this.updateDisplay();
        if (this.remainingSeconds <= 0) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            await this.complete();
        }
    }

    async complete() {
        this.playSound();
        this.showNotification();
        await this.saveRecord(true);
        this.showToast('专注完成！🎉');
        document.getElementById('timerStateLabel').textContent = '完成！';
        document.querySelector('.timer-ring-wrap').classList.add('completed');
        setTimeout(() => {
            document.querySelector('.timer-ring-wrap').classList.remove('completed');
            this.state = 'idle';
            this.remainingSeconds = this.totalSeconds;
            this.elapsedSeconds = 0;
            this.updateControlsVisibility();
            this.updateDisplay();
            this.updateBadge(false);
            document.title = this.originalTitle;
            document.getElementById('timerDisplay').classList.remove('paused');
        }, 3000);
    }

    updateDisplay() {
        const mins = Math.floor(Math.abs(this.remainingSeconds) / 60);
        const secs = Math.abs(this.remainingSeconds) % 60;
        const ts = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        document.getElementById('timerDisplay').textContent = ts;
        const progress = this.totalSeconds > 0 ? this.remainingSeconds / this.totalSeconds : 1;
        const ring = document.querySelector('.timer-ring-progress');
        if (ring) ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
        if (this.state === 'running') {
            document.getElementById('timerStateLabel').textContent = '专注中...';
            document.title = `${ts} - ${document.getElementById('timerTaskName').value || '计时中'} | 日程规划器`;
        } else if (this.state === 'idle') {
            document.getElementById('timerStateLabel').textContent = '准备开始';
        }
    }

    updateControlsVisibility() {
        const idle = this.state === 'idle';
        document.querySelectorAll('.timer-adjuster, .timer-presets, .timer-start-btn').forEach(el => el.style.display = idle ? '' : 'none');
        document.getElementById('timerControls').style.display = idle ? 'none' : 'flex';
        const input = document.getElementById('timerTaskName');
        if (idle) { input.classList.remove('running'); input.removeAttribute('readonly'); }
        else { input.classList.add('running'); input.setAttribute('readonly', true); }
        document.getElementById('timerPauseBtn').textContent = '⏸ 暂停';
    }

    updateBadge(active) { document.getElementById('timerBadge').classList.toggle('active', active); }

    playSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = f;
                g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.25);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 1.2);
                o.start(ctx.currentTime + i * 0.25); o.stop(ctx.currentTime + i * 0.25 + 1.2);
            });
        } catch (e) { /* no audio */ }
    }

    requestNotificationPermission() { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
    showNotification() { if ('Notification' in window && Notification.permission === 'granted') new Notification('专注完成！', { body: `"${document.getElementById('timerTaskName').value}" - ${this.plannedMinutes}分钟` }); }
    todayStr() { return fmtDateISO(new Date()); }

    async saveRecord(completed) {
        try {
            await fetch('/api/timer/records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task_name: document.getElementById('timerTaskName').value.trim(),
                    planned_minutes: this.plannedMinutes,
                    actual_seconds: this.elapsedSeconds,
                    date: this.todayStr(),
                    completed: completed ? 1 : 0,
                }),
            });
            if (this.selectedDateStr() === this.todayStr()) {
                this.fetchRecords();
                this.fetchStats();
            }
        } catch (e) { console.error(e); }
    }

    async fetchRecords() {
        try {
            const r = await fetch(`/api/timer/records?date=${this.selectedDateStr()}`);
            this.renderRecords(await r.json());
        } catch (e) { console.error(e); }
    }

    async fetchStats() {
        try {
            const r = await fetch(`/api/timer/stats?date=${this.selectedDateStr()}`);
            const s = await r.json();
            const m = Math.round(s.total_seconds / 60);
            document.getElementById('tsFocusTime').textContent = m >= 60 ? `${Math.floor(m / 60)}h${m % 60 > 0 ? m % 60 + 'm' : ''}` : `${m}分钟`;
            document.getElementById('tsTaskCount').textContent = s.total;
            document.getElementById('tsCompleted').textContent = s.completed;
        } catch (e) { console.error(e); }
    }

    async deleteRecord(id) {
        try {
            await fetch(`/api/timer/records/${id}`, { method: 'DELETE' });
            this.fetchRecords();
            this.fetchStats();
        } catch (e) { console.error(e); }
    }

    renderRecords(records) {
        const list = document.getElementById('timerRecordsList');
        if (!records.length) { list.innerHTML = '<div class="timer-records-empty">暂无记录</div>'; return; }
        list.innerHTML = records.map(r => {
            const m = Math.round(r.actual_seconds / 60);
            const time = r.created_at ? r.created_at.split(' ')[1]?.substring(0, 5) : '';
            return `<div class="timer-record"><div class="tr-status ${r.completed ? 'done' : 'stopped'}">${r.completed ? '✓' : '✗'}</div><div class="tr-info"><div class="tr-name">${escHtml(r.task_name)}</div><div class="tr-meta">${time ? time + ' · ' : ''}${m}分钟 / 计划${r.planned_minutes}分钟${r.completed ? '' : ' · 中途停止'}</div></div><button class="tr-delete" data-id="${r.id}" title="删除">×</button></div>`;
        }).join('');
        list.querySelectorAll('.tr-delete').forEach(btn => btn.addEventListener('click', () => this.deleteRecord(parseInt(btn.dataset.id))));
    }

    showToast(msg) {
        const toast = document.getElementById('toast');
        document.getElementById('toastMessage').textContent = msg;
        document.getElementById('toastAction').style.display = 'none';
        toast.classList.add('active');
        setTimeout(() => toast.classList.remove('active'), 3000);
    }
}

/* ================================================================
   STATISTICS MANAGER
   ================================================================ */
class StatisticsManager {
    constructor() {
        this.period = 'day';
        this.selectedDate = new Date();
        this.calendarMonth = new Date();
        this.charts = {};
        this.loaded = false;
        this.init();
    }

    init() { this.bindEvents(); this.renderCalendar(); this.updateRangeLabel(); }
    onTabActive() { this.loadData(); this.loaded = true; }

    getDateRange() {
        const d = new Date(this.selectedDate);
        if (this.period === 'day') { const s = fmtDateISO(d); return { start: s, end: s }; }
        if (this.period === 'week') {
            const day = d.getDay();
            const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
            const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
            return { start: fmtDateISO(mon), end: fmtDateISO(sun) };
        }
        if (this.period === 'month') {
            const first = new Date(d.getFullYear(), d.getMonth(), 1);
            const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            return { start: fmtDateISO(first), end: fmtDateISO(last) };
        }
        return { start: '2020-01-01', end: fmtDateISO(new Date()) };
    }

    fmtDateCN(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${DAY_NAMES[d.getDay()]}`;
    }

    updateRangeLabel() {
        const { start, end } = this.getDateRange();
        const el = document.getElementById('selectedRange');
        if (this.period === 'day') el.textContent = this.fmtDateCN(start);
        else if (this.period === 'all') el.textContent = '全部历史数据';
        else el.textContent = `${start} ~ ${end}`;
    }

    renderCalendar() {
        const year = this.calendarMonth.getFullYear(), month = this.calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const dow = firstDay.getDay();
        const startDate = new Date(firstDay);
        startDate.setDate(firstDay.getDate() - (dow === 0 ? 6 : dow - 1));
        const { start: rangeStart, end: rangeEnd } = this.getDateRange();

        let html = `<div class="cal-nav"><button id="calPrev">‹</button><span>${year}年${month + 1}月</span><button id="calNext">›</button></div>`;
        html += '<div class="cal-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>';
        html += '<div class="cal-grid">';
        for (let i = 0; i < 42; i++) {
            const day = new Date(startDate); day.setDate(startDate.getDate() + i);
            const ds = fmtDateISO(day);
            const isMonth = day.getMonth() === month;
            const isToday = ds === fmtDateISO(new Date());
            const inRange = ds >= rangeStart && ds <= rangeEnd;
            const isStart = ds === rangeStart, isEnd = ds === rangeEnd;
            let cls = 'cal-day';
            if (!isMonth) cls += ' other-month';
            if (isToday) cls += ' today';
            if (inRange && this.period !== 'all') {
                if (isStart && isEnd) cls += ' range-single';
                else if (isStart) cls += ' range-start';
                else if (isEnd) cls += ' range-end';
                else cls += ' in-range';
            }
            html += `<div class="${cls}" data-date="${ds}">${day.getDate()}</div>`;
        }
        html += '</div>';
        html += '<button class="today-btn">回到今天</button>';
        document.getElementById('miniCalendar').innerHTML = html;

        document.getElementById('calPrev').addEventListener('click', () => { this.calendarMonth.setMonth(this.calendarMonth.getMonth() - 1); this.renderCalendar(); });
        document.getElementById('calNext').addEventListener('click', () => { this.calendarMonth.setMonth(this.calendarMonth.getMonth() + 1); this.renderCalendar(); });
        document.querySelector('#miniCalendar .today-btn').addEventListener('click', () => {
            this.selectedDate = new Date();
            this.calendarMonth = new Date();
            this.renderCalendar(); this.updateRangeLabel(); this.loadData();
        });
        document.querySelectorAll('#miniCalendar .cal-day').forEach(el => {
            el.addEventListener('click', () => {
                const parts = el.dataset.date.split('-');
                this.selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                this.renderCalendar(); this.updateRangeLabel(); this.loadData();
            });
        });
    }

    bindEvents() {
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.period = btn.dataset.period;
                this.renderCalendar(); this.updateRangeLabel(); this.loadData();
            });
        });
    }

    async loadData() {
        const { start, end } = this.getDateRange();
        try {
            const r = await fetch(`/api/analytics?start=${start}&end=${end}`);
            const data = await r.json();
            this.renderSummary(data);
            this.renderCharts(data);
        } catch (e) { console.error(e); }
    }

    renderSummary(data) {
        const events = data.events.filter(e => (e.col_type || 'plan') === 'actual');
        const timer = data.timer_records;
        document.getElementById('scEvents').textContent = events.length;
        let totalMin = 0;
        for (const e of events) {
            const [sh, sm] = e.start_time.split(':').map(Number);
            const [eh, em] = e.end_time.split(':').map(Number);
            totalMin += (eh * 60 + em) - (sh * 60 + sm);
        }
        const ph = totalMin / 60;
        document.getElementById('scPlannedHours').textContent = ph >= 1 ? ph.toFixed(1) + 'h' : totalMin + 'm';
        const focusSec = timer.reduce((s, r) => s + r.actual_seconds, 0);
        const fm = Math.round(focusSec / 60);
        document.getElementById('scFocusTime').textContent = fm >= 60 ? (fm / 60).toFixed(1) + 'h' : fm + 'm';
        const completedTimer = timer.filter(r => r.completed).length;
        document.getElementById('scTimerRate').textContent = timer.length > 0 ? Math.round(completedTimer / timer.length * 100) + '%' : '0%';
    }

    renderCharts(data) {
        if (typeof Chart === 'undefined') return;
        Object.values(this.charts).forEach(c => c.destroy());
        this.charts = {};
        const events = data.events.filter(e => (e.col_type || 'plan') === 'actual');
        const timer = data.timer_records;
        const { start, end } = this.getDateRange();
        const labels = this.period === 'all' ? this.getMonthLabels(events, timer) : this.getDayLabels(start, end);
        const groupFn = this.period === 'all' ? (d) => d.substring(0, 7) : (d) => d;
        this.charts.schedule = this.chartScheduleTrend(labels, events, groupFn);
        this.charts.category = this.chartCategory(events);
        this.charts.focus = this.chartFocusTrend(labels, timer, groupFn);
        this.charts.priority = this.chartPriority(events);
    }

    getDayLabels(start, end) {
        const labels = [];
        const d = new Date(start + 'T00:00:00');
        const endD = new Date(end + 'T00:00:00');
        while (d <= endD) { labels.push(fmtDateISO(d)); d.setDate(d.getDate() + 1); }
        return labels;
    }

    getMonthLabels(events, timer) {
        const months = new Set();
        events.forEach(e => months.add(e.date.substring(0, 7)));
        timer.forEach(r => months.add(r.date.substring(0, 7)));
        if (months.size === 0) months.add(fmtDateISO(new Date()).substring(0, 7));
        return [...months].sort();
    }

    fmtLabel(key) { return key.length === 7 ? key.substring(5) + '月' : key.substring(5); }

    chartScheduleTrend(labels, events, groupFn) {
        const hours = {};
        labels.forEach(l => hours[l] = 0);
        events.forEach(e => {
            const k = groupFn(e.date);
            if (k in hours) {
                const [sh, sm] = e.start_time.split(':').map(Number);
                const [eh, em] = e.end_time.split(':').map(Number);
                hours[k] += ((eh * 60 + em) - (sh * 60 + sm)) / 60;
            }
        });
        return new Chart(document.getElementById('chartSchedule'), {
            type: 'bar', data: {
                labels: labels.map(l => this.fmtLabel(l)),
                datasets: [
                    { label: '执行时长(h)', data: labels.map(l => Math.round(hours[l] * 10) / 10), backgroundColor: '#6c5ce7', borderRadius: 4 },
                ]
            }, options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { font: { size: 10 } } } }
            }
        });
    }

    chartCategory(events) {
        const cats = {};
        events.forEach(e => {
            const [sh, sm] = e.start_time.split(':').map(Number);
            const [eh, em] = e.end_time.split(':').map(Number);
            cats[e.category] = (cats[e.category] || 0) + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
        });
        const keys = Object.keys(cats);
        const ctx = document.getElementById('chartCategory');
        if (keys.length === 0) {
            return new Chart(ctx, { type: 'doughnut', data: { labels: ['暂无数据'], datasets: [{ data: [1], backgroundColor: ['#dfe6e9'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } } });
        }
        return new Chart(ctx, {
            type: 'doughnut', data: {
                labels: keys.map(k => `${CATEGORY_ICONS[k] || ''} ${k}`),
                datasets: [{ data: keys.map(k => Math.round(cats[k] * 10) / 10), backgroundColor: keys.map(k => CATEGORY_COLORS[k] || '#b2bec3') }]
            }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
        });
    }

    chartFocusTrend(labels, timer, groupFn) {
        const mins = {};
        labels.forEach(l => mins[l] = 0);
        timer.forEach(r => { const k = groupFn(r.date); if (k in mins) mins[k] += Math.round(r.actual_seconds / 60); });
        return new Chart(document.getElementById('chartFocus'), {
            type: 'bar', data: {
                labels: labels.map(l => this.fmtLabel(l)),
                datasets: [{ label: '专注(分钟)', data: labels.map(l => mins[l]), backgroundColor: '#6c5ce7', borderRadius: 4 }]
            }, options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { font: { size: 10 } } } }
            }
        });
    }

    chartPriority(events) {
        const counts = { 1: 0, 2: 0, 3: 0 };
        events.forEach(e => counts[e.priority] = (counts[e.priority] || 0) + 1);
        const ctx = document.getElementById('chartPriority');
        const total = counts[1] + counts[2] + counts[3];
        if (total === 0) {
            return new Chart(ctx, { type: 'doughnut', data: { labels: ['暂无数据'], datasets: [{ data: [1], backgroundColor: ['#dfe6e9'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } } });
        }
        return new Chart(ctx, {
            type: 'doughnut', data: {
                labels: ['🔴 高', '🟡 中', '🟢 低'],
                datasets: [{ data: [counts[1], counts[2], counts[3]], backgroundColor: ['#e74c3c', '#fdcb6e', '#00b894'] }]
            }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
        });
    }
}

/* ================================================================
   INIT
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    window.planner = new PlannerApp();
    window.timer = new TimerManager();
    window.stats = new StatisticsManager();
});
