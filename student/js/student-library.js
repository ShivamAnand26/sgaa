/**
 * SGA.IN Student Portal - Student Library & Records Controller (student-library.js)
 * Manages My Purchases, Payment History, Wishlist, and Student Notifications.
 */

import { api } from '../../client/js/api.js';
import { ui } from '../../client/js/ui.js';
import { authGuard } from '../../client/js/auth-guard.js';

// ========================================================
// 1. MY PURCHASES CONTROLLER
// ========================================================
export async function initMyPurchases() {
  const user = await authGuard.protect('student');
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();
  ui.updateCartBadge();

  // Populate header/sidebar user info
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  const headerAvatarEl = document.getElementById('header-avatar');
  const sidebarAvatarEl = document.getElementById('sidebar-avatar');
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);
  ui.renderAvatar(headerAvatarEl, user);
  ui.renderAvatar(sidebarAvatarEl, user);

  const container = document.getElementById('purchases-container');
  const searchInput = document.getElementById('purchases-search');
  const sortSelect = document.getElementById('purchases-sort');
  const totalCountEl = document.getElementById('purchases-count');
  const emptyState = document.getElementById('purchases-empty');

  let currentSearch = '';
  let currentSort = 'newest';

  async function loadPurchases() {
    if (container) {
      container.innerHTML = '<div class="skeleton" style="height:260px; grid-column:1/-1;"></div>';
    }

    const res = await api.listMyPurchases({
      search: currentSearch,
      sort: currentSort
    });

    if (!res.ok) {
      ui.showToast('Failed to load purchases.', 'error');
      return;
    }

    const items = res.data.items || [];
    if (totalCountEl) totalCountEl.textContent = `${items.length} purchased document${items.length === 1 ? '' : 's'}`;

    if (items.length === 0) {
      if (container) container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (!container) return;

    container.innerHTML = '';
    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'note-card';

      const progress = item.progressPercent || 0;
      const lastPage = item.lastPage || 1;
      const totalPages = item.pages || 0;

      card.innerHTML = `
        <div class="note-cover" style="position:relative; background:linear-gradient(135deg, #1C1917 0%, #2A2522 100%);">
          <div class="note-cover-pattern"></div>
          <span class="note-subject-pill" style="position:absolute; top:12px; left:12px;">${item.subject || 'Architecture'}</span>
          <div style="position:absolute; bottom:14px; left:16px; right:16px;">
            <span style="font-size:10.5px; color:rgba(255,255,255,0.7); text-transform:uppercase; letter-spacing:0.08em; display:block;">Verified Access</span>
            <h4 style="font-family:var(--font-serif); font-size:18px; color:#FAF8F5; margin:3px 0 0; line-height:1.2; text-shadow:0 1px 2px rgba(0,0,0,0.4);">
              ${ui.createElement('span', '', item.title).outerHTML}
            </h4>
          </div>
        </div>

        <div class="note-card-body">
          <div style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:4px; color:var(--muted);">
              <span>Reading Progress</span>
              <strong style="color:var(--ink);">${progress}% (p. ${lastPage}/${totalPages})</strong>
            </div>
            <div class="reading-progress-track">
              <div class="reading-progress-fill" style="width:${progress}%;"></div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; font-size:11.5px; color:var(--muted); margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--sand);">
            <span>Purchased: ${ui.formatDate(item.purchasedAt)}</span>
            <span>Downloads: <strong style="color:var(--ink);">${item.downloadCount || 0}</strong></span>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <a href="note-viewer.html?id=${encodeURIComponent(item.id)}" class="btn btn-primary btn-sm" style="height:36px; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>Read</span>
            </a>
            <button type="button" class="btn btn-secondary btn-sm download-note-btn" data-id="${item.id}" style="height:36px; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download</span>
            </button>
          </div>
        </div>
      `;

      card.querySelector('.download-note-btn')?.addEventListener('click', async () => {
        const fileRes = await api.getPurchasedNoteFile(item.id);
        if (!fileRes.ok) {
          ui.showToast(fileRes.error || 'Failed to download PDF.', 'error');
          return;
        }
        const blobUrl = URL.createObjectURL(fileRes.data.blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileRes.data.filename || `${item.title}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        ui.showToast('Download started.', 'success');
        loadPurchases(); // refresh download count
      });

      container.appendChild(card);
    });
  }

  searchInput?.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    loadPurchases();
  });

  sortSelect?.addEventListener('change', (e) => {
    currentSort = e.target.value;
    loadPurchases();
  });

  loadPurchases();
}

// ========================================================
// 2. PAYMENT HISTORY CONTROLLER
// ========================================================
export async function initPaymentHistory() {
  const user = await authGuard.protect('student');
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();
  ui.updateCartBadge();

  // Populate user display
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  const headerAvatarEl = document.getElementById('header-avatar');
  const sidebarAvatarEl = document.getElementById('sidebar-avatar');
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);
  ui.renderAvatar(headerAvatarEl, user);
  ui.renderAvatar(sidebarAvatarEl, user);

  const tableBody = document.getElementById('payments-tbody');
  const statusFilter = document.getElementById('payment-status-filter');
  const searchInput = document.getElementById('payment-search');
  const emptyState = document.getElementById('payments-empty');
  const summarySpent = document.getElementById('summary-total-spent');
  const summaryCount = document.getElementById('summary-total-count');

  let currentStatus = 'all';
  let currentSearch = '';

  async function loadPayments() {
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--muted);">Loading transaction records...</td></tr>';
    }

    const res = await api.listPayments({
      status: currentStatus,
      search: currentSearch
    });

    if (!res.ok) {
      ui.showToast('Failed to load payments.', 'error');
      return;
    }

    const items = res.data.items || [];
    const successful = items.filter(p => p.status === 'success');
    const totalSpent = successful.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    if (summarySpent) summarySpent.textContent = ui.formatRupees(totalSpent);
    if (summaryCount) summaryCount.textContent = String(successful.length);

    if (items.length === 0) {
      if (tableBody) tableBody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (!tableBody) return;

    tableBody.innerHTML = '';
    items.forEach(p => {
      const tr = document.createElement('tr');

      const itemsDesc = (p.items || []).map(i => i.title).join(', ') || 'Architecture Study Notes';
      const statusBadge = p.status === 'success' 
        ? '<span class="status-badge" style="background:#E8F3ED; color:#2F6B4F; border:1px solid rgba(47,107,79,0.25);">Success</span>'
        : p.status === 'failed'
        ? '<span class="status-badge" style="background:#FDE8E8; color:#9B1C1C; border:1px solid rgba(155,28,28,0.25);">Failed</span>'
        : '<span class="status-badge" style="background:#F3F4F6; color:#6B7280; border:1px solid rgba(107,114,128,0.25);">Cancelled</span>';

      tr.innerHTML = `
        <td style="font-family:monospace; font-size:12px; font-weight:600; color:var(--ink);">
          ${p.id}
          <div style="font-size:10.5px; color:var(--muted); font-family:var(--font-sans); margin-top:2px;">Order: ${p.orderId}</div>
        </td>
        <td style="font-size:12.5px; color:var(--ink); max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${ui.createElement('span', '', itemsDesc).outerHTML}
        </td>
        <td style="font-size:12.5px; color:var(--muted);">${ui.formatDate(p.createdAt)}</td>
        <td style="font-size:13px; font-weight:700; color:var(--ink);">${ui.formatRupees(p.amount)}</td>
        <td>${statusBadge}</td>
        <td style="text-align:right;">
          ${p.status === 'success' ? `
            <button type="button" class="btn btn-secondary btn-sm download-receipt-btn" data-id="${p.id}" style="height:32px; font-size:11px; padding:0 12px;">
              Receipt PDF
            </button>
          ` : '<span style="color:var(--muted); font-size:11.5px;">—</span>'}
        </td>
      `;

      tr.querySelector('.download-receipt-btn')?.addEventListener('click', async () => {
        downloadPdfReceipt(p, user);
      });

      tableBody.appendChild(tr);
    });
  }

  function downloadPdfReceipt(payment, student) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      ui.showToast('Receipt generator initializing...', 'info');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    // Architectural header styling
    doc.setFillColor(28, 25, 23);
    doc.rect(0, 0, 210, 42, 'F');

    doc.setTextColor(250, 248, 245);
    doc.setFont('times', 'bold');
    doc.setFontSize(22);
    doc.text('SGA.IN', 18, 20);

    doc.setFont('times', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(196, 122, 59);
    doc.text('Architectural Planning, Design & Study Notes', 18, 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text('TEST RECEIPT / DEMO MODE', 145, 20);
    doc.text('By NXT Services', 145, 26);

    // Body
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Payment Receipt & Tax Invoice', 18, 55);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(`Receipt ID: ${payment.id}`, 18, 64);
    doc.text(`Order ID: ${payment.orderId}`, 18, 70);
    doc.text(`Date & Time: ${ui.formatDate(payment.createdAt)}`, 18, 76);
    doc.text(`Payment Provider: Demo Simulated Gateway`, 18, 82);

    doc.setDrawColor(220, 210, 200);
    doc.line(18, 88, 192, 88);

    // Billed to
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text('Billed To (Student):', 18, 97);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(70, 70, 70);
    doc.text(`Name: ${student.fullName || 'Student'}`, 18, 104);
    doc.text(`Email: ${student.email || ''}`, 18, 110);
    if (student.college) doc.text(`Institution: ${student.college}`, 18, 116);

    // Items table header
    doc.setFillColor(245, 240, 235);
    doc.rect(18, 124, 174, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text('Item Description', 22, 130);
    doc.text('Subject', 120, 130);
    doc.text('Amount (INR)', 165, 130);

    let y = 142;
    (payment.items || []).forEach((item, idx) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      doc.text(`${idx + 1}. ${item.title}`, 22, y);
      doc.text(item.subject || 'Architecture', 120, y);
      doc.text(`INR ${item.price || 0}`, 165, y);
      y += 8;
    });

    doc.line(18, y + 2, 192, y + 2);

    // Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(196, 122, 59);
    doc.text(`Total Paid: INR ${payment.amount}`, 140, y + 12);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text('Note: This is an automated test receipt generated in browser client mode.', 18, 275);
    doc.text('SGA.IN Architectural Portal — Educational Content Platform', 18, 280);

    doc.save(`SGA_Receipt_${payment.id}.pdf`);
    ui.showToast('Receipt PDF generated and downloaded.', 'success');
  }

  statusFilter?.addEventListener('change', (e) => {
    currentStatus = e.target.value;
    loadPayments();
  });

  searchInput?.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    loadPayments();
  });

  loadPayments();
}

// ========================================================
// 3. WISHLIST CONTROLLER
// ========================================================
export async function initWishlist() {
  const user = await authGuard.protect('student');
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();
  ui.updateCartBadge();

  // Populate user display
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  const headerAvatarEl = document.getElementById('header-avatar');
  const sidebarAvatarEl = document.getElementById('sidebar-avatar');
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);
  ui.renderAvatar(headerAvatarEl, user);
  ui.renderAvatar(sidebarAvatarEl, user);

  const container = document.getElementById('wishlist-container');
  const emptyState = document.getElementById('wishlist-empty');
  const countEl = document.getElementById('wishlist-count');

  async function loadWishlist() {
    if (container) {
      container.innerHTML = '<div class="skeleton" style="height:280px; grid-column:1/-1;"></div>';
    }

    const res = await api.listWishlist();
    if (!res.ok) {
      ui.showToast('Failed to load wishlist.', 'error');
      return;
    }

    const items = res.data.items || [];
    if (countEl) countEl.textContent = `${items.length} saved note${items.length === 1 ? '' : 's'}`;

    if (items.length === 0) {
      if (container) container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (!container) return;

    container.innerHTML = '';
    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'note-card';

      card.innerHTML = `
        <div class="note-cover">
          <div class="note-cover-pattern"></div>
          <span class="note-subject-pill">${item.subject || 'Architecture'}</span>
          <div class="note-cover-info">
            <span class="note-pages-count">${item.pages || 0} Pages · PDF</span>
            <span class="note-rating-stars">★ ${item.rating || '4.8'}</span>
          </div>
        </div>

        <div class="note-card-body">
          <h3 class="note-card-title">
            <a href="note-details.html?id=${encodeURIComponent(item.id)}">${ui.createElement('span', '', item.title).outerHTML}</a>
          </h3>
          <p class="note-card-desc">${ui.createElement('span', '', item.description || 'Architectural examination notes.').outerHTML}</p>

          <div class="note-card-footer">
            <div class="note-price-tag">${ui.formatRupees(item.price)}</div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn btn-primary btn-sm move-to-cart-btn" data-id="${item.id}" style="height:34px; font-size:11px; padding:0 12px;">
                Move to Cart
              </button>
              <button type="button" class="btn btn-secondary btn-sm remove-wishlist-btn" data-id="${item.id}" title="Remove from wishlist" style="height:34px; width:34px; padding:0; display:grid; place-items:center;">
                &times;
              </button>
            </div>
          </div>
        </div>
      `;

      card.querySelector('.move-to-cart-btn')?.addEventListener('click', async () => {
        const addRes = await api.addToCart(item.id);
        if (addRes.ok) {
          await api.toggleWishlist(item.id); // remove from wishlist
          ui.updateCartBadge();
          ui.showToast(`"${item.title}" moved to cart!`, 'success');
          loadWishlist();
        } else {
          ui.showToast(addRes.error || 'Failed to move to cart.', 'error');
        }
      });

      card.querySelector('.remove-wishlist-btn')?.addEventListener('click', async () => {
        await api.toggleWishlist(item.id);
        ui.showToast('Item removed from wishlist.', 'info');
        loadWishlist();
      });

      container.appendChild(card);
    });
  }

  loadWishlist();
}

// ========================================================
// 4. STUDENT NOTIFICATIONS CONTROLLER
// ========================================================
export async function initStudentNotifications() {
  const user = await authGuard.protect('student');
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();
  ui.updateCartBadge();

  // Populate user display
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  const headerAvatarEl = document.getElementById('header-avatar');
  const sidebarAvatarEl = document.getElementById('sidebar-avatar');
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);
  ui.renderAvatar(headerAvatarEl, user);
  ui.renderAvatar(sidebarAvatarEl, user);

  const container = document.getElementById('notifications-list');
  const emptyState = document.getElementById('notifications-empty');
  const markAllBtn = document.getElementById('mark-all-read-btn');
  const unreadCountBadge = document.getElementById('notif-unread-count');

  async function loadNotifications() {
    if (container) {
      container.innerHTML = '<div class="skeleton" style="height:80px; margin-bottom:12px;"></div><div class="skeleton" style="height:80px;"></div>';
    }

    const res = await api.listNotifications();
    if (!res.ok) {
      ui.showToast('Failed to load notifications.', 'error');
      return;
    }

    const { items, unreadCount } = res.data;
    if (unreadCountBadge) {
      unreadCountBadge.textContent = unreadCount > 0 ? `${unreadCount} new` : 'All caught up';
      unreadCountBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }

    if (items.length === 0) {
      if (container) container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (!container) return;

    container.innerHTML = '';
    items.forEach(n => {
      const card = document.createElement('div');
      card.className = `notification-card ${n.read ? 'is-read' : 'is-unread'}`;
      card.style.background = '#FFFFFF';
      card.style.border = n.read ? '1px solid var(--sand)' : '1px solid var(--copper)';
      card.style.borderRadius = '12px';
      card.style.padding = '16px 20px';
      card.style.marginBottom = '12px';
      card.style.display = 'flex';
      card.style.alignItems = 'flex-start';
      card.style.justifyContent = 'space-between';
      card.style.gap = '16px';

      card.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:14px; flex:1;">
          <div style="width:36px; height:36px; border-radius:50%; background:${n.read ? 'var(--sand-light)' : 'rgba(196,122,59,0.12)'}; display:grid; place-items:center; color:${n.read ? 'var(--muted)' : 'var(--copper)'}; flex-shrink:0; margin-top:2px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
          </div>
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <h4 style="font-size:14px; font-weight:700; color:var(--ink); margin:0;">
                ${ui.createElement('span', '', n.title).outerHTML}
              </h4>
              ${!n.read ? '<span style="width:7px; height:7px; border-radius:50%; background:var(--copper); display:inline-block;"></span>' : ''}
            </div>
            <p style="font-size:12.5px; color:var(--muted); margin:4px 0 6px; line-height:1.5;">
              ${ui.createElement('span', '', n.body).outerHTML}
            </p>
            <span style="font-size:11px; color:var(--muted);">${ui.formatDate(n.createdAt)}</span>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
          ${!n.read ? `
            <button type="button" class="btn btn-secondary btn-sm mark-single-read-btn" data-id="${n.id}" style="height:30px; font-size:11px; padding:0 10px;">
              Mark Read
            </button>
          ` : ''}
          <button type="button" class="file-remove-btn delete-notif-btn" data-id="${n.id}" title="Delete notification">&times;</button>
        </div>
      `;

      card.querySelector('.mark-single-read-btn')?.addEventListener('click', async () => {
        await api.markRead(n.id);
        ui.updateNotificationBadge();
        loadNotifications();
      });

      card.querySelector('.delete-notif-btn')?.addEventListener('click', async () => {
        await api.deleteNotification(n.id);
        ui.updateNotificationBadge();
        loadNotifications();
      });

      container.appendChild(card);
    });
  }

  markAllBtn?.addEventListener('click', async () => {
    await api.markAllRead();
    ui.updateNotificationBadge();
    ui.showToast('All notifications marked as read.', 'success');
    loadNotifications();
  });

  loadNotifications();
}
