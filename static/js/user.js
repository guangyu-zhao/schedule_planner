let currentUser = null;

function t(k, p) { return (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k; }
function translateError(msg) { return (window.I18n && window.I18n.translateError) ? window.I18n.translateError(msg) : msg; }

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
        if (currentUser && currentUser.language && window.I18n && window.I18n.setLanguage) {
            window.I18n.setLanguage(currentUser.language);
            if (window.I18n.t) document.title = window.I18n.t('app.title');
            if (window.planner && window.planner.renderCalendar) window.planner.renderCalendar();
            if (window.timer) {
                window.timer.renderCalendar();
                window.timer.originalTitle = document.title;
            }
            if (window.stats) {
                window.stats.renderCalendar();
                window.stats.updateRangeLabel();
            }
        }
        updateUserUI();
    } catch { /* ignore */ }
}

function updateUserUI() {
    if (!currentUser) return;

    const userLabel = t('user.default');
    const initial = (currentUser.username || currentUser.email || 'U').charAt(0).toUpperCase();

    document.getElementById('userNameText').textContent = currentUser.username || userLabel;
    document.getElementById('userAvatarInitial').textContent = initial;
    document.getElementById('dropdownAvatarInitial').textContent = initial;
    document.getElementById('profileAvatarInitial').textContent = initial;
    document.getElementById('dropdownUsername').textContent = currentUser.username || userLabel;
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

    const langSelect = document.getElementById('profileLanguage');
    if (langSelect && window.I18n && window.I18n.LANGUAGES) {
        langSelect.innerHTML = '';
        window.I18n.LANGUAGES.forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang.code;
            opt.textContent = lang.name;
            langSelect.appendChild(opt);
        });
        langSelect.value = currentUser?.language || (window.I18n.getLanguage ? window.I18n.getLanguage() : 'en');
        langSelect.onchange = () => changeLanguage(langSelect.value);
    }

    loadSessions();
}

function closeProfile() {
    document.getElementById('profileOverlay').classList.remove('active');
}

document.getElementById('profileOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProfile();
});

async function changeLanguage(language) {
    if (!language || !currentUser) return;
    const prevLang = window.I18n && window.I18n.getLanguage ? window.I18n.getLanguage() : 'en';
    if (language === prevLang) return;

    try {
        const res = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username || '',
                bio: currentUser.bio || '',
                language,
            }),
        });
        if (!res.ok) return;
        if (window.I18n && window.I18n.setLanguage) {
            window.I18n.setLanguage(language);
        }
        window.location.reload();
    } catch { /* ignore */ }
}

async function saveProfile() {
    const username = document.getElementById('profileUsername').value.trim();
    const bio = document.getElementById('profileBio').value.trim();
    const langSelect = document.getElementById('profileLanguage');
    const language = langSelect ? langSelect.value : null;

    if (!username || username.length < 2) {
        showProfileToast(t('error.usernameLength'), 'error');
        return;
    }

    const prevLang = window.I18n && window.I18n.getLanguage ? window.I18n.getLanguage() : 'en';
    const langChanged = language && language !== prevLang;

    try {
        const res = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, bio, language: language || undefined }),
        });
        const data = await res.json();
        if (!res.ok) {
            showProfileToast(translateError(data.error) || t('profile.saveFailed'), 'error');
            return;
        }
        currentUser = data.user;
        updateUserUI();
        showProfileToast(t('profile.saved'));

        if (langChanged && language && window.I18n && window.I18n.setLanguage) {
            window.I18n.setLanguage(language);
            window.location.reload();
        }
    } catch {
        showProfileToast(t('toast.networkError'), 'error');
    }
}

async function handleAvatarUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        showProfileToast(translateError('上传文件过大，最大 5MB') || t('error.fileTooLarge'), 'error');
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
            showProfileToast(translateError(data.error) || t('profile.uploadFailed'), 'error');
            return;
        }
        currentUser.avatar = data.avatar;
        updateUserUI();
        showProfileToast(t('profile.avatarUpdated'));
    } catch {
        showProfileToast(t('profile.uploadFailed'), 'error');
    }
    input.value = '';
}

