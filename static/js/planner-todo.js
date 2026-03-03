/* ================================================================
   TODO LIST MIXIN
   ================================================================ */
export const TodoMixin = {

    initTodo() {
        this.todos = [];
        this._todoInputVisible = false;

        document.getElementById('todoAddBtn').addEventListener('click', () => this._showTodoInput());
        document.getElementById('todoInputConfirm').addEventListener('click', () => this._submitTodoInput());
        document.getElementById('todoInput').addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); this._submitTodoInput(); }
            if (e.key === 'Escape') { e.preventDefault(); this._hideTodoInput(); }
        });

        this.fetchTodos();
    },

    async fetchTodos() {
        try {
            const res = await fetch('/api/todos');
            if (!res.ok) return;
            this.todos = await res.json();
            this._renderTodoList();
        } catch (e) { /* ignore */ }
    },

    _renderTodoList() {
        const ul = document.getElementById('todoList');
        if (!ul) return;
        ul.innerHTML = '';
        this.todos.forEach(todo => {
            const li = document.createElement('li');
            li.className = 'todo-item' + (todo.done ? ' todo-done' : '');
            li.dataset.id = todo.id;

            const checkbox = document.createElement('span');
            checkbox.className = 'todo-checkbox';
            checkbox.innerHTML = todo.done
                ? '<svg viewBox="0 0 14 14" width="14" height="14"><rect x="1" y="1" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 7l3 3 5-5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                : '<svg viewBox="0 0 14 14" width="14" height="14"><rect x="1" y="1" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
            checkbox.addEventListener('click', () => this._toggleTodo(todo.id, !todo.done));

            const textEl = document.createElement('span');
            textEl.className = 'todo-text';
            textEl.textContent = todo.text;

            const delBtn = document.createElement('button');
            delBtn.className = 'todo-delete-btn';
            delBtn.innerHTML = '<svg viewBox="0 0 14 14" width="13" height="13"><path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M5.5 6.5v4M8.5 6.5v4M3 4l.8 7.2A1 1 0 004.8 12h4.4a1 1 0 001-.8L11 4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            const delTitle = (window.I18n && window.I18n.t) ? window.I18n.t('todo.delete') : 'Delete';
            delBtn.title = delTitle;
            delBtn.addEventListener('click', () => this._deleteTodo(todo.id));

            li.appendChild(checkbox);
            li.appendChild(textEl);
            li.appendChild(delBtn);
            ul.appendChild(li);
        });
    },

    _showTodoInput() {
        const row = document.getElementById('todoInputRow');
        const input = document.getElementById('todoInput');
        row.style.display = 'flex';
        input.value = '';
        input.focus();
        this._todoInputVisible = true;
    },

    _hideTodoInput() {
        document.getElementById('todoInputRow').style.display = 'none';
        this._todoInputVisible = false;
    },

    async _submitTodoInput() {
        const input = document.getElementById('todoInput');
        const text = (input.value || '').trim();
        if (!text) { this._hideTodoInput(); return; }
        try {
            const res = await fetch('/api/todos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (!res.ok) return;
            const newTodo = await res.json();
            this.todos.unshift(newTodo);
            this._renderTodoList();
            this._hideTodoInput();
        } catch (e) { /* ignore */ }
    },

    async _toggleTodo(id, done) {
        try {
            const res = await fetch(`/api/todos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ done }),
            });
            if (!res.ok) return;
            const todo = this.todos.find(t => t.id === id);
            if (todo) { todo.done = done ? 1 : 0; }
            this._renderTodoList();
        } catch (e) { /* ignore */ }
    },

    async _deleteTodo(id) {
        try {
            const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
            if (!res.ok) return;
            this.todos = this.todos.filter(t => t.id !== id);
            this._renderTodoList();
        } catch (e) { /* ignore */ }
    },
};
