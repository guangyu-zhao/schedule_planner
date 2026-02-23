import { CATEGORY_ICONS, SLOT_HEIGHT, TOTAL_SLOTS, getCategoryLabel } from './constants.js';
import { fmtDateISO, escHtml } from './helpers.js';

/* ================================================================
   GRID RENDERING + TIME INDICATOR + REMINDERS MIXIN
   ================================================================ */
export const GridMixin = {

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
    },

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

            const recurIcon = evt.recur_rule ? ' 🔁' : (evt.recur_parent_id ? ' 🔁' : '');
            const catPart = `${CATEGORY_ICONS[evt.category] || ''}${escHtml(getCategoryLabel(evt.category))}`;
            el.innerHTML =
                `<div class="resize-handle resize-handle-top"></div>` +
                `<div class="event-content">${escHtml(evt.start_time)}–${escHtml(evt.end_time)} · ${catPart} · ${escHtml(evt.title)}${recurIcon}</div>` +
                `<div class="resize-handle resize-handle-bottom"></div>`;

            el.addEventListener('mouseenter', e => {
                if (!this.isResizing) this._showTooltip(evt, e.clientX, e.clientY);
            });
            el.addEventListener('mousemove', e => {
                if (this._tooltip?.classList.contains('active')) this._positionTooltip(e.clientX, e.clientY);
            });
            el.addEventListener('mouseleave', () => this._hideTooltip());

            el.addEventListener('click', e => {
                if (this.isResizing) return;
                e.stopPropagation();
                if (this._planPickMode) {
                    if (colType === 'plan') this.exitPlanPickMode(evt);
                    return;
                }
                if (this.selectedEventId === evt.id) {
                    this.hidePopover();
                    this.showEditModal(evt);
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
    },

    scrollToCurrentTime() {
        const grid = document.getElementById('scheduleGrid');
        if (!grid) return;
        const now = new Date();
        grid.scrollTop = Math.max(0, ((now.getHours() * 60 + now.getMinutes()) / 30 - 4) * SLOT_HEIGHT);
    },

    startTimeIndicator() {
        this.updateTimeIndicator();
        if (this._timeIndicatorInterval) clearInterval(this._timeIndicatorInterval);
        this._timeIndicatorInterval = setInterval(() => this.updateTimeIndicator(), 60000);
        this.requestNotificationPermission();
    },

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    },

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
    },

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
    },

    hexToRgba(hex, a) {
        return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
    },

    getContrastColor(hex) {
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#2d3436' : '#ffffff';
    },
};