async function changePassword() {
    const oldPwd = document.getElementById('pwdOld').value;
    const newPwd = document.getElementById('pwdNew').value;
    const confirmPwd = document.getElementById('pwdConfirm').value;

    if (!oldPwd || !newPwd || !confirmPwd) {
        showProfileToast(t('profile.fillAllPassword'), 'error');
        return;
    }
    if (newPwd !== confirmPwd) {
        showProfileToast(t('auth.passwordMismatch'), 'error');
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
            showProfileToast(translateError(data.error) || t('profile.saveFailed'), 'error');
            return;
        }
        document.getElementById('pwdOld').value = '';
        document.getElementById('pwdNew').value = '';
        document.getElementById('pwdConfirm').value = '';
        showProfileToast(t('profile.passwordChanged'));
    } catch {
        showProfileToast(t('toast.networkError'), 'error');
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
        showProfileToast(t('profile.exportSuccess'));
    } catch {
        showProfileToast(t('profile.exportFailed'), 'error');
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
        showProfileToast(t('profile.csvExportSuccess'));
    } catch {
        showProfileToast(t('profile.csvExportFailed'), 'error');
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
        showProfileToast(t('profile.icalExportSuccess'));
    } catch {
        showProfileToast(t('profile.icalExportFailed'), 'error');
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
            showProfileToast(t('profile.invalidFile'), 'error');
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
                showProfileToast(translateError(result.error) || t('profile.importFailed'), 'error');
                return;
            }
            showProfileToast(result.message || t('profile.importSuccess'));
            if (window.planner) { window.planner.fetchEvents(); window.planner.fetchNote(); }
            if (window.timer) { window.timer.fetchRecords(); window.timer.fetchStats(); }
        } catch {
            showProfileToast(t('profile.importNetworkError'), 'error');
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
        document.getElementById('deleteAccountError').textContent = t('deleteAccount.enterPassword');
        return;
    }

    const btn = document.getElementById('confirmDeleteAccountBtn');
    const confirmText = t('deleteAccount.confirm');
    btn.disabled = true;
    btn.textContent = t('deleteAccount.deleting');

    try {
        const res = await fetch('/api/user/delete-account', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (!res.ok) {
            document.getElementById('deleteAccountError').textContent = translateError(data.error) || t('deleteAccount.deleteFailed');
            return;
        }
        window.location.href = '/login';
    } catch {
        document.getElementById('deleteAccountError').textContent = t('deleteAccount.networkError');
    } finally {
        btn.disabled = false;
        btn.textContent = confirmText;
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

// ── Device / session management ───────────────────────────────────────────────

async function loadSessions() {
    const list = document.getElementById('sessionsList');
    if (!list) return;
    list.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${t('profile.sessions.loading') || '加载中...'}</p>`;
    try {
        const res = await fetch('/api/auth/sessions');
        if (!res.ok) { list.innerHTML = ''; return; }
        const data = await res.json();
        const sessions = data.sessions || [];
        if (!sessions.length) {
            list.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${t('profile.sessions.empty') || '无其他登录设备'}</p>`;
            return;
        }
        list.innerHTML = sessions.map(s => {
            const ua = s.user_agent || '';
            const device = ua.length > 60 ? ua.slice(0, 60) + '…' : ua;
            const active = s.last_active ? new Date(s.last_active).toLocaleString() : '-';
            const current = s.is_current ? ` <span class="session-badge-current">${t('profile.sessions.current') || '当前设备'}</span>` : '';
            const revokeBtn = s.is_current ? '' :
                `<button class="session-revoke-btn" onclick="revokeSession(${s.id})">${t('profile.sessions.revoke') || '踢出'}</button>`;
            return `<div class="session-item">
                <div class="session-info">
                    <span class="session-device">${device}${current}</span>
                    <span class="session-meta">${t('profile.sessions.lastActive') || '最后活跃'}: ${active} &nbsp;·&nbsp; IP: ${s.ip_address || '-'}</span>
                </div>
                ${revokeBtn}
            </div>`;
        }).join('');
    } catch {
        list.innerHTML = '';
    }
}

async function revokeSession(dbId) {
    try {
        const res = await fetch(`/api/auth/sessions/${dbId}`, { method: 'DELETE' });
        if (res.ok) {
            loadSessions();
            if (window.showToast) showToast(t('profile.sessions.revokeSuccess') || '已踢出设备', 'success');
        }
    } catch { /* ignore */ }
}

async function revokeAllSessions() {
    try {
        const res = await fetch('/api/auth/sessions/all-others', { method: 'DELETE' });
        if (res.ok) {
            loadSessions();
            if (window.showToast) showToast(t('profile.sessions.revokeAllSuccess') || '已踢出所有其他设备', 'success');
        }
    } catch { /* ignore */ }
}
