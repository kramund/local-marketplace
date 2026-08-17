// ─── Auth Helpers ────────────────────────────────────────────

const API = '/api';

const getToken = () => localStorage.getItem('lm_token');
const getUser  = () => JSON.parse(localStorage.getItem('lm_user') || 'null');

const saveSession = (token, user) => {
  localStorage.setItem('lm_token', token);
  localStorage.setItem('lm_user', JSON.stringify(user));
};

const clearSession = () => {
  localStorage.removeItem('lm_token');
  localStorage.removeItem('lm_user');
};

const isLoggedIn = () => !!getToken();

const authFetch = (url, options = {}) => {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });
};

// Redirect to login if not authenticated
const requireLogin = () => {
  if (!isLoggedIn()) {
    window.location.href = '/pages/login.html';
  }
};

// Redirect to home if already logged in
const redirectIfLoggedIn = () => {
  if (isLoggedIn()) {
    window.location.href = '/';
  }
};

// ─── Register ────────────────────────────────────────────────

const registerForm = document.getElementById('register-form');
if (registerForm) {
  redirectIfLoggedIn();

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const payload = {
      username:   document.getElementById('username').value.trim(),
      email:      document.getElementById('email').value.trim(),
      password:   document.getElementById('password').value,
      full_name:  document.getElementById('full_name').value.trim(),
      phone:      document.getElementById('phone').value.trim(),
      location:   document.getElementById('location').value.trim(),
    };

    const confirmPassword = document.getElementById('confirm_password').value;
    if (payload.password !== confirmPassword) {
      return showError('Passwords do not match.');
    }

    setLoading(true);

    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) return showError(data.error);

      saveSession(data.token, data.user);
      window.location.href = '/';
    } catch {
      showError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  });
}

// ─── Login ───────────────────────────────────────────────────

const loginForm = document.getElementById('login-form');
if (loginForm) {
  redirectIfLoggedIn();

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const payload = {
      email:    document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    };

    setLoading(true);

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) return showError(data.error);

      saveSession(data.token, data.user);
      window.location.href = '/';
    } catch {
      showError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  });
}

// ─── UI Helpers ──────────────────────────────────────────────

const showError = (msg) => {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
};

const clearError = () => {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
};

const setLoading = (state) => {
  const btn = document.querySelector('.btn-submit');
  if (btn) {
    btn.disabled = state;
    btn.textContent = state ? 'Please wait...' : btn.dataset.label;
  }
};
