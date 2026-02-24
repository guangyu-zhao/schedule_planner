import { COLORS, TOTAL_SLOTS } from './constants.js';
import { fmtDateISO, showToast } from './helpers.js';
import { CalendarMixin } from './planner-calendar.js';
import { GridMixin } from './planner-grid.js';
import { EventsApiMixin } from './planner-events-api.js';
import { DragMixin } from './planner-drag.js';
import { ModalMixin } from './planner-modal.js';
import { NotesMixin } from './planner-notes.js';
import { SearchMixin } from './planner-search.js';

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
        this.notesList = [];
        this.currentNoteId = null;
        this.noteSaveTimer = null;
        this.noteMode = 'edit';

        this.reminderTimers = [];
        this.notifiedEventIds = new Set();
        this._searchTimer = null;
        this._pendingHighlightId = null;
        this._pendingHighlightNoteId = null;
        this._markerCacheMonth = null;
        this._markerCacheEvents = new Set();
        this._markerCacheNotes = new Set();
        this._searchCase = false;
        this._searchWord = false;
        this._searchRegex = false;

        this._planPickMode = false;
        this._planPickResolve = null;
        this._planCopyMode = false;
        this._planCopySavedState = null;

        this._tooltip = null;

        this.init();
    }

    init() {
        this.populateTimeSelects();
        this.buildColorPicker();
        this.bindEvents();
        this.initSearch();
        this.bindDocumentDragEvents();
        this.initNotes();
        this.renderCalendar();
        this.renderGrid();
        this.fetchEvents();
        this.fetchNotes();
        this.scrollToCurrentTime();
        this.startTimeIndicator();
        this._initTooltip();
    }

    /* ---- Slot / date helpers ---- */
    selectedDateStr() { return fmtDateISO(this.selectedDate); }
    isToday(d) { return fmtDateISO(d) === fmtDateISO(new Date()); }
    slotToTime(i) { return `${String(Math.floor(i / 2)).padStart(2, '0')}:${String((i % 2) * 30).padStart(2, '0')}`; }
    timeToSlot(t) { const [h, m] = t.split(':').map(Number); return h * 2 + (m >= 30 ? 1 : 0); }

    /* ================================================================
       GLOBAL EVENT BINDINGS
       (search bindings are in SearchMixin.initSearch())
       ================================================================ */
    bindEvents() {
        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('copyFromPlanBtn').addEventListener('click', () => this.startPlanCopyMode());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveEvent());
        document.getElementById('deleteBtn').addEventListener('click', async () => {
            if (!this.editingEvent) return;
            const ev = this.editingEvent;
            if (!this._undoing) this.undoHistory.push({ type: 'delete', eventData: { ...ev } });
            await this.deleteEvent(ev.id);
            this.closeModal();
            showToast((window.I18n && window.I18n.t) ? window.I18n.t('toast.eventDeleted') : 'Event deleted', { undo: true });
        });
        document.getElementById('modalOverlay').addEventListener('mousedown', e => {
            if (e.target === e.currentTarget) this.closeModal();
        });
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
                if (this._planPickMode) { this.exitPlanPickMode(null); return; }
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

            if (e.key === 'Enter' && !e.shiftKey
                && document.getElementById('modalOverlay').classList.contains('active')
                && document.activeElement.tagName !== 'TEXTAREA') {
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
}

/* Apply all mixins to PlannerApp prototype */
Object.assign(PlannerApp.prototype,
    CalendarMixin,
    GridMixin,
    EventsApiMixin,
    DragMixin,
    ModalMixin,
    NotesMixin,
    SearchMixin,
);
