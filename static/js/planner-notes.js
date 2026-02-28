import { escHtml, showToast } from './helpers.js';

/* ================================================================
   NOTES PANEL MIXIN
   ================================================================ */
export const NotesMixin = {

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
                renderer: {
                    image({ href, title, text }) {
                        const src = href && href.startsWith('ni:')
                            ? '/api/notes/images/' + href.slice(3)
                            : (href || '');
                        const alt = text || '';
                        const titleAttr = title ? ` title="${title}"` : '';
                        return `<img src="${src}" alt="${alt}"${titleAttr} style="max-width:100%">`;
                    }
                },
            });

            if (typeof DOMPurify !== 'undefined') {
                DOMPurify.addHook('beforeSanitizeAttributes', node => {
                    if (node.tagName === 'IMG') {
                        const src = node.getAttribute('src');
                        if (src && src.startsWith('ni:')) {
                            node.setAttribute('src', '/api/notes/images/' + src.slice(3));
                        }
                    }
                });
            }
        }

        const editor = document.getElementById('notesEditor');
        editor.addEventListener('input', () => {
            this.noteContent = editor.value;
            this.renderNotePreview();
            this.debounceSaveNote();
        });

        editor.addEventListener('paste', e => {
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (const item of items) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) this.uploadNoteImage(file);
                    break;
                }
            }
        });

        editor.addEventListener('dragover', e => {
            const hasFile = e.dataTransfer && Array.from(e.dataTransfer.items || []).some(
                i => i.kind === 'file' && i.type.startsWith('image/')
            );
            if (hasFile) {
                e.preventDefault();
                editor.classList.add('drag-over');
            }
        });

        editor.addEventListener('dragleave', () => {
            editor.classList.remove('drag-over');
        });

        editor.addEventListener('drop', e => {
            editor.classList.remove('drag-over');
            const files = e.dataTransfer && e.dataTransfer.files;
            if (!files) return;
            const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
            if (imageFiles.length) {
                e.preventDefault();
                imageFiles.forEach(f => this.uploadNoteImage(f));
            }
        });

        document.getElementById('notesImgBtn').addEventListener('click', () => {
            document.getElementById('notesImgInput').click();
        });

        document.getElementById('notesImgInput').addEventListener('change', e => {
            const file = e.target.files && e.target.files[0];
            if (file) this.uploadNoteImage(file);
            e.target.value = '';
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
                body.classList.remove('preview-only', 'edit-only', 'list-only');
                if (mode === 'preview') body.classList.add('preview-only');
                document.getElementById('notesListBtn').classList.remove('active');
                document.getElementById('notesImgBtn').disabled = false;
                this.renderNotePreview();
            });
        });

        document.getElementById('notesNewBtn').addEventListener('click', () => this.newNote());
        document.getElementById('notesListBtn').addEventListener('click', () => this.toggleNoteList());
    },

    async fetchNotes() {
        this.flushPendingNoteSave();
        // Exit list mode when switching dates
        document.querySelector('.notes-body').classList.remove('list-only');
        document.getElementById('notesListBtn').classList.remove('active');
        document.getElementById('notesImgBtn').disabled = false;
        try {
            const r = await fetch(`/api/notes?date=${this.selectedDateStr()}`);
            const list = await r.json();
            this.notesList = Array.isArray(list) ? list : [];
            let noteToSelect = null;
            if (this._pendingHighlightNoteId !== null) {
                noteToSelect = this.notesList.find(n => n.id === this._pendingHighlightNoteId);
                this._pendingHighlightNoteId = null;
            }
            if (!noteToSelect) {
                noteToSelect = this.notesList.find(n => (n.content || '').trim()) || this.notesList[0] || null;
            }
            if (noteToSelect) {
                this._loadNote(noteToSelect);
            } else {
                this.currentNoteId = null;
                this.noteContent = '';
                document.getElementById('notesEditor').value = '';
                this.renderNotePreview();
                this._updateNoteCounter();
            }
        } catch (e) { console.error(e); }
    },

    _loadNote(note) {
        this.currentNoteId = note.id;
        this.noteContent = note.content || '';
        document.getElementById('notesEditor').value = this.noteContent;
        this.renderNotePreview();
        document.querySelector('.notes-body').classList.remove('list-only');
        document.getElementById('notesImgBtn').disabled = false;
        this._updateNoteCounter();
    },

    newNote() {
        const body = document.querySelector('.notes-body');
        const inListMode = body.classList.contains('list-only');
        if (!inListMode && !this.noteContent.trim()) return;
        if (inListMode) {
            body.classList.remove('list-only');
            document.getElementById('notesImgBtn').disabled = false;
            document.getElementById('notesListBtn').classList.remove('active');
        }
        this.flushPendingNoteSave();
        this.currentNoteId = null;
        this.noteContent = '';
        document.getElementById('notesEditor').value = '';
        this.renderNotePreview();
        document.getElementById('notesEditor').focus();
        this._updateNoteCounter();
    },

    toggleNoteList() {
        const body = document.querySelector('.notes-body');
        if (body.classList.contains('list-only')) {
            body.classList.remove('list-only');
            document.getElementById('notesImgBtn').disabled = false;
        } else {
            this._renderNoteList();
            body.classList.add('list-only');
            document.getElementById('notesImgBtn').disabled = true;
        }
        document.getElementById('notesListBtn').classList.toggle(
            'active', body.classList.contains('list-only')
        );
    },

    _renderNoteList() {
        const t = k => (window.I18n && window.I18n.t) ? window.I18n.t(k) : k;
        const listEl = document.getElementById('notesListPanel');
        const notes = this.notesList.filter(n => (n.content || '').trim());
        if (notes.length === 0) {
            listEl.innerHTML = `<div class="notes-list-empty">${t('schedule.noNotes')}</div>`;
            return;
        }
        listEl.innerHTML = notes.map((note, idx) => {
            const raw = (note.content || '').split('\n').find(l => l.trim()) || '';
            const title = (raw.replace(/^#+\s*/, '').replace(/[*_`~\[\]!]/g, '').trim() || t('schedule.unnamedNote')).slice(0, 80);
            const isActive = note.id === this.currentNoteId;
            return `<div class="notes-list-item${isActive ? ' active' : ''}" data-note-id="${note.id}">
                <span class="notes-list-num">${idx + 1}</span>
                <span class="notes-list-title">${escHtml(title)}</span>
            </div>`;
        }).join('');
        listEl.querySelectorAll('.notes-list-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = parseInt(el.dataset.noteId, 10);
                const note = this.notesList.find(n => n.id === id);
                if (note) {
                    this.flushPendingNoteSave();
                    this._loadNote(note);
                    document.getElementById('notesListBtn').classList.remove('active');
                }
            });
        });
    },

    _updateNoteCounter() {
        const badge = document.getElementById('notesIndexBadge');
        if (!badge) return;
        const saved = this.notesList.filter(n => (n.content || '').trim());
        const hasUnsaved = this.currentNoteId === null && this.noteContent.trim();
        const total = saved.length + (hasUnsaved ? 1 : 0);
        if (total <= 1) {
            badge.textContent = '';
            badge.style.display = 'none';
            return;
        }
        const idx = this.currentNoteId !== null
            ? saved.findIndex(n => n.id === this.currentNoteId) + 1
            : total;
        badge.textContent = `${idx}/${total}`;
        badge.style.display = '';
    },

    updateSaveIndicator(state) {
        const ind = document.getElementById('noteSaveIndicator');
        if (!ind) return;
        ind.className = 'note-save-indicator';
        const t = (k) => (window.I18n && window.I18n.t) ? window.I18n.t(k) : k;
        if (state === 'saving') {
            ind.textContent = t('schedule.notesSaveIndicator.saving');
            ind.classList.add('saving');
        } else if (state === 'saved') {
            ind.textContent = t('schedule.notesSaveIndicator.saved');
            ind.classList.add('saved');
            clearTimeout(this._savedIndicatorTimer);
            this._savedIndicatorTimer = setTimeout(() => {
                ind.textContent = '';
                ind.className = 'note-save-indicator';
            }, 2000);
        } else {
            ind.textContent = '';
        }
    },

    async uploadNoteImage(file) {
        const t = k => (window.I18n && window.I18n.t) ? window.I18n.t(k) : k;
        const editor = document.getElementById('notesEditor');
        const placeholder = `![${t('schedule.imageUploading')}]()`;
        const start = editor.selectionStart;
        const before = editor.value.substring(0, start);
        const after = editor.value.substring(editor.selectionEnd);
        editor.value = before + placeholder + after;
        editor.selectionStart = editor.selectionEnd = start + placeholder.length;
        this.noteContent = editor.value;

        const formData = new FormData();
        formData.append('image', file);
        try {
            const r = await fetch('/api/notes/images', { method: 'POST', body: formData });
            const data = await r.json();
            if (!r.ok) {
                editor.value = before + after;
                editor.selectionStart = editor.selectionEnd = start;
                this.noteContent = editor.value;
                showToast(data.error || t('toast.noteImageUploadFailed'), { type: 'error' });
            } else {
                const md = `<img src="ni:${data.token}" style="display:block; margin:0 auto; zoom:100%;"/>`;
                editor.value = before + md + after;
                editor.selectionStart = editor.selectionEnd = start + md.length;
                this.noteContent = editor.value;
                this.renderNotePreview();
                this.debounceSaveNote();
            }
        } catch (e) {
            editor.value = before + after;
            editor.selectionStart = editor.selectionEnd = start;
            this.noteContent = editor.value;
            showToast(t('toast.noteImageUploadFailed'), { type: 'error' });
        }
    },

    debounceSaveNote() {
        if (this.noteSaveTimer) clearTimeout(this.noteSaveTimer);
        const dateToSave = this.selectedDateStr();
        const contentToSave = this.noteContent;
        const idToSave = this.currentNoteId;
        this._pendingNoteSave = { date: dateToSave, content: contentToSave, id: idToSave };
        this.updateSaveIndicator('saving');
        this.noteSaveTimer = setTimeout(async () => {
            this.noteSaveTimer = null;
            this._pendingNoteSave = null;
            await this._doSaveNote(dateToSave, contentToSave, idToSave);
        }, 800);
    },

    async _doSaveNote(date, content, noteId) {
        const t = k => (window.I18n && window.I18n.t) ? window.I18n.t(k) : k;
        try {
            if (!content.trim()) {
                if (noteId !== null) {
                    const r = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
                    if (r.ok) {
                        this.notesList = this.notesList.filter(n => n.id !== noteId);
                        if (this.currentNoteId === noteId) this.currentNoteId = null;
                        this._markerCacheMonth = null;
                        this.fetchCalendarMarkers();
                        this._updateNoteCounter();
                    }
                }
                this.updateSaveIndicator('saved');
                return;
            }
            if (noteId === null) {
                if (this._savingNewNote) return;
                this._savingNewNote = true;
                try {
                    const r = await fetch('/api/notes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date, content }),
                    });
                    if (!r.ok) {
                        this.updateSaveIndicator('');
                        showToast(t('toast.noteSaveFailed'), { type: 'error' });
                        return;
                    }
                    const data = await r.json();
                    this.currentNoteId = data.id;
                    if (!this.notesList.find(n => n.id === data.id)) {
                        this.notesList.push({ id: data.id, date, content, updated_at: '' });
                    }
                } finally {
                    this._savingNewNote = false;
                }
                // If the user typed more content while creation was in-flight, save it now
                if (this.noteContent !== content && this.noteContent.trim()) {
                    await this._doSaveNote(date, this.noteContent, this.currentNoteId);
                    return;
                }
            } else {
                const r = await fetch(`/api/notes/${noteId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content }),
                });
                if (!r.ok) {
                    this.updateSaveIndicator('');
                    showToast(t('toast.noteSaveFailed'), { type: 'error' });
                    return;
                }
                const existing = this.notesList.find(n => n.id === noteId);
                if (existing) existing.content = content;
            }
            this.updateSaveIndicator('saved');
            this._markerCacheMonth = null;
            this.fetchCalendarMarkers();
            this._updateNoteCounter();
        } catch (e) {
            console.error(e);
            this.updateSaveIndicator('');
            showToast(t('toast.noteNetworkError'), { type: 'error' });
        }
    },

    flushPendingNoteSave() {
        if (this.noteSaveTimer) {
            clearTimeout(this.noteSaveTimer);
            this.noteSaveTimer = null;
        }
        if (this._pendingNoteSave) {
            const { date, content, id } = this._pendingNoteSave;
            this._pendingNoteSave = null;
            const _t = k => (window.I18n && window.I18n.t) ? window.I18n.t(k) : k;
            if (!content.trim()) {
                if (id !== null) {
                    fetch(`/api/notes/${id}`, { method: 'DELETE' }).catch(e => {
                        console.error(e);
                        showToast(_t('toast.noteNetworkError'), { type: 'error' });
                    });
                    this.notesList = this.notesList.filter(n => n.id !== id);
                    if (this.currentNoteId === id) this.currentNoteId = null;
                }
            } else if (id === null) {
                fetch('/api/notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date, content }),
                }).then(async r => {
                    if (r.ok) {
                        const data = await r.json();
                        if (this.currentNoteId === null && this.selectedDateStr() === date) {
                            this.currentNoteId = data.id;
                            if (!this.notesList.find(n => n.id === data.id)) {
                                this.notesList.push({ id: data.id, date, content, updated_at: '' });
                            }
                            this._updateNoteCounter();
                        }
                    } else {
                        showToast(_t('toast.noteSaveFailed'), { type: 'error' });
                    }
                }).catch(e => {
                    console.error(e);
                    showToast(_t('toast.noteNetworkError'), { type: 'error' });
                });
            } else {
                fetch(`/api/notes/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content }),
                }).then(r => {
                    if (!r.ok) showToast(_t('toast.noteSaveFailed'), { type: 'error' });
                }).catch(e => {
                    console.error(e);
                    showToast(_t('toast.noteNetworkError'), { type: 'error' });
                });
            }
        }
    },

    async saveNote() {
        await this._doSaveNote(this.selectedDateStr(), this.noteContent, this.currentNoteId);
    },

    renderNotePreview() {
        const preview = document.getElementById('notesPreview');
        const emptyText = (window.I18n && window.I18n.t) ? window.I18n.t('schedule.previewEmpty') : 'Preview area — type Markdown content in the editor above';
        if (!this.noteContent.trim()) {
            preview.innerHTML = `<p style="color:var(--text-muted);font-style:italic">${emptyText}</p>`;
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
                html = DOMPurify.sanitize(html, {
                    ADD_TAGS: ['span'],
                    ADD_ATTR: ['class', 'style', 'align', 'width', 'height', 'colspan', 'rowspan'],
                });
                preview.innerHTML = html;
            } else {
                preview.textContent = this.noteContent;
            }
        } else {
            preview.textContent = this.noteContent;
        }
    },
};
