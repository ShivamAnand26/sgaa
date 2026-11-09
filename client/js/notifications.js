/**
 * SGA.IN Client Portal - Notifications Controller (notifications.js)
 * Manages client notifications, unread badges, mark all read, and request links.
 */

import { api } from './api.js';
import { ui } from './ui.js';
import { authGuard } from './auth-guard.js';

export async function initNotifications() {
  const user = await authGuard.protect();
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();

  // Header and sidebar user info
  const headerAvatar = document.getElementById('header-avatar');
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);
  ui.renderAvatar(headerAvatar, user);
  ui.renderAvatar(sidebarAvatar, user);

  const container = document.getElementById('notifications-container');
  const markAllBtn = document.getElementById('mark-all-read-btn');

  async function loadNotifications() {
    ui.updateNotificationBadge();
    const res = await api.listNotifications();
    if (!res.ok) {
      ui.showToast('Failed to load notifications.', 'error');
      return;
    }

    const { items } = res.data;
    renderList(items);
  }

  function renderList(items) {
    if (!container) return;
    container.innerHTML = '';

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <div class="empty-state-title">No Notifications</div>
          <p class="empty-state-desc">You are all caught up. Any project updates or status changes will be announced here.</p>
        </div>
      `;
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'card';
    wrapper.style.padding = '0';

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = `notif-item ${item.read ? '' : 'is-unread'}`;

      const contentWrap = document.createElement('div');
      contentWrap.className = 'notif-content-wrap';

      const iconCircle = document.createElement('div');
      iconCircle.className = 'notif-icon-circle';
      iconCircle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;

      const textWrap = document.createElement('div');
      textWrap.className = 'notif-text-wrap';

      const title = document.createElement('div');
      title.className = 'notif-title';
      title.textContent = item.title;

      const body = document.createElement('div');
      body.className = 'notif-body';
      body.textContent = item.body;

      const time = document.createElement('div');
      time.className = 'notif-time';
      time.textContent = ui.formatDateTime(item.createdAt);

      textWrap.appendChild(title);
      textWrap.appendChild(body);
      textWrap.appendChild(time);

      if (item.requestId) {
        const reqLink = document.createElement('a');
        reqLink.href = `request-details.html?id=${encodeURIComponent(item.requestId)}`;
        reqLink.className = 'text-link';
        reqLink.style.marginTop = '6px';
        reqLink.innerHTML = `View Request ${item.requestId} &rarr;`;
        textWrap.appendChild(reqLink);
      }

      contentWrap.appendChild(iconCircle);
      contentWrap.appendChild(textWrap);

      const actions = document.createElement('div');
      actions.className = 'notif-actions';

      if (!item.read) {
        const readBtn = document.createElement('button');
        readBtn.type = 'button';
        readBtn.className = 'btn btn-secondary btn-sm';
        readBtn.style.height = '32px';
        readBtn.style.padding = '0 10px';
        readBtn.style.fontSize = '11px';
        readBtn.textContent = 'Mark Read';
        readBtn.addEventListener('click', async () => {
          await api.markRead(item.id);
          item.read = true;
          row.classList.remove('is-unread');
          readBtn.remove();
          ui.updateNotificationBadge();
        });
        actions.appendChild(readBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'file-remove-btn';
      delBtn.setAttribute('aria-label', 'Delete notification');
      delBtn.innerHTML = `&times;`;
      delBtn.addEventListener('click', async () => {
        await api.deleteNotification(item.id);
        row.remove();
        ui.updateNotificationBadge();
      });
      actions.appendChild(delBtn);

      row.appendChild(contentWrap);
      row.appendChild(actions);
      wrapper.appendChild(row);
    });

    container.appendChild(wrapper);
  }

  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      await api.markAllRead();
      ui.showToast('All notifications marked as read.', 'success');
      loadNotifications();
    });
  }

  loadNotifications();
}
