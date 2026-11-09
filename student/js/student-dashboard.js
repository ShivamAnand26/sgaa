/**
 * SGA Student Portal - Dashboard Controller (student-dashboard.js)
 * Manages overview counters, continue reading progress, recent purchases,
 * subject quick filters, and faculty recommendations.
 */

import { api } from '../../client/js/api.js';
import { ui } from '../../client/js/ui.js';
import { authGuard } from '../../client/js/auth-guard.js';

export async function initStudentDashboard() {
  const user = await authGuard.protect('student');
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();
  ui.updateCartBadge();

  // Populate user header & sidebar mini cards
  const userNameEl = document.getElementById('user-display-name');
  const userGreetingEl = document.getElementById('user-first-name');
  const userEmailEl = document.getElementById('user-display-email');
  const headerAvatarEl = document.getElementById('header-avatar');
  const sidebarAvatarEl = document.getElementById('sidebar-avatar');

  const firstName = (user.fullName || 'Student').split(' ')[0];
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userGreetingEl) ui.setText(userGreetingEl, firstName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);

  ui.renderAvatar(headerAvatarEl, user);
  ui.renderAvatar(sidebarAvatarEl, user);

  // Sign out handler
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const confirmed = await ui.showConfirm({
        title: 'Sign Out',
        message: 'Are you sure you wish to sign out of the SGA Student Notes Portal?',
        confirmText: 'Sign Out'
      });
      if (confirmed) {
        await api.logout();
        window.location.href = 'student-login.html';
      }
    });
  }



  // Load Dashboard Data
  const res = await api.getStudentDashboard();
  if (!res.ok) {
    ui.showToast(res.error || 'Failed to load student dashboard.', 'error');
    return;
  }

  const {
    totalAvailableNotes,
    purchasedNotesCount,
    totalSpent,
    wishlistCount,
    continueReading,
    recentPurchases,
    recommendedNotes,
    subjects
  } = res.data;

  // Stat Counters
  animateCounter('stat-available-notes', totalAvailableNotes);
  animateCounter('stat-purchased-notes', purchasedNotesCount);
  const spentEl = document.getElementById('stat-total-spent');
  if (spentEl) spentEl.textContent = ui.formatRupees(totalSpent);
  animateCounter('stat-wishlist-count', wishlistCount);

  // Render Subject Chips Row
  const subjectsRow = document.getElementById('subjects-quick-row');
  if (subjectsRow && subjects) {
    subjectsRow.innerHTML = '';
    const allChip = document.createElement('a');
    allChip.href = 'browse-notes.html';
    allChip.className = 'subject-chip is-active';
    allChip.innerHTML = `All Subjects <span class="subject-chip-count">(${totalAvailableNotes})</span>`;
    subjectsRow.appendChild(allChip);

    Object.entries(subjects).forEach(([subj, count]) => {
      const chip = document.createElement('a');
      chip.href = `browse-notes.html?subject=${encodeURIComponent(subj)}`;
      chip.className = 'subject-chip';
      chip.innerHTML = `${subj} <span class="subject-chip-count">(${count})</span>`;
      subjectsRow.appendChild(chip);
    });
  }

  // Render "Continue Reading" Section
  const readingContainer = document.getElementById('continue-reading-container');
  if (readingContainer) {
    readingContainer.innerHTML = '';

    if (!continueReading || continueReading.length === 0) {
      readingContainer.innerHTML = `
        <div class="empty-state" style="padding:36px 20px;">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </div>
          <div class="empty-state-title" style="font-size:18px;">No Active Notes in Reading Queue</div>
          <p class="empty-state-desc" style="font-size:12.5px; margin-bottom:16px;">When you purchase and read architectural study notes, your last viewed pages will appear here for one-click access.</p>
          <a href="browse-notes.html" class="btn btn-primary btn-sm">Explore Study Notes &rarr;</a>
        </div>
      `;
    } else {
      const grid = document.createElement('div');
      grid.className = 'reading-grid';

      continueReading.forEach(item => {
        const card = document.createElement('div');
        card.className = 'reading-card';
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <span class="note-badge-tag" style="position:static; padding:2px 8px; font-size:10px;">${item.subject || 'Architecture'}</span>
            <span style="font-size:11px; color:var(--muted);">Page ${item.lastPage} of ${item.pages || '—'}</span>
          </div>
          <h4 style="font-family:var(--font-serif); font-size:18px; margin:0; line-height:1.25; color:var(--ink);">
            ${ui.createElement('span', '', item.title).outerHTML}
          </h4>
          <div class="progress-bar-wrap" aria-label="Reading progress">
            <div class="progress-bar-fill" style="width: ${item.progressPercent}%;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <span style="font-size:11px; color:var(--muted);">${item.progressPercent}% complete</span>
            <a href="note-viewer.html?id=${encodeURIComponent(item.id)}" class="btn btn-primary btn-sm" style="height:32px; padding:0 12px; font-size:11px;">
              Resume &rarr;
            </a>
          </div>
        `;
        grid.appendChild(card);
      });

      readingContainer.appendChild(grid);
    }
  }

  // Render "Recent Purchases" List
  const recentPurchasesContainer = document.getElementById('recent-purchases-container');
  if (recentPurchasesContainer) {
    recentPurchasesContainer.innerHTML = '';

    if (!recentPurchases || recentPurchases.length === 0) {
      recentPurchasesContainer.innerHTML = `
        <div style="text-align:center; padding:30px 16px; color:var(--muted); font-size:13px;">
          No purchased notes yet. Preview notes and add to cart to build your digital library.
        </div>
      `;
    } else {
      const list = document.createElement('div');
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '8px';

      recentPurchases.forEach(item => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.padding = '12px 16px';
        row.style.background = 'var(--sand-light)';
        row.style.borderRadius = '8px';
        row.style.border = '1px solid var(--sand)';
        row.style.gap = '12px';

        row.innerHTML = `
          <div style="display:flex; align-items:center; gap:12px; min-width:0;">
            <div style="width:36px; height:36px; border-radius:6px; background:var(--white); border:1px solid var(--sand); display:grid; place-items:center; color:var(--copper); flex-shrink:0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div style="min-width:0;">
              <strong style="display:block; font-size:13.5px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${ui.createElement('span', '', item.title).outerHTML}
              </strong>
              <span style="font-size:11px; color:var(--muted);">${item.subject} · ${ui.formatDate(item.purchasedAt)}</span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
            <span class="badge-owned" style="font-size:10px; padding:2px 7px;">Owned</span>
            <a href="note-viewer.html?id=${encodeURIComponent(item.id)}" class="btn btn-secondary btn-sm" style="height:32px; padding:0 12px; font-size:11.5px;">
              Open
            </a>
          </div>
        `;
        list.appendChild(row);
      });

      recentPurchasesContainer.appendChild(list);
    }
  }

  // Render "Recommended For You"
  const recContainer = document.getElementById('recommended-notes-container');
  if (recContainer && recommendedNotes) {
    recContainer.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'notes-grid';
    grid.style.marginBottom = '0';

    recommendedNotes.forEach(note => {
      const card = renderNoteCard(note);
      grid.appendChild(card);
    });

    recContainer.appendChild(grid);
  }
}

/**
 * Reusable Note Card Component Renderer
 */
export function renderNoteCard(note) {
  const card = document.createElement('article');
  card.className = 'note-card';

  const isPurchased = !!note.isPurchased;
  const isWishlisted = !!note.isWishlisted;

  card.innerHTML = `
    <!-- Card Cover -->
    <div class="note-card-cover">
      <div class="note-cover-drafting"></div>
      <div class="note-cover-mark">
        <img src="/assets/logo-full.png" alt="Shilp Griha Associate" style="width:20px; height:20px; object-fit:contain; border-radius:4px; background:#fff; padding:1px;">
        <span>SGA Notes</span>
      </div>
      <span class="note-badge-tag">${note.subject || 'Architecture'}</span>
      <button type="button" class="note-wishlist-btn ${isWishlisted ? 'is-active' : ''}" data-note-id="${note.id}" aria-label="Toggle wishlist">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${isWishlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
    </div>

    <!-- Card Body -->
    <div class="note-card-body">
      <div class="note-meta-line">
        <span>${note.pages || 0} pages</span>
        <span aria-hidden="true">&bull;</span>
        <span class="rating-stars">&#9733; ${note.rating || '4.8'}</span>
        <span class="rating-count">(${note.reviewCount || 12})</span>
      </div>

      <h3 class="note-card-title">
        <a href="note-details.html?id=${encodeURIComponent(note.id)}">${ui.createElement('span', '', note.title).outerHTML}</a>
      </h3>

      <p class="note-card-desc">${ui.createElement('span', '', note.description || 'Curated architectural notes and construction diagrams.').outerHTML}</p>

      <div class="note-card-footer">
        <div class="note-price-wrap">
          <span class="note-price-label">Price</span>
          <span class="note-price-amount">${ui.formatRupees(note.price)}</span>
        </div>

        <div class="note-card-actions">
          ${isPurchased ? `
            <span class="badge-owned">Owned</span>
            <a href="note-viewer.html?id=${encodeURIComponent(note.id)}" class="btn btn-primary btn-sm" style="height:36px; padding:0 14px;">
              Read
            </a>
          ` : `
            <a href="note-viewer.html?id=${encodeURIComponent(note.id)}&preview=true" class="btn btn-secondary btn-sm" style="height:36px; padding:0 12px; font-size:11.5px;">
              Preview
            </a>
            <button type="button" class="btn btn-primary btn-sm add-cart-btn" data-note-id="${note.id}" style="height:36px; padding:0 12px; font-size:11.5px;">
              + Cart
            </button>
          `}
        </div>
      </div>
    </div>
  `;

  // Attach Wishlist listener
  const wishBtn = card.querySelector('.note-wishlist-btn');
  wishBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    const res = await api.toggleWishlist(note.id);
    if (res.ok) {
      const active = res.data.isWishlisted;
      wishBtn.classList.toggle('is-active', active);
      const icon = wishBtn.querySelector('svg');
      if (icon) icon.setAttribute('fill', active ? 'currentColor' : 'none');
      ui.showToast(active ? 'Saved to wishlist!' : 'Removed from wishlist.', 'info');
    } else {
      ui.showToast(res.error || 'Please log in to manage your wishlist', 'error');
    }
  });

  // Attach Add to Cart listener
  const addCartBtn = card.querySelector('.add-cart-btn');
  addCartBtn?.addEventListener('click', async () => {
    addCartBtn.disabled = true;
    addCartBtn.textContent = 'Adding...';
    const res = await api.addToCart(note.id);
    addCartBtn.disabled = false;
    addCartBtn.textContent = '+ Cart';

    if (res.ok) {
      ui.showToast(`"${note.title}" added to cart!`, 'success');
      ui.updateCartBadge();
    } else {
      ui.showToast(res.error || 'Failed to add note to cart.', 'error');
    }
  });

  return card;
}

function animateCounter(id, targetValue) {
  const el = document.getElementById(id);
  if (!el) return;
  const target = Number(targetValue) || 0;
  if (target === 0) {
    el.textContent = '0';
    return;
  }
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 20));
  const timer = setInterval(() => {
    current += step;
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    el.textContent = current.toLocaleString('en-IN');
  }, 25);
}
