import { SLOT_HEIGHT, TOTAL_SLOTS, MIN_EVENT_SLOTS } from './constants.js';

/* ================================================================
   DRAG-TO-CREATE + EDGE-DRAG RESIZE MIXIN
   ================================================================ */
export const DragMixin = {

    /* ---- Drag to create ---- */

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
    },

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
    },

    updateDragOverlay() {
        if (!this.dragOverlay) return;
        const minS = Math.min(this.dragStartSlot, this.dragEndSlot);
        const maxS = Math.max(this.dragStartSlot, this.dragEndSlot);
        this.dragOverlay.style.top = minS * SLOT_HEIGHT + 'px';
        this.dragOverlay.style.height = (maxS - minS + 1) * SLOT_HEIGHT + 'px';
    },

    /* ---- Edge-drag resize with cascading compression ---- */

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
    },

    getColumnEvents(colType) {
        return this.events
            .filter(e => e.date === this.selectedDateStr() && (e.col_type || 'plan') === colType)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
    },

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
    },

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
    },
};
