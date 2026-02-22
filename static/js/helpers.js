export function fmtDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function escHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

export function showToast(message, showUndo = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastAction = document.getElementById('toastAction');

    if (window._toastTimer) clearTimeout(window._toastTimer);
    toastMessage.textContent = message;
    toastAction.style.display = showUndo ? 'inline-block' : 'none';
    toast.classList.add('active');
    window._toastTimer = setTimeout(() => {
        toast.classList.remove('active');
    }, showUndo ? 6000 : 3000);
}
