/**
 * SGA Admin Panel - Shared Shell Component (admin-shell.js)
 * Mounts standard architectural navigation, topbar, user profile, and session guard.
 */

import { adminApi } from '../../client/js/admin-api.js';

export async function initAdminShell(activePage = 'overview', pageTitle = 'Dashboard') {
  // Show official SGA animated loader
  let loader = document.getElementById('sga-admin-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'sga-admin-loader';
    loader.className = 'sga-loader-overlay sga-loader-active';
    loader.innerHTML = `
      <div class="sga-loader-content">
        <div class="sga-loader-halo"></div>
        <div class="sga-loader-logo-wrap" style="height:auto; padding:10px 16px;">
          <img src="/assets/logo-full.png" alt="Shilp Griha Associate" class="sga-loader-logo" style="max-height:50px;">
        </div>
        <div class="sga-loader-caption">Shilp Griha Associate · Studio Admin</div>
        <div class="sga-loader-bar"><div class="sga-loader-bar-progress"></div></div>
      </div>
    `;
    document.body.appendChild(loader);
  }

  // 1. Session verification
  const auth = await adminApi.requireAdmin();
  if (!auth.ok) {
    if (loader) loader.remove();
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `admin-login.html?redirect=${returnUrl}&reason=${encodeURIComponent(auth.error || 'Please sign in')}`;
    return null;
  }

  const user = auth.data.user;

  // 2. Navigation items definition
  const navSections = [
    {
      title: 'Studio Management',
      items: [
        { id: 'overview', label: 'Overview', href: 'admin-overview.html', icon: 'layout-dashboard' },
        { id: 'requests', label: 'Design Requests', href: 'admin-requests.html', icon: 'compass', badgeId: 'badge-requests' },
        { id: 'proposals', label: 'Proposals & Milestones', href: 'admin-proposals.html', icon: 'file-text' },
        { id: 'clients', label: 'Client CRM', href: 'admin-clients.html', icon: 'users' },
        { id: 'messages', label: 'Contact Inbox', href: 'admin-messages.html', icon: 'inbox', badgeId: 'badge-messages' }
      ]
    },
    {
      title: 'Study Notes & Sales',
      items: [
        { id: 'notes', label: 'Study Notes Catalog', href: 'admin-notes.html', icon: 'book-open' },
        { id: 'students', label: 'Students CRM', href: 'admin-students.html', icon: 'graduation-cap' },
        { id: 'purchases', label: 'Orders & Purchases', href: 'admin-purchases.html', icon: 'shopping-bag' },
        { id: 'payments', label: 'Payments & Refunds', href: 'admin-payments.html', icon: 'credit-card' },
        { id: 'coupons', label: 'Coupons & Discounts', href: 'admin-coupons.html', icon: 'tag' }
      ]
    },
    {
      title: 'Content & System',
      items: [
        { id: 'announcements', label: 'Announcements', href: 'admin-announcements.html', icon: 'megaphone' },
        { id: 'testimonials', label: 'Testimonials', href: 'admin-testimonials.html', icon: 'quote' },
        { id: 'portfolio', label: 'Portfolio / Work', href: 'admin-portfolio.html', icon: 'image' },
        { id: 'content', label: 'Website CMS & About', href: 'admin-content.html', icon: 'edit-3' },
        { id: 'reports', label: 'Analytics Reports', href: 'admin-reports.html', icon: 'bar-chart-2' },
        { id: 'activity', label: 'Audit Activity Log', href: 'admin-activity.html', icon: 'clock' },
        { id: 'settings', label: 'Studio Settings', href: 'admin-settings.html', icon: 'settings' }
      ]
    }
  ];

  // 3. Render Sidebar
  const sidebarHtml = `
    <aside class="admin-sidebar" id="admin-sidebar">
      <div class="admin-sidebar-header" style="padding:16px 18px; border-bottom:1px solid rgba(255,255,255,0.08);">
        <a href="admin-overview.html" class="admin-brand-logo" style="text-decoration:none; display:flex; flex-direction:column; gap:5px; flex:1;">
          <div style="background:#FAF8F5; padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; max-width:180px; box-shadow:0 2px 8px rgba(0,0,0,0.2); border:1px solid rgba(217,183,126,0.35);">
            <img src="/assets/logo-full.png" alt="Shilp Griha Associate" style="height:34px; width:auto; max-width:160px; object-fit:contain; display:block;">
          </div>
          <span style="display:block; font-size:9.5px; color:#D9B77E; letter-spacing:0.14em; text-transform:uppercase; font-weight:600; padding-left:2px;">Studio Admin Console</span>
        </a>
        <button id="close-sidebar-btn" class="mobile-menu-btn" style="color:#FAF8F5;" aria-label="Close navigation">
          <i data-lucide="x"></i>
        </button>
      </div>

      <nav class="admin-nav">
        ${navSections.map(sec => `
          <div class="admin-nav-section-title">${sec.title}</div>
          ${sec.items.map(item => `
            <a href="${item.href}" class="admin-nav-item ${activePage === item.id ? 'active' : ''}">
              <i data-lucide="${item.icon}"></i>
              <span>${item.label}</span>
              ${item.badgeId ? `<span id="${item.badgeId}" class="admin-nav-badge" style="display:none;">0</span>` : ''}
            </a>
          `).join('')}
        `).join('')}
      </nav>

      <div class="admin-sidebar-footer">
        <div class="admin-user-pill">
          <div class="admin-avatar">${user.name ? user.name[0] : 'V'}</div>
          <div class="admin-user-info">
            <div class="admin-user-name">${user.name || 'Vikas Verma'}</div>
            <div class="admin-user-role">${user.isSuperAdmin ? 'Super Admin' : 'Admin'} · @${user.username || 'vikasverma_gola'}</div>
          </div>
        </div>
        <button id="admin-logout-btn" title="Sign Out" style="background:none; border:none; color:#A39D95; cursor:pointer; padding:6px; display:flex;">
          <i data-lucide="log-out" style="width:16px; height:16px;"></i>
        </button>
      </div>
    </aside>
  `;

  // 4. Render Topbar
  const topbarHtml = `
    <header class="admin-topbar">
      <div style="display:flex; align-items:center; gap:16px;">
        <button id="open-sidebar-btn" class="mobile-menu-btn" aria-label="Open navigation menu">
          <i data-lucide="menu"></i>
        </button>
        <div class="admin-breadcrumbs">
          <a href="admin-overview.html">Studio</a>
          <span>/</span>
          <span>${pageTitle}</span>
        </div>
      </div>

      <div class="admin-topbar-actions">
        <span class="admin-demo-tag">
          <i data-lucide="activity" style="width:12px; height:12px;"></i>
          Zero-Setup Mock Backend Active
        </span>
        <a href="../../index.html" target="_blank" class="admin-btn" style="padding:6px 14px; font-size:11.5px; width:auto; background:var(--admin-sand); color:var(--admin-ink); border-color:var(--admin-border); box-shadow:none;">
          <i data-lucide="external-link" style="width:13px; height:13px;"></i>
          <span>View Site</span>
        </a>
      </div>
    </header>
  `;

  // Mount elements
  const sidebarContainer = document.getElementById('shell-sidebar');
  if (sidebarContainer) sidebarContainer.innerHTML = sidebarHtml;

  const topbarContainer = document.getElementById('shell-topbar');
  if (topbarContainer) topbarContainer.innerHTML = topbarHtml;

  // Icons render
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Event handlers
  const sidebar = document.getElementById('admin-sidebar');
  const openBtn = document.getElementById('open-sidebar-btn');
  const closeBtn = document.getElementById('close-sidebar-btn');
  const logoutBtn = document.getElementById('admin-logout-btn');

  if (openBtn && sidebar) {
    openBtn.addEventListener('click', () => sidebar.classList.add('is-open'));
  }
  if (closeBtn && sidebar) {
    closeBtn.addEventListener('click', () => sidebar.classList.remove('is-open'));
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to sign out of the Studio Admin Console?')) {
        await adminApi.adminLogout();
        window.location.href = 'admin-login.html';
      }
    });
  }

  // Badges update
  try {
    const metrics = await adminApi.getOverviewMetrics();
    if (metrics.ok) {
      const att = metrics.data.attention;
      const reqBadge = document.getElementById('badge-requests');
      if (reqBadge && att.unreviewedRequests > 0) {
        reqBadge.textContent = att.unreviewedRequests;
        reqBadge.style.display = 'inline-block';
      }
      const msgBadge = document.getElementById('badge-messages');
      if (msgBadge && att.unreadMessages > 0) {
        msgBadge.textContent = att.unreadMessages;
        msgBadge.style.display = 'inline-block';
      }
    }
  } catch (e) {
    // silent badge fail
  }

  // Dismiss loader with smooth fadeout
  if (loader) {
    setTimeout(() => {
      loader.classList.remove('sga-loader-active');
      loader.classList.add('sga-loader-hidden');
      setTimeout(() => loader.remove(), 400);
    }, 280);
  }

  return user;
}
