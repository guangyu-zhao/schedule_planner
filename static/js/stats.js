import { CATEGORY_ICONS, CATEGORY_COLORS, DAY_NAMES } from './constants.js';
import { fmtDateISO } from './helpers.js';

export class StatisticsManager {
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
