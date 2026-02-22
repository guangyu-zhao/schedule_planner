function showForm(name) {
    document.querySelectorAll('.auth-form-wrap').forEach(f => f.classList.remove('active'));
    document.querySelectorAll('.auth-error').forEach(e => e.textContent = '');
    const el = document.getElementById(name + 'Form');
    if (el) el.classList.add('active');

    if (name === 'forgot') {
        document.getElementById('forgotStep1').style.display = '';
        document.getElementById('forgotStep2').style.display = 'none';
        document.getElementById('forgotStep3').style.display = 'none';
        document.getElementById('forgotSubtitle').textContent = '输入您的注册邮箱，我们将发送验证码';
    }
}

function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    btn.disabled = loading;
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.textContent = loading ? '处理中...' : btn.dataset.originalText;
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
            }),
        });
        const data = await res.json();
        if (!res.ok) {
            showError('loginError', data.error || '登录失败');
            return;
        }
        window.location.href = '/';
    } catch {
        showError('loginError', '网络错误，请稍后重试');
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
        showError('registerError', '两次输入的密码不一致');
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
            }),
        });
        const data = await res.json();
        if (!res.ok) {
            showError('registerError', data.error || '注册失败');
            return;
        }
        window.location.href = '/';
    } catch {
        showError('registerError', '网络错误，请稍后重试');
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
            showError('forgotError', data.error || '发送失败');
            return;
        }
        document.getElementById('forgotStep1').style.display = 'none';
        document.getElementById('forgotStep2').style.display = '';
        document.getElementById('forgotSubtitle').textContent = `验证码已发送至 ${forgotEmail}`;
    } catch {
        showError('forgotError', '网络错误，请稍后重试');
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
            showError('verifyError', data.error || '验证失败');
            return;
        }
        document.getElementById('forgotStep2').style.display = 'none';
        document.getElementById('forgotStep3').style.display = '';
        document.getElementById('forgotSubtitle').textContent = '请设置新密码';
    } catch {
        showError('verifyError', '网络错误，请稍后重试');
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
        showError('resetError', '两次输入的密码不一致');
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
            showError('resetError', data.error || '重置失败');
            return;
        }
        showSuccess('resetError', '密码已重置，即将跳转到登录页...');
        setTimeout(() => showForm('login'), 1500);
    } catch {
        showError('resetError', '网络错误，请稍后重试');
    } finally {
        setLoading('resetBtn', false);
    }
    return false;
}

