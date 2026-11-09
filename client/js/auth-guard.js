/**
 * SGA Client Portal - Auth Guard (auth-guard.js)
 * Enforces session validity on protected pages and handles cross-tab logouts.
 */

import { api } from './api.js';

export const authGuard = {
  /**
   * Run on protected portal pages. Redirects to login if unauthenticated or wrong role.
   * @param {string} requiredRole - 'client' | 'student' | 'admin'
   */
  async protect(requiredRole = 'client') {
    const token = localStorage.getItem('sga_auth_token') || sessionStorage.getItem('sga_auth_token');
    if (!token) {
      this.redirectToLogin(requiredRole);
      return null;
    }

    const res = await api.getMe();
    if (!res.ok || !res.data) {
      this.redirectToLogin(requiredRole);
      return null;
    }

    const user = res.data;

    // Enforce role separation
    if (requiredRole && user.role !== requiredRole) {
      let reason = 'Please sign in with the appropriate account.';
      if (requiredRole === 'admin') reason = 'Administrator credentials required.';
      else if (requiredRole === 'student') reason = 'This is a student account area. Please use Student Login.';
      else if (requiredRole === 'client') reason = 'This is a client account area. Please use Client Login.';
      this.redirectToLogin(requiredRole, reason);
      return null;
    }

    // Setup cross-tab logout synchronization
    window.addEventListener('storage', (e) => {
      if (e.key === 'sga_auth_token' && !e.newValue) {
        this.redirectToLogin(requiredRole, 'You have been logged out in another window.');
      }
    });

    return user;
  },

  /**
   * Run on guest pages (login, register) to redirect already logged in users to their respective dashboard
   */
  async redirectIfAuthenticated(role = null) {
    const token = localStorage.getItem('sga_auth_token') || sessionStorage.getItem('sga_auth_token');
    if (token) {
      const res = await api.getMe();
      if (res.ok && res.data) {
        const user = res.data;
        if (role && user.role !== role) {
          // If logged into the wrong role on this guest page, stay on guest page
          return;
        }
        if (user.role === 'admin') {
          window.location.href = window.location.pathname.includes('/admin/') ? 'admin-overview.html' : 'admin/admin-overview.html';
        } else if (user.role === 'student') {
          window.location.href = window.location.pathname.includes('/student/') ? 'student-dashboard.html' : 'student/student-dashboard.html';
        } else {
          window.location.href = window.location.pathname.includes('/client/') ? 'dashboard.html' : 'client/dashboard.html';
        }
      }
    }
  },

  redirectToLogin(requiredRole = 'client', reason = '') {
    localStorage.removeItem('sga_auth_token');
    sessionStorage.removeItem('sga_auth_token');
    const redirectUrl = encodeURIComponent(window.location.pathname + window.location.search);
    const reasonParam = reason ? `&reason=${encodeURIComponent(reason)}` : '';
    
    const isInsideAdmin = window.location.pathname.includes('/admin/');
    const isInsideStudent = window.location.pathname.includes('/student/');
    const isInsideClient = window.location.pathname.includes('/client/');
    
    let target = 'login.html';
    if (requiredRole === 'admin') {
      target = isInsideAdmin ? 'admin-login.html' : '/admin/admin-login.html';
    } else if (requiredRole === 'student') {
      target = isInsideStudent ? 'student-login.html' : '/student/student-login.html';
    } else {
      target = isInsideClient ? 'login.html' : '/client/login.html';
    }
    
    window.location.href = `${target}?redirect=${redirectUrl}${reasonParam}`;
  }
};
