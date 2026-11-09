/**
 * SGA.IN Client Portal - Authentication UI Controller (auth.js)
 * Coordinates login, register, forgot-password and reset-password forms.
 */

import { api } from './api.js';
import { ui } from './ui.js';
import { authGuard } from './auth-guard.js';

// Setup password visibility toggles
export function setupPasswordToggle(inputEl, btnEl) {
  if (!inputEl || !btnEl) return;
  btnEl.addEventListener('click', () => {
    const isPassword = inputEl.type === 'password';
    inputEl.type = isPassword ? 'text' : 'password';
    btnEl.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    btnEl.innerHTML = isPassword
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });
}

// Live password strength checker
export function setupPasswordStrength(passwordInput) {
  const reqLen = document.getElementById('rule-len');
  const reqUpper = document.getElementById('rule-upper');
  const reqLower = document.getElementById('rule-lower');
  const reqNum = document.getElementById('rule-num');
  const bar = document.getElementById('strength-bar');

  if (!passwordInput || !reqLen) return;

  function update() {
    const val = passwordInput.value || '';
    const hasLen = val.length >= 8;
    const hasUpper = /[A-Z]/.test(val);
    const hasLower = /[a-z]/.test(val);
    const hasNum = /[0-9]/.test(val);

    const updateRule = (el, valid) => {
      if (!el) return;
      el.classList.toggle('is-valid', valid);
      const dot = el.querySelector('.rule-dot');
      if (dot) dot.innerHTML = valid ? '&#10003;' : '';
    };

    updateRule(reqLen, hasLen);
    updateRule(reqUpper, hasUpper);
    updateRule(reqLower, hasLower);
    updateRule(reqNum, hasNum);

    const score = [hasLen, hasUpper, hasLower, hasNum].filter(Boolean).length;
    if (bar) {
      bar.className = 'strength-bar-fill';
      if (score === 1) bar.classList.add('strength-weak');
      else if (score === 2) bar.classList.add('strength-fair');
      else if (score === 3) bar.classList.add('strength-good');
      else if (score === 4) bar.classList.add('strength-strong');
    }
  }

  passwordInput.addEventListener('input', update);
  update();
}

// LOGIN CONTROLLER
export function initLogin() {
  authGuard.redirectIfAuthenticated();
  ui.initDemoRibbon();

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const toggleBtn = document.getElementById('login-password-toggle');
  const rememberCheckbox = document.getElementById('login-remember');
  const submitBtn = document.getElementById('login-submit-btn');
  const alertEl = document.getElementById('login-alert');

  setupPasswordToggle(passwordInput, toggleBtn);

  // Check URL params for prefilled info or logout reason
  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason');
  if (reason && alertEl) {
    alertEl.textContent = reason;
    alertEl.className = 'auth-alert auth-alert--error is-visible';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.classList.remove('is-visible');

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const rememberMe = rememberCheckbox ? rememberCheckbox.checked : false;

    if (!email || !password) {
      alertEl.textContent = 'Please enter both email and password.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    const res = await api.login({ email, password, rememberMe });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In to Portal';

    if (!res.ok) {
      alertEl.textContent = res.error || 'Invalid email or password.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      return;
    }

    ui.showToast(`Welcome back, ${res.data.user.fullName}.`, 'success');
    const redirect = urlParams.get('redirect');
    const target = redirect ? decodeURIComponent(redirect) : 'dashboard.html';
    window.location.href = target;
  });
}

