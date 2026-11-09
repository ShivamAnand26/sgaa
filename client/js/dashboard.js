/**
 * SGA.IN Client Portal - Dashboard Controller (dashboard.js)
 * Loads dashboard statistics, recent requests, and real-time studio updates.
 */

import { api } from './api.js';
import { ui } from './ui.js';
import { authGuard } from './auth-guard.js';

export async function initDashboard() {
  const user = await authGuard.protect();
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();

  // Populate user header & sidebar mini cards
  const userNameEl = document.getElementById('user-display-name');
  const userGreetingEl = document.getElementById('user-first-name');
  const userEmailEl = document.getElementById('user-display-email');
  const headerAvatarEl = document.getElementById('header-avatar');
  const sidebarAvatarEl = document.getElementById('sidebar-avatar');

  const firstName = (user.fullName || 'Client').split(' ')[0];
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userGreetingEl) ui.setText(userGreetingEl, firstName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);

  ui.renderAvatar(headerAvatarEl, user);
  ui.renderAvatar(sidebarAvatarEl, user);
  ui.updateNotificationBadge();

  // Setup logout handler
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const confirmed = await ui.showConfirm({
        title: 'Sign Out',
        message: 'Are you sure you wish to sign out of the SGA.IN client portal?',
        confirmText: 'Sign Out',
        cancelText: 'Stay'
      });
      if (confirmed) {
        await api.logout();
        window.location.href = 'login.html';
      }
    });
  }

  // Fetch Dashboard Stats & Feeds
  const res = await api.getDashboard();
  if (!res.ok) {
    ui.showToast('Unable to load dashboard data.', 'error');
    return;
  }

  const { stats, recentRequests, notifications } = res.data;

  // Render Stat Counters
  const totalEl = document.getElementById('stat-total');
  const pendingEl = document.getElementById('stat-pending');
  const inProgressEl = document.getElementById('stat-in-progress');
  const completedEl = document.getElementById('stat-completed');

  if (totalEl) ui.setText(totalEl, String(stats.total));
  if (pendingEl) ui.setText(pendingEl, String(stats.pending));
  if (inProgressEl) ui.setText(inProgressEl, String(stats.inProgress));
  if (completedEl) ui.setText(completedEl, String(stats.completed));

  // Render Recent Requests List
  const requestsContainer = document.getElementById('recent-requests-container');
  if (requestsContainer) {
    requestsContainer.innerHTML = '';

    if (!recentRequests || recentRequests.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </div>
        <div class="empty-state-title">No Design Requests Yet</div>
        <p class="empty-state-desc">You have not submitted any architectural planning or design requests.</p>
        <a href="new-request.html" class="btn btn-primary btn-sm">Submit First Request &rarr;</a>
      `;
      requestsContainer.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'request-mini-list';

      recentRequests.forEach(req => {
        const item = document.createElement('a');
        item.href = `request-details.html?id=${encodeURIComponent(req.id)}`;
        item.className = 'request-mini-card';

        const mainInfo = document.createElement('div');
        mainInfo.className = 'request-mini-main';

        const idSpan = document.createElement('span');
        idSpan.className = 'request-mini-id';
        idSpan.textContent = req.id;

        const titleSpan = document.createElement('span');
        titleSpan.className = 'request-mini-title';
        titleSpan.textContent = req.title;

        const metaSpan = document.createElement('span');
        metaSpan.className = 'request-mini-meta';
        metaSpan.textContent = `${req.projectType} · Submitted ${ui.formatDate(req.createdAt)}`;

        mainInfo.appendChild(idSpan);
        mainInfo.appendChild(titleSpan);
        mainInfo.appendChild(metaSpan);

        const rightInfo = document.createElement('div');
        rightInfo.className = 'request-mini-right';

        const badge = document.createElement('span');
        badge.className = `status-badge status-badge--${req.status}`;
        badge.textContent = req.status.replace('_', ' ');

        const arrow = document.createElement('span');
        arrow.style.color = 'var(--copper)';
        arrow.innerHTML = '&rarr;';

        rightInfo.appendChild(badge);
        rightInfo.appendChild(arrow);

        item.appendChild(mainInfo);
        item.appendChild(rightInfo);
        list.appendChild(item);
      });

      requestsContainer.appendChild(list);
    }
  }

  // Render Studio Updates Feed
  const feedContainer = document.getElementById('recent-feed-container');
  if (feedContainer) {
    feedContainer.innerHTML = '';

    if (!notifications || notifications.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.style.padding = '30px 16px';
      empty.innerHTML = `
        <div class="empty-state-icon" style="width:40px; height:40px; margin-bottom:10px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="empty-state-title" style="font-size:18px;">No Recent Updates</div>
        <p class="empty-state-desc" style="font-size:12px; margin-bottom:0;">All studio messages and timeline updates will appear here.</p>
      `;
      feedContainer.appendChild(empty);
    } else {
      const feedList = document.createElement('div');
      feedList.className = 'feed-list';

      notifications.slice(0, 4).forEach(notif => {
        const item = document.createElement('div');
        item.className = 'feed-item';

        const dot = document.createElement('div');
        dot.className = 'feed-dot';
        if (notif.read) dot.style.backgroundColor = 'var(--muted)';

        const content = document.createElement('div');
        content.className = 'feed-content';

        const text = document.createElement('div');
        text.className = 'feed-text';
        text.textContent = notif.title;

        const time = document.createElement('div');
        time.className = 'feed-time';
        time.textContent = ui.formatDateTime(notif.createdAt);

        content.appendChild(text);
        content.appendChild(time);
        item.appendChild(dot);
        item.appendChild(content);

        feedList.appendChild(item);
      });

      feedContainer.appendChild(feedList);
    }
  }
}
