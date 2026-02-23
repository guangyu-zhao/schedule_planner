import { fmtDateISO } from './helpers.js';

/* ================================================================
   CALENDAR SIDEBAR + MARKERS MIXIN
   ================================================================ */
export const CalendarMixin = {

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
    },

    updateDateLabel() {
        const d = this.selectedDate;
        const label = (window.I18n && window.I18n.formatDate) ? window.I18n.formatDate(d) : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
        document.getElementById('scheduleDateLabel').textContent = label;
    },

    onDateChange() {
        this.renderCalendar();
        this.renderGrid();
        this.fetchEvents();
        this.fetchNotes();
        this.scrollToCurrentTime();
    },

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
    },

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
    },
};
