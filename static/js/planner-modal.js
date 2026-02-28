import { COLORS, TOTAL_SLOTS } from './constants.js';
import { escHtml, showToast } from './helpers.js';

/* ================================================================
   MODAL + POPOVER + TOOLTIP + PLAN-PICK MODE MIXIN
   ================================================================ */
export const ModalMixin = {

    /* ---- Time selects + color picker ---- */

    populateTimeSelects() {
        const ss = document.getElementById('eventStart'), es = document.getElementById('eventEnd');
        ss.innerHTML = '';
        es.innerHTML = '';
        for (let i = 0; i < TOTAL_SLOTS; i++) ss.innerHTML += `<option value="${this.slotToTime(i)}">${this.slotToTime(i)}</option>`;
        for (let i = 1; i < TOTAL_SLOTS; i++) es.innerHTML += `<option value="${this.slotToTime(i)}">${this.slotToTime(i)}</option>`;
    },

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
    },

    getNextColor(date) {
        const used = this.events.filter(e => e.date === date).map(e => e.color);
        for (const c of COLORS) { if (!used.includes(c)) return c; }
        return COLORS[used.length % COLORS.length];
    },

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
    },

    /* ---- Create / Edit modal ---- */

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
        document.getElementById('eventDescription').value = presetEvt ? (presetEvt.description || '') : '';
        document.getElementById('deleteBtn').style.display = 'none';
        document.getElementById('completeBtn').style.display = 'none';
        document.getElementById('copyFromPlanBtn').style.display =
            (this.editingColType || 'plan') === 'plan' ? 'inline-flex' : 'none';
        document.getElementById('saveBtn').textContent = (window.I18n && window.I18n.t) ? window.I18n.t('modal.save') : 'Save';
        this.buildColorPicker();
        this.openModal();
        setTimeout(() => document.getElementById('eventTitle').focus(), 100);
    },

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
        document.getElementById('copyFromPlanBtn').style.display = 'none';
        document.getElementById('saveBtn').textContent = (window.I18n && window.I18n.t) ? window.I18n.t('modal.update') : 'Update';
        this.buildColorPicker();
        this.openModal();
    },

    openModal() {
        this._hideTooltip();
        document.getElementById('modalOverlay').classList.add('active');
    },

    closeModal() {
        document.getElementById('modalOverlay').classList.remove('active');
        this.editingEvent = null;
        this.editingColType = null;
    },

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
                showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.eventCreated') : 'Event created');
            }
        }
        this.closeModal();
    },

    /* ---- Event selection ---- */

    selectEvent(id) {
        this.deselectEvent();
        this.selectedEventId = id;
        const el = document.querySelector(`.event[data-event-id="${id}"]`);
        if (el) el.classList.add('selected');
    },

    deselectEvent() {
        this.selectedEventId = null;
        document.querySelectorAll('.event.selected').forEach(el => el.classList.remove('selected'));
    },

    /* ---- Action popover ---- */

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
    },

    hidePopover() {
        document.getElementById('actionPopover').classList.remove('active');
        this.popoverEventId = null;
    },

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
    },

    /* ---- Hover tooltip ---- */

    _initTooltip() {
        const tip = document.createElement('div');
        tip.id = 'eventTooltip';
        document.body.appendChild(tip);
        this._tooltip = tip;
        document.getElementById('scheduleGrid')?.addEventListener('scroll', () => this._hideTooltip(), { passive: true });
    },

    _showTooltip(evt, x, y) {
        const tip = this._tooltip;
        if (!tip) return;
        tip.innerHTML = '';

        const titleEl = document.createElement('div');
        titleEl.className = 'event-tooltip-title';
        titleEl.textContent = evt.title;
        tip.appendChild(titleEl);

        const desc = evt.description ? evt.description.trim() : '';
        if (desc) {
            const sep = document.createElement('div');
            sep.className = 'event-tooltip-sep';
            tip.appendChild(sep);
            const descEl = document.createElement('div');
            descEl.className = 'event-tooltip-desc';
            descEl.textContent = desc;
            tip.appendChild(descEl);
        }

        tip.style.borderLeftColor = evt.color || 'var(--accent)';
        tip.classList.add('active');
        this._positionTooltip(x, y);
    },

    _positionTooltip(x, y) {
        const tip = this._tooltip;
        if (!tip) return;
        const offset = 16;
        let left = x + offset;
        let top = y + offset;
        const rect = tip.getBoundingClientRect();
        if (left + rect.width > window.innerWidth - 8) left = x - rect.width - offset;
        if (top + rect.height > window.innerHeight - 8) top = y - rect.height - offset;
        tip.style.left = Math.max(4, left) + 'px';
        tip.style.top = Math.max(4, top) + 'px';
    },

    _hideTooltip() {
        this._tooltip?.classList.remove('active');
    },

    /* ---- Plan pick mode ---- */

    enterPlanPickMode() {
        return new Promise(resolve => {
            this._planPickMode = true;
            this._planPickResolve = resolve;

            const _hintText = (window.I18n && window.I18n.t)
                ? window.I18n.t('schedule.planPick.hint')
                : 'Click a plan event to copy its details, or press Esc to skip';

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
    },

    startPlanCopyMode() {
        // Save current modal state before closing
        this._planCopySavedState = {
            title: document.getElementById('eventTitle').value,
            date: document.getElementById('eventDate').value,
            start: document.getElementById('eventStart').value,
            end: document.getElementById('eventEnd').value,
            category: document.getElementById('eventCategory').value,
            priority: document.getElementById('eventPriority').value,
            color: this.selectedColor,
            description: document.getElementById('eventDescription').value,
        };
        this._planCopyMode = true;
        this.closeModal();

        const _hintText = (window.I18n && window.I18n.t)
            ? window.I18n.t('schedule.planCopy.hint')
            : 'Click a plan event to copy. Navigate the calendar to switch dates. Press Esc to return.';

        this._planPickMode = true;
        this._planPickResolve = null;

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

        document.body.classList.add('plan-pick-mode', 'plan-copy-mode');
    },

    exitPlanPickMode(selectedEvt) {
        this._planPickMode = false;
        document.getElementById('planPickOverlay')?.remove();
        document.getElementById('planPickHint')?.remove();
        document.body.classList.remove('plan-pick-mode', 'plan-copy-mode');

        if (this._planCopyMode) {
            this._planCopyMode = false;
            const saved = this._planCopySavedState;
            this._planCopySavedState = null;

            // Navigate back to the original event's date before reopening the modal
            const [yr, mo, dy] = saved.date.split('-').map(Number);
            this.selectedDate = new Date(yr, mo - 1, dy);
            this.calendarMonth = new Date(yr, mo - 1, dy);
            this.renderCalendar();
            this.renderGrid();
            this.fetchEvents();

            // Reopen modal: copy selectedEvt's metadata if chosen, always keep original date/time
            this.editingEvent = null;
            this.selectedColor = selectedEvt ? selectedEvt.color : saved.color;
            document.getElementById('modalTitle').textContent =
                (window.I18n && window.I18n.t) ? window.I18n.t('modal.newEvent') : 'New Event';
            document.getElementById('eventTitle').value = selectedEvt ? selectedEvt.title : saved.title;
            document.getElementById('eventDate').value = saved.date;
            document.getElementById('eventStart').value = saved.start;
            document.getElementById('eventEnd').value = saved.end;
            this._populateModalSelects();
            document.getElementById('eventCategory').value = selectedEvt ? selectedEvt.category : saved.category;
            document.getElementById('eventPriority').value = selectedEvt ? String(selectedEvt.priority) : saved.priority;
            document.getElementById('eventDescription').value = selectedEvt ? (selectedEvt.description || '') : saved.description;
            document.getElementById('deleteBtn').style.display = 'none';
            document.getElementById('completeBtn').style.display = 'none';
            document.getElementById('copyFromPlanBtn').style.display = 'inline-flex';
            document.getElementById('saveBtn').textContent =
                (window.I18n && window.I18n.t) ? window.I18n.t('modal.save') : 'Save';
            this.buildColorPicker();
            this.openModal();
            setTimeout(() => document.getElementById('eventTitle').focus(), 100);
            return;
        }

        if (this._planPickResolve) {
            const resolve = this._planPickResolve;
            this._planPickResolve = null;
            resolve(selectedEvt);
        }
    },
};
