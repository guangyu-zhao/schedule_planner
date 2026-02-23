import { showToast } from './helpers.js';

/* ================================================================
   EVENT CRUD API + UNDO MIXIN
   ================================================================ */
export const EventsApiMixin = {

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
            this.scheduleReminders();
        } catch (e) {
            console.error(e);
            showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.networkError') : 'Network error', { type: 'error' });
        }
    },

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
    },

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
    },

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
    },

    async moveEventToColumn(evt, targetColType, startTime, endTime) {
        const prevData = { ...evt };
        const data = {
            title: evt.title, description: evt.description, date: evt.date,
            start_time: startTime, end_time: endTime, color: evt.color,
            category: evt.category, priority: evt.priority, completed: evt.completed,
            col_type: targetColType, recur_rule: evt.recur_rule || null,
        };
        const result = await this.updateEvent(evt.id, data);
        if (!this._undoing && result) {
            this.undoHistory.push({ type: 'move', prevData, newId: evt.id });
        }
        const key = targetColType === 'actual' ? 'toast.movedToActual' : 'toast.movedToPlan';
        showToast((window.I18n && window.I18n.t) ? window.I18n.t(key) : (targetColType === 'actual' ? 'Moved to Actual column' : 'Moved to Plan column'));
    },

    async batchUpdateEvents(items) {
        try {
            await fetch('/api/events/batch', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(items),
            });
            await this.fetchEvents();
        } catch (e) { console.error(e); }
    },

    undoLastAction() {
        document.getElementById('toast').classList.remove('active');
        this.undo();
    },

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
            } else if (action.type === 'move') {
                const ev = action.prevData;
                await this.updateEvent(action.newId, {
                    title: ev.title, description: ev.description, date: ev.date,
                    start_time: ev.start_time, end_time: ev.end_time, color: ev.color,
                    category: ev.category, priority: ev.priority, completed: ev.completed,
                    col_type: ev.col_type || 'plan', recur_rule: ev.recur_rule || null,
                });
                showToast(t('toast.undoMove'));
            }
        } finally {
            this._undoing = false;
        }
    },
};
