export function fmtDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function escHtml(t) {
    if (t == null) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

export function showToast(message, options = {}) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastAction = document.getElementById('toastAction');

    const showUndo = typeof options === 'boolean' ? options : options.undo;
    const type = typeof options === 'object' ? options.type : undefined;

    if (window._toastTimer) clearTimeout(window._toastTimer);
    toast.classList.remove('toast-error', 'toast-success', 'toast-warning');
    if (type) toast.classList.add(`toast-${type}`);
    toastMessage.textContent = message;
    toastAction.style.display = showUndo ? 'inline-block' : 'none';
    toast.classList.add('active');
    window._toastTimer = setTimeout(() => {
        toast.classList.remove('active', 'toast-error', 'toast-success', 'toast-warning');
    }, showUndo ? 6000 : 3000);
}
