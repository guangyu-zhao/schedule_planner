import { RING_CIRCUMFERENCE, DAY_NAMES } from './constants.js';
import { fmtDateISO, escHtml, showToast } from './helpers.js';

export class TimerManager {
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
        this.ambientSound = 'none';
        this.ambientCtx = null;
        this.ambientNodes = [];
        this.ambientVolume = 0.3;
        this.ambientGain = null;
        this.pomodoroCount = 0;
        this.isBreak = false;
        this.shortBreakMin = 5;
        this.longBreakMin = 15;
        this.pomodorosUntilLong = 4;
        this.autoBreak = true;
        this.init();
    }

    init() {
        this.bindEvents();
        this.bindAmbientEvents();
        this.bindBreakSettings();
        this.renderCalendar();
        this.updateDisplay();
        this.fetchRecords();
        this.fetchStats();
        this.updatePomodoroIndicator();
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
        showToast(`已增加 ${minutes} 分钟`);
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
        const wasBreak = this.isBreak;
        clearInterval(this.intervalId);
        this.intervalId = null;
        if (wasRunning && !wasBreak && this.elapsedSeconds >= 10) await this.saveRecord(false);
        this.isBreak = false;
        this.state = 'idle';
        this.totalSeconds = this.plannedMinutes * 60;
        this.remainingSeconds = this.totalSeconds;
        this.elapsedSeconds = 0;
        this.updateControlsVisibility();
        this.updateDisplay();
        this.updateBadge(false);
        document.title = this.originalTitle;
        document.getElementById('timerDisplay').classList.remove('paused');
        document.querySelector('.timer-ring-wrap').classList.remove('break-mode');
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
        if (this.isBreak) {
            this.playSound();
            showToast('休息结束，准备开始下一轮专注！');
            document.getElementById('timerStateLabel').textContent = '休息结束';
            this.isBreak = false;
            document.querySelector('.timer-ring-wrap').classList.remove('break-mode');
            setTimeout(() => {
                this.state = 'idle';
                this.remainingSeconds = this.totalSeconds;
                this.elapsedSeconds = 0;
                this.updateControlsVisibility();
                this.updateDisplay();
                this.updateBadge(false);
                document.title = this.originalTitle;
                document.getElementById('timerDisplay').classList.remove('paused');
                this.updatePomodoroIndicator();
            }, 2000);
            return;
        }

        this.playSound();
        this.showNotification();
        await this.saveRecord(true);
        this.pomodoroCount++;
        showToast(`专注完成！(第 ${this.pomodoroCount} 个番茄钟)`);
        document.getElementById('timerStateLabel').textContent = '完成！';
        document.querySelector('.timer-ring-wrap').classList.add('completed');

        const shouldAutoBreak = this.autoBreak;
        setTimeout(() => {
            document.querySelector('.timer-ring-wrap').classList.remove('completed');
            if (shouldAutoBreak) {
                this.startBreak();
            } else {
                this.state = 'idle';
                this.remainingSeconds = this.totalSeconds;
                this.elapsedSeconds = 0;
                this.updateControlsVisibility();
                this.updateDisplay();
                this.updateBadge(false);
                document.title = this.originalTitle;
                document.getElementById('timerDisplay').classList.remove('paused');
            }
            this.updatePomodoroIndicator();
        }, 3000);
    }

    startBreak() {
        const isLong = this.pomodoroCount % this.pomodorosUntilLong === 0;
        const breakMin = isLong ? this.longBreakMin : this.shortBreakMin;
        this.isBreak = true;
        this.state = 'running';
        this.totalSeconds = breakMin * 60;
        this.remainingSeconds = breakMin * 60;
        this.elapsedSeconds = 0;
        document.getElementById('timerStateLabel').textContent = isLong ? '长休息中...' : '短休息中...';
        document.querySelector('.timer-ring-wrap').classList.add('break-mode');
        this.updateControlsVisibility();
        this.updateDisplay();
        this.updateBadge(true);
        this.intervalId = setInterval(() => this.tick(), 1000);
        showToast(isLong ? `长休息 ${breakMin} 分钟` : `短休息 ${breakMin} 分钟`);
    }

    updatePomodoroIndicator() {
        const el = document.getElementById('pomodoroIndicator');
        if (!el) return;
        const inCycle = this.pomodoroCount % this.pomodorosUntilLong;
        let html = '';
        for (let i = 0; i < this.pomodorosUntilLong; i++) {
            html += `<span class="pomo-dot${i < inCycle ? ' filled' : ''}"></span>`;
        }
        html += `<span class="pomo-count">${this.pomodoroCount} 个番茄钟</span>`;
        el.innerHTML = html;
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
            if (!this.isBreak) {
                document.getElementById('timerStateLabel').textContent = '专注中...';
            }
            const label = this.isBreak ? '休息中' : (document.getElementById('timerTaskName').value || '计时中');
            document.title = `${ts} - ${label} | 日程规划器`;
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
            const r = await fetch('/api/timer/records', {
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
            if (!r.ok) { showToast('保存记录失败', { type: 'error' }); return; }
            if (this.selectedDateStr() === this.todayStr()) {
                this.fetchRecords();
                this.fetchStats();
            }
        } catch (e) { console.error(e); showToast('网络错误，记录保存失败', { type: 'error' }); }
    }

    async fetchRecords() {
        try {
            const r = await fetch(`/api/timer/records?date=${this.selectedDateStr()}`);
            if (!r.ok) { showToast('加载记录失败', { type: 'error' }); return; }
            const data = await r.json();
            this.renderRecords(Array.isArray(data) ? data : []);
        } catch (e) { console.error(e); }
    }

    async fetchStats() {
        try {
            const r = await fetch(`/api/timer/stats?date=${this.selectedDateStr()}`);
            if (!r.ok) return;
            const s = await r.json();
            const m = Math.round((s.total_seconds || 0) / 60);
            document.getElementById('tsFocusTime').textContent = m >= 60 ? `${Math.floor(m / 60)}h${m % 60 > 0 ? m % 60 + 'm' : ''}` : `${m}分钟`;
            document.getElementById('tsTaskCount').textContent = s.total || 0;
            document.getElementById('tsCompleted').textContent = s.completed || 0;
        } catch (e) { console.error(e); }
    }

    async deleteRecord(id) {
        try {
            const r = await fetch(`/api/timer/records/${id}`, { method: 'DELETE' });
            if (!r.ok) { showToast('删除记录失败', { type: 'error' }); return; }
            this.fetchRecords();
            this.fetchStats();
        } catch (e) { console.error(e); showToast('网络错误', { type: 'error' }); }
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

    /* ================================================================
       AMBIENT SOUNDS
       ================================================================ */
    bindBreakSettings() {
        const toggle = document.getElementById('autoBreakToggle');
        if (toggle) {
            const saved = localStorage.getItem('autoBreak');
            this.autoBreak = saved !== null ? saved === 'true' : true;
            toggle.checked = this.autoBreak;
            toggle.addEventListener('change', () => {
                this.autoBreak = toggle.checked;
                localStorage.setItem('autoBreak', this.autoBreak);
            });
        }
        const resetBtn = document.getElementById('resetPomodoroBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.pomodoroCount = 0;
                this.updatePomodoroIndicator();
                showToast('番茄钟计数已重置');
            });
        }
    }

    bindAmbientEvents() {
        document.querySelectorAll('.ambient-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sound = btn.dataset.sound;
                document.querySelectorAll('.ambient-btn').forEach(b => b.classList.remove('active'));
                if (sound === this.ambientSound || sound === 'none') {
                    this.stopAmbient();
                    this.ambientSound = 'none';
                    document.querySelector('.ambient-btn[data-sound="none"]').classList.add('active');
                } else {
                    btn.classList.add('active');
                    this.ambientSound = sound;
                    this.playAmbient(sound);
                }
            });
        });

        const slider = document.getElementById('ambientVolume');
        if (slider) {
            slider.addEventListener('input', () => {
                this.ambientVolume = slider.value / 100;
                if (this.ambientGain) this.ambientGain.gain.value = this.ambientVolume;
            });
        }
    }

    _getAudioCtx() {
        if (!this.ambientCtx || this.ambientCtx.state === 'closed') {
            this.ambientCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ambientCtx.state === 'suspended') this.ambientCtx.resume();
        return this.ambientCtx;
    }

    stopAmbient() {
        for (const n of this.ambientNodes) {
            try { n.stop(); } catch {}
            try { n.disconnect(); } catch {}
        }
        this.ambientNodes = [];
        if (this.ambientGain) {
            try { this.ambientGain.disconnect(); } catch {}
            this.ambientGain = null;
        }
    }

    playAmbient(type) {
        this.stopAmbient();
        const ctx = this._getAudioCtx();
        this.ambientGain = ctx.createGain();
        this.ambientGain.gain.value = this.ambientVolume;
        this.ambientGain.connect(ctx.destination);

        if (type === 'whitenoise') this._genWhiteNoise(ctx);
        else if (type === 'rain') this._genRain(ctx);
        else if (type === 'forest') this._genForest(ctx);
        else if (type === 'cafe') this._genCafe(ctx);
    }

    _genWhiteNoise(ctx) {
        const bufferSize = 2 * ctx.sampleRate;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1200;

        src.connect(lp);
        lp.connect(this.ambientGain);
        src.start();
        this.ambientNodes.push(src);
    }

    _genRain(ctx) {
        const bufferSize = 4 * ctx.sampleRate;
        const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * (0.3 + 0.7 * Math.random());
            }
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 800;
        bp.Q.value = 0.5;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3000;

        src.connect(bp);
        bp.connect(lp);
        lp.connect(this.ambientGain);
        src.start();
        this.ambientNodes.push(src);

        const drip = ctx.createBufferSource();
        const dripBuf = ctx.createBuffer(1, 2 * ctx.sampleRate, ctx.sampleRate);
        const dripData = dripBuf.getChannelData(0);
        for (let i = 0; i < dripBuf.length; i++) {
            const t = i / ctx.sampleRate;
            const burst = Math.sin(t * 120 * Math.PI * 2) * Math.exp(-t * 8) * (Math.random() > 0.97 ? 1 : 0);
            dripData[i] = burst * 0.3 + (Math.random() * 2 - 1) * 0.02;
        }
        drip.buffer = dripBuf;
        drip.loop = true;
        const dripFilter = ctx.createBiquadFilter();
        dripFilter.type = 'highpass';
        dripFilter.frequency.value = 2000;
        drip.connect(dripFilter);
        dripFilter.connect(this.ambientGain);
        drip.start();
        this.ambientNodes.push(drip);
    }

    _genForest(ctx) {
        const bufferSize = 4 * ctx.sampleRate;
        const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < bufferSize; i++) {
                const t = i / ctx.sampleRate;
                const wind = Math.sin(t * 0.3) * 0.4 + 0.6;
                data[i] = (Math.random() * 2 - 1) * 0.15 * wind;
                if (Math.random() > 0.9997) {
                    const chirpLen = Math.floor(0.1 * ctx.sampleRate);
                    const freq = 2000 + Math.random() * 3000;
                    for (let j = 0; j < chirpLen && (i + j) < bufferSize; j++) {
                        data[i + j] += Math.sin(j / ctx.sampleRate * freq * Math.PI * 2) * Math.exp(-j / chirpLen * 4) * 0.2;
                    }
                }
            }
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4000;
        src.connect(lp);
        lp.connect(this.ambientGain);
        src.start();
        this.ambientNodes.push(src);
    }

    _genCafe(ctx) {
        const bufferSize = 6 * ctx.sampleRate;
        const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.12;
                if (Math.random() > 0.9999) {
                    const clink = Math.floor(0.05 * ctx.sampleRate);
                    const freq = 4000 + Math.random() * 2000;
                    for (let j = 0; j < clink && (i + j) < bufferSize; j++) {
                        data[i + j] += Math.sin(j / ctx.sampleRate * freq * Math.PI * 2) * Math.exp(-j / clink * 6) * 0.15;
                    }
                }
            }
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 600;
        bp.Q.value = 0.3;
        src.connect(bp);
        bp.connect(this.ambientGain);
        src.start();
        this.ambientNodes.push(src);
    }
}
