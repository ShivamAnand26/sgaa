/**
 * SGA.IN Student Portal - Authentication Controller (student-auth.js)
 * Manages student login, registration with live password checklist,
 * forgot password with demo banner code, and password reset.
 */

import { api } from '../../client/js/api.js';
import { ui } from '../../client/js/ui.js';
import { authGuard } from '../../client/js/auth-guard.js';

// ==========================================
// 1. STUDENT LOGIN CONTROLLER
// ==========================================
export async function initStudentLogin() {
  await authGuard.redirectIfAuthenticated('student');

  const form = document.getElementById('student-login-form');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const rememberCheckbox = document.getElementById('remember-me');
  const submitBtn = document.getElementById('login-submit-btn');
  const alertEl = document.getElementById('login-alert');
  const togglePassBtn = document.getElementById('toggle-password-btn');

  // Parse return URL or reason in query params (strictly validate to prevent open redirects)
  const urlParams = new URLSearchParams(window.location.search);
  const rawNext = urlParams.get('next') || urlParams.get('redirect');
  const validatedNext = rawNext ? api.validateInternalReturnUrl(rawNext) : null;
  const waitingNoteTitle = urlParams.get('noteTitle') || urlParams.get('title') || '';
  const reason = urlParams.get('reason');
  const isReset = urlParams.get('reset');

  const waitingBanner = document.getElementById('waiting-note-banner');
  if (waitingBanner && (waitingNoteTitle || (validatedNext && validatedNext.includes('note-details')))) {
    waitingBanner.style.display = 'block';
    waitingBanner.innerHTML = '';
    const textNode = document.createTextNode('Sign in to continue buying ');
    waitingBanner.appendChild(textNode);
    const strong = document.createElement('strong');
    strong.textContent = waitingNoteTitle || 'this study note';
    waitingBanner.appendChild(strong);
  }

  // Preserve next URL on link to register page
  if (validatedNext) {
    const regLink = document.querySelector('a[href*="student-register.html"]');
    if (regLink) {
      regLink.href = `student-register.html?next=${encodeURIComponent(validatedNext)}&noteTitle=${encodeURIComponent(waitingNoteTitle)}`;
    }
  }

  if (reason && alertEl) {
    alertEl.textContent = reason;
    alertEl.className = 'auth-alert auth-alert--error is-visible';
  } else if (isReset === 'success' && alertEl) {
    alertEl.textContent = 'Your password has been reset successfully. Please sign in with your new credentials.';
    alertEl.className = 'auth-alert auth-alert--success is-visible';
  }

  // Password visibility toggle
  if (togglePassBtn && passwordInput) {
    togglePassBtn.addEventListener('click', () => {
      const isPass = passwordInput.type === 'password';
      passwordInput.type = isPass ? 'text' : 'password';
      togglePassBtn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
      togglePassBtn.innerHTML = isPass
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput?.value.trim() || '';
      const password = passwordInput?.value || '';
      const rememberMe = !!rememberCheckbox?.checked;

      if (!email || !password) {
        if (alertEl) {
          alertEl.textContent = 'Please enter both email and password.';
          alertEl.className = 'auth-alert auth-alert--error is-visible';
        }
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
      if (alertEl) alertEl.className = 'auth-alert';

      const res = await api.login({ email, password, rememberMe, portal: 'student' });

      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In to Student Portal';

      if (!res.ok) {
        if (alertEl) {
          alertEl.textContent = res.error || 'Invalid email or password.';
          alertEl.className = 'auth-alert auth-alert--error is-visible';
        }
        return;
      }

      // Successful login
      ui.showToast('Welcome back to SGA.IN Notes!', 'success');
      setTimeout(() => {
        if (validatedNext) {
          window.location.href = validatedNext;
        } else {
          window.location.href = 'student-dashboard.html';
        }
      }, 300);
    });
  }
}

// ==========================================
// 2. STUDENT REGISTRATION CONTROLLER
// ==========================================
export async function initStudentRegister() {
  await authGuard.redirectIfAuthenticated('student');

  const form = document.getElementById('student-register-form');
  const nameInput = document.getElementById('reg-name');
  const emailInput = document.getElementById('reg-email');
  const phoneInput = document.getElementById('reg-phone');
  const collegeInput = document.getElementById('reg-college');
  const courseInput = document.getElementById('reg-course');
  const yearInput = document.getElementById('reg-year');
  const passwordInput = document.getElementById('reg-password');
  const confirmPasswordInput = document.getElementById('reg-confirm-password');
  const termsCheckbox = document.getElementById('reg-terms');
  const submitBtn = document.getElementById('register-submit-btn');
  const alertEl = document.getElementById('register-alert');

  // Parse return URL or note info
  const urlParams = new URLSearchParams(window.location.search);
  const rawNext = urlParams.get('next') || urlParams.get('redirect');
  const validatedNext = rawNext ? api.validateInternalReturnUrl(rawNext) : null;
  const waitingNoteTitle = urlParams.get('noteTitle') || urlParams.get('title') || '';

  const waitingBanner = document.getElementById('waiting-note-banner');
  if (waitingBanner && (waitingNoteTitle || (validatedNext && validatedNext.includes('note-details')))) {
    waitingBanner.style.display = 'block';
    waitingBanner.innerHTML = '';
    const textNode = document.createTextNode('Register to continue buying ');
    waitingBanner.appendChild(textNode);
    const strong = document.createElement('strong');
    strong.textContent = waitingNoteTitle || 'this study note';
    waitingBanner.appendChild(strong);
  }

  // Preserve next URL on link to login page
  if (validatedNext) {
    const loginLink = document.querySelector('a[href*="student-login.html"]');
    if (loginLink) {
      loginLink.href = `student-login.html?next=${encodeURIComponent(validatedNext)}&noteTitle=${encodeURIComponent(waitingNoteTitle)}`;
    }
  }

  // Password rules checklist
  const ruleLen = document.getElementById('rule-len');
  const ruleUpper = document.getElementById('rule-upper');
  const ruleLower = document.getElementById('rule-lower');
  const ruleNum = document.getElementById('rule-num');

  function updatePasswordRules(val) {
    const isLen = val.length >= 8;
    const isUpper = /[A-Z]/.test(val);
    const isLower = /[a-z]/.test(val);
    const isNum = /[0-9]/.test(val);

    const updateItem = (el, valid) => {
      if (!el) return;
      el.className = `rule-item ${valid ? 'is-valid' : ''}`;
      const icon = el.querySelector('.rule-icon');
      if (icon) icon.innerHTML = valid ? '&#10003;' : '&bull;';
    };

    updateItem(ruleLen, isLen);
    updateItem(ruleUpper, isUpper);
    updateItem(ruleLower, isLower);
    updateItem(ruleNum, isNum);

    return isLen && isUpper && isLower && isNum;
  }

  if (passwordInput) {
    passwordInput.addEventListener('input', () => {
      updatePasswordRules(passwordInput.value);
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const fullName = nameInput?.value.trim() || '';
      const email = emailInput?.value.trim() || '';
      const phone = phoneInput?.value.trim() || '';
      const college = collegeInput?.value.trim() || '';
      const course = courseInput?.value.trim() || '';
      const year = yearInput?.value.trim() || '';
      const password = passwordInput?.value || '';
      const confirmPassword = confirmPasswordInput?.value || '';
      const termsAccepted = !!termsCheckbox?.checked;

      if (!fullName || fullName.length < 2) {
        showError('Please enter your full name.');
        nameInput?.focus();
        return;
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('Please enter a valid email address.');
        emailInput?.focus();
        return;
      }

      if (!updatePasswordRules(password)) {
        showError('Please ensure your password satisfies all security requirements.');
        passwordInput?.focus();
        return;
      }

      if (password !== confirmPassword) {
        showError('Passwords do not match. Please re-check.');
        confirmPasswordInput?.focus();
        return;
      }

      if (!termsAccepted) {
        showError('You must agree to the SGA.IN Terms & Conditions to register.');
        termsCheckbox?.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Student Account...';
      if (alertEl) alertEl.className = 'auth-alert';

      const res = await api.registerStudent({
        fullName,
        email,
        phone,
        college,
        course,
        year,
        password
      });

      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Student Account';

      if (!res.ok) {
        showError(res.error || 'Failed to create account.');
        return;
      }

      ui.showToast('Student account created! Welcome to SGA.IN Notes.', 'success');
      setTimeout(() => {
        if (validatedNext) {
          window.location.href = validatedNext;
        } else {
          window.location.href = 'student-dashboard.html';
        }
      }, 400);
    });
  }

  function showError(msg) {
    if (alertEl) {
      alertEl.textContent = msg;
      alertEl.className = 'auth-alert auth-alert--error is-visible';
      alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

// ==========================================
// 3. STUDENT FORGOT PASSWORD CONTROLLER
// ==========================================
export function initStudentForgotPassword() {
  const form = document.getElementById('student-forgot-form');
  const emailInput = document.getElementById('forgot-email');
  const submitBtn = document.getElementById('forgot-submit-btn');
  const alertEl = document.getElementById('forgot-alert');
  const demoBanner = document.getElementById('demo-code-banner');
  const demoCodeDisplay = document.getElementById('demo-code-display');
  const proceedBtn = document.getElementById('demo-proceed-btn');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput?.value.trim() || '';

      if (!email) {
        if (alertEl) {
          alertEl.textContent = 'Please enter your registered student email address.';
          alertEl.className = 'auth-alert auth-alert--error is-visible';
        }
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Generating Reset Code...';
      if (alertEl) alertEl.className = 'auth-alert';

      const res = await api.forgotPassword({ email });

      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Reset Code';

      if (!res.ok) {
        if (alertEl) {
          alertEl.textContent = res.error || 'No registered student account was found with that email.';
          alertEl.className = 'auth-alert auth-alert--error is-visible';
        }
        return;
      }

      // Show honest demo code banner
      if (demoBanner && demoCodeDisplay) {
        demoCodeDisplay.textContent = res.data.code;
        demoBanner.style.display = 'block';
        if (proceedBtn) {
          proceedBtn.href = `student-reset-password.html?email=${encodeURIComponent(email)}&code=${encodeURIComponent(res.data.code)}`;
        }
      }
    });
  }
}

// ==========================================
// 4. STUDENT RESET PASSWORD CONTROLLER
// ==========================================
export function initStudentResetPassword() {
  const form = document.getElementById('student-reset-form');
  const emailInput = document.getElementById('reset-email');
  const codeInput = document.getElementById('reset-code');
  const passwordInput = document.getElementById('reset-password');
  const confirmPasswordInput = document.getElementById('reset-confirm-password');
  const submitBtn = document.getElementById('reset-submit-btn');
  const alertEl = document.getElementById('reset-alert');

  // Pre-fill from query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const emailParam = urlParams.get('email');
  const codeParam = urlParams.get('code');

  if (emailInput && emailParam) emailInput.value = emailParam;
  if (codeInput && codeParam) codeInput.value = codeParam;

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput?.value.trim() || '';
      const code = codeInput?.value.trim() || '';
      const newPassword = passwordInput?.value || '';
      const confirmPassword = confirmPasswordInput?.value || '';

      if (!email || !code || !newPassword) {
        showError('Please fill in all required fields.');
        return;
      }

      if (newPassword.length < 8) {
        showError('Password must be at least 8 characters long.');
        return;
      }

      if (newPassword !== confirmPassword) {
        showError('Passwords do not match. Please re-check.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Updating Password...';
      if (alertEl) alertEl.className = 'auth-alert';

      const res = await api.resetPassword({ email, code, newPassword });

      submitBtn.disabled = false;
      submitBtn.textContent = 'Reset Password & Sign In';

      if (!res.ok) {
        showError(res.error || 'Failed to reset password. Please check your reset code.');
        return;
      }

      ui.showToast('Password reset successfully! Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = 'student-login.html?reset=success';
      }, 500);
    });
  }

  function showError(msg) {
    if (alertEl) {
      alertEl.textContent = msg;
      alertEl.className = 'auth-alert auth-alert--error is-visible';
    }
  }
}
