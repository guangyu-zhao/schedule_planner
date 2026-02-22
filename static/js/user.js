let currentUser = null;

async function loadCurrentUser() {
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            return;
        }
        const data = await res.json();
        currentUser = data.user;
        updateUserUI();
    } catch { /* ignore */ }
}

function updateUserUI() {
    if (!currentUser) return;

    const initial = (currentUser.username || currentUser.email || 'U').charAt(0).toUpperCase();

    document.getElementById('userNameText').textContent = currentUser.username || '用户';
    document.getElementById('userAvatarInitial').textContent = initial;
    document.getElementById('dropdownAvatarInitial').textContent = initial;
    document.getElementById('profileAvatarInitial').textContent = initial;
    document.getElementById('dropdownUsername').textContent = currentUser.username || '用户';
    document.getElementById('dropdownEmail').textContent = currentUser.email;

    if (currentUser.avatar) {
        const url = `/uploads/avatars/${currentUser.avatar}?t=${Date.now()}`;
        setAvatarImage('userAvatarImg', 'userAvatarInitial', url);
        setAvatarImage('dropdownAvatarImg', 'dropdownAvatarInitial', url);
        setAvatarImage('profileAvatarImg', 'profileAvatarInitial', url);
    }
}

function setAvatarImage(imgId, initialId, url) {
    const img = document.getElementById(imgId);
    const initial = document.getElementById(initialId);
    if (img && url) {
        img.src = url;
        img.style.display = '';
        if (initial) initial.style.display = 'none';
        img.onerror = () => {
            img.style.display = 'none';
            if (initial) initial.style.display = '';
        };
    }
}

document.getElementById('userMenuBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('userDropdown').classList.toggle('active');
});

document.addEventListener('click', e => {
    if (!e.target.closest('.user-menu')) {
        document.getElementById('userDropdown')?.classList.remove('active');
    }
});

function openProfile() {
    document.getElementById('userDropdown').classList.remove('active');
    document.getElementById('profileOverlay').classList.add('active');

    if (currentUser) {
        document.getElementById('profileUsername').value = currentUser.username || '';
        document.getElementById('profileBio').value = currentUser.bio || '';
        document.getElementById('profileEmail').value = currentUser.email || '';
        document.getElementById('profileCreatedAt').value = currentUser.created_at || '';
    }

    document.getElementById('pwdOld').value = '';
    document.getElementById('pwdNew').value = '';
    document.getElementById('pwdConfirm').value = '';
}

function closeProfile() {
    document.getElementById('profileOverlay').classList.remove('active');
}

document.getElementById('profileOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProfile();
});

async function saveProfile() {
    const username = document.getElementById('profileUsername').value.trim();
    const bio = document.getElementById('profileBio').value.trim();

    if (!username || username.length < 2) {
        showProfileToast('用户名长度需在 2-30 个字符之间', 'error');
        return;
    }

    try {
        const res = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, bio }),
        });
        const data = await res.json();
        if (!res.ok) {
            showProfileToast(data.error || '保存失败', 'error');
            return;
        }
        currentUser = data.user;
        updateUserUI();
        showProfileToast('资料已更新');
    } catch {
        showProfileToast('网络错误', 'error');
    }
}

async function handleAvatarUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        showProfileToast('文件大小不能超过 5MB', 'error');
        input.value = '';
        return;
    }

    const fd = new FormData();
    fd.append('avatar', file);

    try {
        const res = await fetch('/api/user/avatar', {
            method: 'POST',
            body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
            showProfileToast(data.error || '上传失败', 'error');
            return;
        }
        currentUser.avatar = data.avatar;
        updateUserUI();
        showProfileToast('头像已更新');
    } catch {
        showProfileToast('上传失败', 'error');
    }
    input.value = '';
}

async function changePassword() {
    const oldPwd = document.getElementById('pwdOld').value;
    const newPwd = document.getElementById('pwdNew').value;
    const confirmPwd = document.getElementById('pwdConfirm').value;

    if (!oldPwd || !newPwd || !confirmPwd) {
        showProfileToast('请填写所有密码字段', 'error');
        return;
    }
    if (newPwd !== confirmPwd) {
        showProfileToast('两次输入的新密码不一致', 'error');
        return;
    }

    try {
        const res = await fetch('/api/user/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                old_password: oldPwd,
                new_password: newPwd,
                confirm_password: confirmPwd,
            }),
        });
        const data = await res.json();
        if (!res.ok) {
            showProfileToast(data.error || '修改失败', 'error');
            return;
        }
        document.getElementById('pwdOld').value = '';
        document.getElementById('pwdNew').value = '';
        document.getElementById('pwdConfirm').value = '';
        showProfileToast('密码修改成功');
    } catch {
        showProfileToast('网络错误', 'error');
    }
}

