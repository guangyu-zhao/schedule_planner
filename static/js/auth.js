function showForm(name) {
    document.querySelectorAll('.auth-form-wrap').forEach(f => f.classList.remove('active'));
    document.querySelectorAll('.auth-error').forEach(e => e.textContent = '');
    const el = document.getElementById(name + 'Form');
    if (el) el.classList.add('active');

    if (name === 'forgot') {
        document.getElementById('forgotStep1').style.display = '';
        document.getElementById('forgotStep2').style.display = 'none';
        document.getElementById('forgotStep3').style.display = 'none';
        document.getElementById('forgotSubtitle').textContent = (window.I18n && I18n.t) ? I18n.t('auth.reset.subtitle') : "Enter your registered email, we'll send a verification code";
    }
}

function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    btn.disabled = loading;
    const i18nKey = btn.getAttribute('data-i18n');
    if (loading) {
        btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
        btn.textContent = (window.I18n && I18n.t) ? I18n.t('auth.processing') : 'Processing...';
    } else {
        btn.textContent = (i18nKey && window.I18n && I18n.t) ? I18n.t(i18nKey) : (btn.dataset.originalText || '');
    }
}

function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.remove('auth-success');
}

function showSuccess(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add('auth-success');
}

async function handleLogin(e) {
    e.preventDefault();
    showError('loginError', '');
    setLoading('loginBtn', true);

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('loginEmail').value.trim(),
                password: document.getElementById('loginPassword').value,
                remember: document.getElementById('loginRemember').checked,
                language: (window.I18n && I18n.getLanguage) ? I18n.getLanguage() : 'en',
            }),
        });
        const data = await res.json();
        if (!res.ok) {
            showError('loginError', (window.I18n && I18n.translateError) ? I18n.translateError(data.error) || I18n.t('auth.loginFailed') : (data.error || 'Login failed'));
            return;
        }
        window.location.href = '/';
    } catch {
        showError('loginError', (window.I18n && I18n.t) ? I18n.t('auth.networkError') : 'Network error, please try again later');
    } finally {
        setLoading('loginBtn', false);
    }
    return false;
}

async function handleRegister(e) {
    e.preventDefault();
    showError('registerError', '');

    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;
    if (password !== confirm) {
        showError('registerError', (window.I18n && I18n.t) ? I18n.t('auth.passwordMismatch') : 'Passwords do not match');
        return false;
    }

    setLoading('registerBtn', true);
    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('regEmail').value.trim(),
                username: document.getElementById('regUsername').value.trim(),
                password: password,
                language: (window.I18n && I18n.getLanguage) ? I18n.getLanguage() : 'en',
            }),
        });
        const data = await res.json();
        if (!res.ok) {
            showError('registerError', (window.I18n && I18n.translateError) ? I18n.translateError(data.error) || I18n.t('auth.registerFailed') : (data.error || 'Registration failed'));
            return;
        }
        window.location.href = '/';
    } catch {
        showError('registerError', (window.I18n && I18n.t) ? I18n.t('auth.networkError') : 'Network error, please try again later');
    } finally {
        setLoading('registerBtn', false);
    }
    return false;
}

let forgotEmail = '';

async function handleForgot(e) {
    e.preventDefault();
    showError('forgotError', '');
    setLoading('forgotBtn', true);

    forgotEmail = document.getElementById('forgotEmail').value.trim();
    try {
        const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotEmail }),
        });
        const data = await res.json();
        if (!res.ok) {
            showError('forgotError', (window.I18n && I18n.translateError) ? I18n.translateError(data.error) || I18n.t('auth.sendFailed') : (data.error || 'Failed to send'));
            return;
        }
        document.getElementById('forgotStep1').style.display = 'none';
        document.getElementById('forgotStep2').style.display = '';
        document.getElementById('forgotSubtitle').textContent = (window.I18n && I18n.t) ? I18n.t('auth.codeSent').replace('{email}', forgotEmail) : `Code sent to ${forgotEmail}`;
    } catch {
        showError('forgotError', (window.I18n && I18n.t) ? I18n.t('auth.networkError') : 'Network error, please try again later');
    } finally {
        setLoading('forgotBtn', false);
    }
    return false;
}

async function handleVerifyCode(e) {
    e.preventDefault();
    showError('verifyError', '');
    setLoading('verifyBtn', true);

    try {
        const res = await fetch('/api/auth/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: forgotEmail,
                code: document.getElementById('verifyCode').value.trim(),
            }),
        });
        const data = await res.json();
        if (!res.ok) {
            showError('verifyError', (window.I18n && I18n.translateError) ? I18n.translateError(data.error) || I18n.t('auth.verifyFailed') : (data.error || 'Verification failed'));
            return;
        }
        document.getElementById('forgotStep2').style.display = 'none';
        document.getElementById('forgotStep3').style.display = '';
        document.getElementById('forgotSubtitle').textContent = (window.I18n && I18n.t) ? I18n.t('auth.setNewPassword') : 'Set your new password';
    } catch {
        showError('verifyError', (window.I18n && I18n.t) ? I18n.t('auth.networkError') : 'Network error, please try again later');
    } finally {
        setLoading('verifyBtn', false);
    }
    return false;
}

async function handleResetPassword(e) {
    e.preventDefault();
    showError('resetError', '');

    const password = document.getElementById('newPassword').value;
    const confirm = document.getElementById('newConfirm').value;
    if (password !== confirm) {
        showError('resetError', (window.I18n && I18n.t) ? I18n.t('auth.passwordMismatch') : 'Passwords do not match');
        return false;
    }

    setLoading('resetBtn', true);
    try {
        const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (!res.ok) {
            showError('resetError', (window.I18n && I18n.translateError) ? I18n.translateError(data.error) || I18n.t('auth.resetFailed') : (data.error || 'Reset failed'));
            return;
        }
        showSuccess('resetError', (window.I18n && I18n.t) ? I18n.t('auth.resetSuccess') : 'Password reset, redirecting to login...');
        setTimeout(() => showForm('login'), 1500);
    } catch {
        showError('resetError', (window.I18n && I18n.t) ? I18n.t('auth.networkError') : 'Network error, please try again later');
    } finally {
        setLoading('resetBtn', false);
    }
    return false;
}
