/**
 * SGA.IN Client Portal - UI Components and Utilities (ui.js)
 * Safe DOM rendering (textContent only for user strings to prevent XSS),
 * toast alerts, confirm dialogs, demo mode banner, and sidebar drawer logic.
 */

import { CONFIG } from './config.js';
import { api } from './api.js';

export const ui = {
  /**
   * Animated Logo Preloader
   */
  showPageLoader(caption = 'Loading SGA...') {
    let loader = document.getElementById('sga-global-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'sga-global-loader';
      loader.className = 'sga-loader-overlay';
      loader.innerHTML = `
        <div class="sga-loader-content">
          <div class="sga-loader-halo"></div>
          <div class="sga-loader-logo-wrap">
            <img src="${CONFIG.LOGO_URL}" alt="SGA Logo" class="sga-loader-logo">
          </div>
          <div class="sga-loader-caption">${caption}</div>
          <div class="sga-loader-bar"><div class="sga-loader-bar-progress"></div></div>
        </div>
      `;
      document.body.appendChild(loader);
    } else {
      const captionEl = loader.querySelector('.sga-loader-caption');
      if (captionEl) captionEl.textContent = caption;
      loader.classList.remove('sga-loader-hidden');
    }
    requestAnimationFrame(() => loader.classList.add('sga-loader-active'));
  },

  hidePageLoader() {
    const loader = document.getElementById('sga-global-loader');
    if (!loader) return;
    loader.classList.remove('sga-loader-active');
    loader.classList.add('sga-loader-hidden');
    setTimeout(() => {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 450);
  },

  /**
   * Escape and sanitize helper
   */
  setText(element, text) {
    if (!element) return;
    element.textContent = text ?? '';
  },

  /**
   * Safe element creation with textContent
   */
  createElement(tag, className = '', textContent = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
  },

  /**
   * Show a toast message
   */
  showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('sga-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'sga-toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    toast.appendChild(textSpan);
    container.appendChild(toast);

    // Entrance animation
    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * Accessible confirm modal
   */
  showConfirm({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', isDanger = false }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop is-open';
      backdrop.setAttribute('role', 'presentation');

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      const titleEl = document.createElement('h3');
      titleEl.style.marginBottom = '12px';
      titleEl.textContent = title;

      const descEl = document.createElement('p');
      descEl.style.marginBottom = '24px';
      descEl.textContent = message;

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.justifyContent = 'flex-end';
      actions.style.gap = '12px';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary btn-sm';
      cancelBtn.textContent = cancelText;

      const confirmBtn = document.createElement('button');
      confirmBtn.className = `btn btn-sm ${isDanger ? 'btn-danger' : 'btn-primary'}`;
      confirmBtn.textContent = confirmText;

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);

      modal.appendChild(titleEl);
      modal.appendChild(descEl);
      modal.appendChild(actions);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      const cleanup = (result) => {
        backdrop.classList.remove('is-open');
        setTimeout(() => backdrop.remove(), 250);
        resolve(result);
      };

      cancelBtn.addEventListener('click', () => cleanup(false));
      confirmBtn.addEventListener('click', () => cleanup(true));
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) cleanup(false);
      });
      document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', escHandler);
          cleanup(false);
        }
      });

      confirmBtn.focus();
    });
  },

  /**
   * Initializes the honest demo ribbon if CONFIG.DEMO_MODE is true
   */
  initDemoRibbon() {
    if (!CONFIG.DEMO_MODE) return;
    if (sessionStorage.getItem('sga_demo_ribbon_dismissed') === 'true') return;
    if (document.getElementById('demo-ribbon')) return;

    const ribbon = document.createElement('aside');
    ribbon.className = 'demo-ribbon';
    ribbon.id = 'demo-ribbon';
    ribbon.setAttribute('aria-label', 'Demo Environment Notice');

    const text = document.createElement('span');
    text.className = 'demo-ribbon-text';
    text.innerHTML = '<strong>Demo Mode:</strong> Data is stored in this browser only (localStorage & IndexedDB). No external servers are contacted.';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'demo-ribbon-close';
    closeBtn.setAttribute('aria-label', 'Dismiss notice');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => {
      ribbon.remove();
      sessionStorage.setItem('sga_demo_ribbon_dismissed', 'true');
    });

    ribbon.appendChild(text);
    ribbon.appendChild(closeBtn);

    const portalMain = document.querySelector('.portal-main');
    const authPanelRight = document.querySelector('.auth-panel-right');
    const devContainer = document.querySelector('.dev-container');

    if (portalMain) {
      portalMain.insertBefore(ribbon, portalMain.firstChild);
    } else if (authPanelRight) {
      authPanelRight.insertBefore(ribbon, authPanelRight.firstChild);
    } else if (devContainer) {
      devContainer.insertBefore(ribbon, devContainer.firstChild);
    } else {
      document.body.insertBefore(ribbon, document.body.firstChild);
    }
  },

  /**
   * Sets user initials or avatar image in avatar container
   */
  async renderAvatar(container, user) {
    if (!container || !user) return;
    container.innerHTML = '';

    if (user.avatarId) {
      const fileRes = await api.getFile(user.avatarId);
      if (fileRes.ok && fileRes.data.url) {
        const img = document.createElement('img');
        img.src = fileRes.data.url;
        img.alt = `${user.fullName}'s avatar`;
        container.appendChild(img);
        return;
      }
    }

    // Initials fallback
    const initial = (user.fullName || 'Client').trim().charAt(0).toUpperCase();
    container.textContent = initial;
  },

  /**
   * Updates unread notification badge across header and sidebar
   */
  async updateNotificationBadge() {
    const res = await api.listNotifications();
    if (!res.ok) return;

    const unread = res.data.unreadCount;
    const headerBadge = document.getElementById('header-notif-badge');
    const navBadge = document.getElementById('nav-notif-badge');

    if (headerBadge) {
      if (unread > 0) {
        headerBadge.textContent = unread > 99 ? '99+' : String(unread);
        headerBadge.style.display = 'grid';
      } else {
        headerBadge.style.display = 'none';
      }
    }

    if (navBadge) {
      if (unread > 0) {
        navBadge.textContent = unread > 99 ? '99+' : String(unread);
        navBadge.style.display = 'inline-block';
      } else {
        navBadge.style.display = 'none';
      }
    }
  },

  /**
   * Updates cart item badge in header and bottom navigation
   */
  async updateCartBadge() {
    const badges = document.querySelectorAll('#header-cart-badge, #cart-count-badge, #bottom-cart-badge');
    if (!badges.length) return;
    try {
      const res = await api.getCart();
      if (res.ok && res.data) {
        const count = res.data.items ? res.data.items.length : 0;
        badges.forEach(badge => {
          if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = badge.classList.contains('bottom-nav-badge') ? 'flex' : 'grid';
          } else {
            badge.style.display = 'none';
          }
        });
      }
    } catch {
      badges.forEach(b => { b.style.display = 'none'; });
    }
  },

  /**
   * Format currency in Indian Rupees (₹)
   */
  formatRupees(amount) {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  },

  /**
   * Setup mobile sidebar drawer open/close with backdrop
   */
  initMobileDrawer() {
    const toggleBtns = document.querySelectorAll('#mobile-nav-toggle, #mobile-menu-btn, .mobile-nav-toggle, .mobile-menu-btn');
    const sidebar = document.getElementById('portal-sidebar');
    const closeBtn = document.getElementById('sidebar-close');

    let backdrop = document.getElementById('portal-sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'portal-sidebar-backdrop';
      backdrop.className = 'sidebar-backdrop';
      document.body.appendChild(backdrop);
    }

    const openDrawer = (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      sidebar?.classList.add('is-open');
      backdrop.classList.add('is-visible');
      document.body.classList.add('menu-open');
    };

    const closeDrawer = () => {
      sidebar?.classList.remove('is-open');
      backdrop.classList.remove('is-visible');
      document.body.classList.remove('menu-open');
    };

    toggleBtns.forEach(btn => {
      btn.addEventListener('click', openDrawer);
    });
    closeBtn?.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);

    // Auto-close drawer on navigation item click on smaller viewports
    sidebar?.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 1024) closeDrawer();
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar?.classList.contains('is-open')) {
        closeDrawer();
      }
    });
  },

  /**
   * Format dates nicely (e.g., 03 Nov 2026, 04:30 PM)
   */
  formatDate(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  },

  formatDateTime(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  },

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
};