async function exportData() {
    document.getElementById('userDropdown').classList.remove('active');
    try {
        const res = await fetch('/api/user/export');
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `schedule_planner_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showProfileToast('数据导出成功');
    } catch {
        showProfileToast('导出失败', 'error');
    }
}

async function exportCSV() {
    document.getElementById('userDropdown').classList.remove('active');
    try {
        const res = await fetch('/api/user/export-csv');
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `schedule_planner_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showProfileToast('CSV 数据导出成功');
    } catch {
        showProfileToast('CSV 导出失败', 'error');
    }
}

async function exportICal() {
    document.getElementById('userDropdown').classList.remove('active');
    try {
        const res = await fetch('/api/user/export-ical');
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `schedule_${new Date().toISOString().split('T')[0]}.ics`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showProfileToast('iCal 日历导出成功');
    } catch {
        showProfileToast('iCal 导出失败', 'error');
    }
}

async function importData() {
    document.getElementById('userDropdown').classList.remove('active');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        let text;
        try {
            text = await file.text();
            JSON.parse(text);
        } catch {
            showProfileToast('文件格式不正确，请选择有效的 JSON 文件', 'error');
            return;
        }
        try {
            const res = await fetch('/api/user/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: text,
            });
            const result = await res.json();
            if (!res.ok) {
                showProfileToast(result.error || '导入失败', 'error');
                return;
            }
            showProfileToast(result.message);
            if (window.planner) { window.planner.fetchEvents(); window.planner.fetchNote(); }
            if (window.timer) { window.timer.fetchRecords(); window.timer.fetchStats(); }
        } catch {
            showProfileToast('网络错误，导入失败', 'error');
        }
    };
    input.click();
}

function deleteAccount() {
    closeProfile();
    document.getElementById('deleteAccountPwd').value = '';
    document.getElementById('deleteAccountError').textContent = '';
    document.getElementById('deleteAccountModal').classList.add('active');
}

async function confirmDeleteAccount() {
    const password = document.getElementById('deleteAccountPwd').value;
    if (!password) {
        document.getElementById('deleteAccountError').textContent = '请输入密码';
        return;
    }

    const btn = document.getElementById('confirmDeleteAccountBtn');
    btn.disabled = true;
    btn.textContent = '删除中...';

    try {
        const res = await fetch('/api/user/delete-account', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (!res.ok) {
            document.getElementById('deleteAccountError').textContent = data.error || '删除失败';
            return;
        }
        window.location.href = '/login';
    } catch {
        document.getElementById('deleteAccountError').textContent = '网络错误';
    } finally {
        btn.disabled = false;
        btn.textContent = '确认删除';
    }
}

async function handleLogout() {
    document.getElementById('userDropdown').classList.remove('active');
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    window.location.href = '/login';
}

function showProfileToast(message, type) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastAction = document.getElementById('toastAction');
    if (!toast || !toastMessage) return;

    if (window._toastTimer) clearTimeout(window._toastTimer);
    toast.classList.remove('toast-error', 'toast-success', 'toast-warning');
    if (type) toast.classList.add(`toast-${type}`);
    toastMessage.textContent = message;
    toastAction.style.display = 'none';
    toast.classList.add('active');
    window._toastTimer = setTimeout(() => {
        toast.classList.remove('active', 'toast-error', 'toast-success', 'toast-warning');
    }, 3000);
}

/* ===== Theme Toggle ===== */
function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateThemeIcon();
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon();
}

function updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (!icon) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    icon.textContent = isDark ? '☀️' : '🌙';
}

document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

/* ===== Keyboard Shortcuts Help ===== */
document.addEventListener('keydown', e => {
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        const modal = document.getElementById('shortcutsModal');
        if (modal) modal.classList.toggle('active');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadCurrentUser();
});

const _origFetch = window.fetch;
window.fetch = async function(...args) {
    const res = await _origFetch.apply(this, args);
    if (res.status === 401) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (!url.includes('/api/auth/')) {
            window.location.href = '/login';
        }
    }
    return res;
};