// REGISTER CONTROLLER
export function initRegister() {
  authGuard.redirectIfAuthenticated();
  ui.initDemoRibbon();

  const form = document.getElementById('register-form');
  const nameInput = document.getElementById('reg-name');
  const emailInput = document.getElementById('reg-email');
  const phoneInput = document.getElementById('reg-phone');
  const passwordInput = document.getElementById('reg-password');
  const confirmInput = document.getElementById('reg-confirm');
  const termsCheckbox = document.getElementById('reg-terms');
  const toggleBtn = document.getElementById('reg-password-toggle');
  const submitBtn = document.getElementById('reg-submit-btn');
  const alertEl = document.getElementById('reg-alert');

  setupPasswordToggle(passwordInput, toggleBtn);
  setupPasswordStrength(passwordInput);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.classList.remove('is-visible');

    const fullName = nameInput.value.trim();
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;

    if (!fullName || fullName.length < 2) {
      alertEl.textContent = 'Please enter your full name.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      nameInput.focus();
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alertEl.textContent = 'Please enter a valid email address.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      emailInput.focus();
      return;
    }

    if (!phone || phone.length < 8) {
      alertEl.textContent = 'Please enter a valid phone number (e.g., +91 79854 36965).';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      phoneInput.focus();
      return;
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      alertEl.textContent = 'Please ensure your password satisfies all security rules.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      passwordInput.focus();
      return;
    }

    if (password !== confirm) {
      alertEl.textContent = 'Passwords do not match.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      confirmInput.focus();
      return;
    }

    if (!termsCheckbox.checked) {
      alertEl.textContent = 'Please accept the Terms & Conditions and Privacy Policy.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    const res = await api.register({ fullName, email, phone, password });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Client Account';

    if (!res.ok) {
      alertEl.textContent = res.error || 'Registration failed. Please try again.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      return;
    }

    ui.showToast('Account created successfully. Welcome to SGA.IN!', 'success');
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 400);
  });
}

// FORGOT PASSWORD CONTROLLER
export function initForgotPassword() {
  ui.initDemoRibbon();

  const form = document.getElementById('forgot-form');
  const emailInput = document.getElementById('forgot-email');
  const submitBtn = document.getElementById('forgot-submit-btn');
  const bannerEl = document.getElementById('forgot-demo-banner');
  const codePillEl = document.getElementById('demo-code-display');
  const nextLink = document.getElementById('proceed-to-reset-btn');
  const alertEl = document.getElementById('forgot-alert');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.classList.remove('is-visible');

    const email = emailInput.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alertEl.textContent = 'Please enter a valid email address.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating reset code...';

    const res = await api.forgotPassword(email);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Reset Code';

    if (!res.ok) {
      alertEl.textContent = res.error || 'Failed to process password reset.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      return;
    }

    if (res.data.demoCode) {
      if (bannerEl) bannerEl.style.display = 'flex';
      if (codePillEl) codePillEl.textContent = res.data.demoCode;
      if (nextLink) {
        nextLink.href = `reset-password.html?email=${encodeURIComponent(email)}&code=${res.data.demoCode}`;
        nextLink.style.display = 'inline-flex';
      }
      ui.showToast(`Reset code generated: ${res.data.demoCode}`, 'info', 6000);
    } else {
      alertEl.textContent = 'If an account exists with this email, a reset code was generated.';
      alertEl.className = 'auth-alert auth-alert--success is-visible';
    }
  });
}

// RESET PASSWORD CONTROLLER
export function initResetPassword() {
  ui.initDemoRibbon();

  const form = document.getElementById('reset-form');
  const emailInput = document.getElementById('reset-email');
  const codeInput = document.getElementById('reset-code');
  const newPasswordInput = document.getElementById('reset-new-password');
  const confirmPasswordInput = document.getElementById('reset-confirm-password');
  const toggleBtn = document.getElementById('reset-password-toggle');
  const submitBtn = document.getElementById('reset-submit-btn');
  const alertEl = document.getElementById('reset-alert');

  setupPasswordToggle(newPasswordInput, toggleBtn);
  setupPasswordStrength(newPasswordInput);

  // Auto-fill from URL params if coming directly from forgot-password demo
  const urlParams = new URLSearchParams(window.location.search);
  const emailParam = urlParams.get('email');
  const codeParam = urlParams.get('code');
  if (emailParam && emailInput) emailInput.value = emailParam;
  if (codeParam && codeInput) codeInput.value = codeParam;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.classList.remove('is-visible');

    const email = emailInput.value.trim();
    const code = codeInput.value.trim();
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!email || !code || code.length !== 6) {
      alertEl.textContent = 'Please enter your email and 6-digit reset code.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      return;
    }

    if (newPassword.length < 8) {
      alertEl.textContent = 'Password must be at least 8 characters long.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      return;
    }

    if (newPassword !== confirmPassword) {
      alertEl.textContent = 'Passwords do not match.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating password...';

    const res = await api.resetPassword({ email, code, newPassword });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Reset Password';

    if (!res.ok) {
      alertEl.textContent = res.error || 'Failed to reset password.';
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      return;
    }

    ui.showToast('Your password has been reset. Please sign in.', 'success');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 600);
  });
}
