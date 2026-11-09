/**
 * SGA.IN Student Portal - Notes Catalog & Details Controller (notes.js)
 * Manages Browse Notes filtering, search, sorting, and pagination,
 * as well as the Note Details page with Table of Contents, preview and reviews.
 */

import { api } from '../../client/js/api.js';
import { ui } from '../../client/js/ui.js';
import { authGuard } from '../../client/js/auth-guard.js';
import { renderNoteCard } from './student-dashboard.js';
import { payments } from './payments.js';

// ==========================================
// 1. BROWSE NOTES CONTROLLER
// ==========================================
export async function initBrowseNotes() {
  const user = await authGuard.protect('student');
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();
  ui.updateCartBadge();

  // Populate user header/sidebar
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  const headerAvatarEl = document.getElementById('header-avatar');
  const sidebarAvatarEl = document.getElementById('sidebar-avatar');

  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);
  ui.renderAvatar(headerAvatarEl, user);
  ui.renderAvatar(sidebarAvatarEl, user);

  // Form controls
  const searchInput = document.getElementById('notes-search-input');
  const subjectSelect = document.getElementById('filter-subject');
  const categorySelect = document.getElementById('filter-category');
  const sortSelect = document.getElementById('sort-notes');
  const maxPriceInput = document.getElementById('filter-max-price');
  const priceValDisplay = document.getElementById('price-val-display');
  const applyFiltersBtn = document.getElementById('apply-filters-btn');
  const resetFiltersBtn = document.getElementById('reset-filters-btn');
  const container = document.getElementById('notes-catalog-container');
  const resultsCountEl = document.getElementById('results-count');
  const paginationEl = document.getElementById('notes-pagination');
  const prevBtn = document.getElementById('page-prev-btn');
  const nextBtn = document.getElementById('page-next-btn');
  const pageInfo = document.getElementById('page-info');

  // Parse URL search params
  const urlParams = new URLSearchParams(window.location.search);
  let currentSearch = urlParams.get('search') || '';
  let currentSubject = urlParams.get('subject') || 'all';
  let currentCategory = urlParams.get('category') || 'all';
  let currentSort = urlParams.get('sort') || 'newest';
  let currentMaxPrice = parseInt(urlParams.get('maxPrice') || '5000', 10);
  let currentPage = parseInt(urlParams.get('page') || '1', 10);

  // Set inputs to initial params
  if (searchInput) searchInput.value = currentSearch;
  if (subjectSelect) subjectSelect.value = currentSubject;
  if (categorySelect) categorySelect.value = currentCategory;
  if (sortSelect) sortSelect.value = currentSort;
  if (maxPriceInput) {
    maxPriceInput.value = currentMaxPrice;
    maxPriceInput.addEventListener('input', () => {
      if (priceValDisplay) priceValDisplay.textContent = ui.formatRupees(maxPriceInput.value);
    });
  }

  // Subject chips row
  const chipRow = document.getElementById('subjects-chip-row');
  let loadedSubjects = [];

  async function loadSubjectChips() {
    const subRes = await api.listSubjects();
    if (!subRes.ok) return;
    loadedSubjects = subRes.data || [];

    const activeSubjects = loadedSubjects.filter(s => (s.noteCount || 0) > 0);
    const totalCount = loadedSubjects.reduce((sum, s) => sum + (s.noteCount || 0), 0);
    const allCountEl = document.getElementById('all-subjects-count');
    if (allCountEl) allCountEl.textContent = `(${totalCount})`;

    if (subjectSelect) {
      subjectSelect.innerHTML = '<option value="all">All Subjects</option>';
      activeSubjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.slug || s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        opt.textContent = `${s.name} (${s.noteCount || 0})`;
        if (currentSubject === opt.value || currentSubject.toLowerCase() === s.name.toLowerCase()) {
          opt.selected = true;
        }
        subjectSelect.appendChild(opt);
      });
    }

    if (chipRow) {
      chipRow.innerHTML = '';

      const allChip = document.createElement('button');
      allChip.type = 'button';
      allChip.className = `subject-chip ${currentSubject === 'all' ? 'is-active' : ''}`;
      allChip.dataset.subject = 'all';
      allChip.setAttribute('role', 'tab');
      allChip.setAttribute('aria-selected', String(currentSubject === 'all'));

      const allSpan = document.createElement('span');
      allSpan.textContent = 'All Subjects';
      allChip.appendChild(allSpan);

      const allBadge = document.createElement('span');
      allBadge.className = 'subject-chip-count';
      allBadge.textContent = `(${totalCount})`;
      allChip.appendChild(allBadge);

      allChip.addEventListener('click', () => {
        currentSubject = 'all';
        updateActiveChip();
        if (subjectSelect) subjectSelect.value = 'all';
        applyFilters();
      });
      chipRow.appendChild(allChip);

      activeSubjects.forEach(s => {
        const slug = s.slug || s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const chip = document.createElement('button');
        chip.type = 'button';
        const isMatch = currentSubject === slug || currentSubject.toLowerCase() === s.name.toLowerCase();
        chip.className = `subject-chip ${isMatch ? 'is-active' : ''}`;
        chip.dataset.subject = slug;
        chip.setAttribute('role', 'tab');
        chip.setAttribute('aria-selected', String(isMatch));

        const nameSpan = document.createElement('span');
        nameSpan.textContent = s.name; // Always rendered with textContent
        chip.appendChild(nameSpan);

        const countSpan = document.createElement('span');
        countSpan.className = 'subject-chip-count';
        countSpan.textContent = `(${s.noteCount || 0})`;
        chip.appendChild(countSpan);

        chip.addEventListener('click', () => {
          currentSubject = slug;
          updateActiveChip();
          if (subjectSelect) subjectSelect.value = slug;
          applyFilters();
        });
        chipRow.appendChild(chip);
      });
    }
  }

  function updateActiveChip() {
    if (!chipRow) return;
    chipRow.querySelectorAll('.subject-chip').forEach(btn => {
      const match = btn.dataset.subject === currentSubject || (currentSubject === 'all' && btn.dataset.subject === 'all');
      btn.classList.toggle('is-active', match);
      btn.setAttribute('aria-selected', String(match));
    });
  }

  await loadSubjectChips();

  async function loadNotes() {
    if (container) {
      container.innerHTML = '<div class="skeleton" style="height:320px; grid-column:1/-1;"></div>';
    }

    const res = await api.listNotes({
      search: currentSearch,
      subject: currentSubject,
      category: currentCategory,
      minPrice: 0,
      maxPrice: currentMaxPrice,
      sort: currentSort,
      page: currentPage,
      limit: 9
    });

    if (!res.ok) {
      ui.showToast('Failed to load notes.', 'error');
      return;
    }

    const { items, total, totalPages, page } = res.data;

    if (resultsCountEl) {
      resultsCountEl.textContent = `${total} study note${total === 1 ? '' : 's'} available`;
    }

    if (!container) return;
    container.innerHTML = '';

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding:50px 20px;">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <div class="empty-state-title">No Study Notes Found</div>
          <p class="empty-state-desc">Try clearing your search terms or expanding your subject and price filters.</p>
          <button type="button" id="clear-filters-action" class="btn btn-secondary btn-sm">Reset All Filters</button>
        </div>
      `;
      container.querySelector('#clear-filters-action')?.addEventListener('click', resetFilters);
      if (paginationEl) paginationEl.style.display = 'none';
      return;
    }

    items.forEach(note => {
      const card = renderNoteCard(note);
      container.appendChild(card);
    });

    // Pagination
    if (paginationEl) {
      if (totalPages > 1) {
        paginationEl.style.display = 'flex';
        if (pageInfo) pageInfo.textContent = `Page ${page} of ${totalPages}`;
        if (prevBtn) prevBtn.disabled = page <= 1;
        if (nextBtn) nextBtn.disabled = page >= totalPages;
      } else {
        paginationEl.style.display = 'none';
      }
    }
  }

  function applyFilters() {
    currentSearch = searchInput?.value.trim() || '';
    currentSubject = subjectSelect?.value || 'all';
    currentCategory = categorySelect?.value || 'all';
    currentSort = sortSelect?.value || 'newest';
    currentMaxPrice = parseInt(maxPriceInput?.value || '5000', 10);
    currentPage = 1;

    // Update URL history state without reloading
    const params = new URLSearchParams();
    if (currentSearch) params.set('search', currentSearch);
    if (currentSubject !== 'all') params.set('subject', currentSubject);
    if (currentCategory !== 'all') params.set('category', currentCategory);
    if (currentSort !== 'newest') params.set('sort', currentSort);
    if (currentMaxPrice !== 5000) params.set('maxPrice', String(currentMaxPrice));
    params.set('page', String(currentPage));

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({}, '', newUrl);

    loadNotes();
  }

  function resetFilters() {
    if (searchInput) searchInput.value = '';
    currentSubject = 'all';
    if (subjectSelect) subjectSelect.value = 'all';
    updateActiveChip();
    if (categorySelect) categorySelect.value = 'all';
    if (sortSelect) sortSelect.value = 'newest';
    if (maxPriceInput) {
      maxPriceInput.value = '5000';
      if (priceValDisplay) priceValDisplay.textContent = ui.formatRupees(5000);
    }
    window.history.pushState({}, '', window.location.pathname);
    applyFilters();
  }

  applyFiltersBtn?.addEventListener('click', applyFilters);
  resetFiltersBtn?.addEventListener('click', resetFilters);
  sortSelect?.addEventListener('change', applyFilters);
  subjectSelect?.addEventListener('change', applyFilters);
  categorySelect?.addEventListener('change', applyFilters);

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyFilters();
    }
  });

  prevBtn?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadNotes();
      window.scrollTo({ top: 120, behavior: 'smooth' });
    }
  });

  nextBtn?.addEventListener('click', () => {
    currentPage++;
    loadNotes();
    window.scrollTo({ top: 120, behavior: 'smooth' });
  });

  loadNotes();
}

// ==========================================
// 2. NOTE DETAILS CONTROLLER
// ==========================================
export async function initNoteDetails() {
  const user = await authGuard.protect('student');
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();
  ui.updateCartBadge();

  // Populate header/sidebar avatar
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  const headerAvatarEl = document.getElementById('header-avatar');
  const sidebarAvatarEl = document.getElementById('sidebar-avatar');
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);
  ui.renderAvatar(headerAvatarEl, user);
  ui.renderAvatar(sidebarAvatarEl, user);

  const urlParams = new URLSearchParams(window.location.search);
  const noteId = urlParams.get('id');

  if (!noteId) {
    ui.showToast('No note selected.', 'error');
    window.location.href = 'browse-notes.html';
    return;
  }

  const res = await api.getNote(noteId);
  if (!res.ok) {
    ui.showToast('Note not found.', 'error');
    window.location.href = 'browse-notes.html';
    return;
  }

  const note = res.data;

  // Title, subject, metadata
  const titleEl = document.getElementById('details-title');
  const subjectEl = document.getElementById('details-subject');
  const authorEl = document.getElementById('details-author');
  const pagesEl = document.getElementById('details-pages');
  const priceHeroEl = document.getElementById('details-price');
  const descEl = document.getElementById('details-description');
  const ratingEl = document.getElementById('details-rating');
  const reviewCountEl = document.getElementById('details-review-count');
  const updatedEl = document.getElementById('details-updated');

  if (titleEl) titleEl.textContent = note.title;
  if (subjectEl) subjectEl.textContent = note.subject;
  if (authorEl) authorEl.textContent = note.author || 'SGA Faculty';
  if (pagesEl) pagesEl.textContent = `${note.pages || 0} pages`;
  if (priceHeroEl) priceHeroEl.textContent = ui.formatRupees(note.price);
  if (descEl) descEl.textContent = note.description || 'No description provided.';
  if (ratingEl) ratingEl.textContent = `★ ${note.rating || '4.8'}`;
  if (reviewCountEl) reviewCountEl.textContent = `(${note.reviewCount || 12} reviews)`;
  if (updatedEl) updatedEl.textContent = ui.formatDate(note.updatedAt || note.createdAt);

  // Table of Contents
  const tocList = document.getElementById('details-toc-list');
  if (tocList && note.tableOfContents) {
    tocList.innerHTML = '';
    note.tableOfContents.forEach(item => {
      const li = document.createElement('li');
      li.style.padding = '8px 0';
      li.style.borderBottom = '1px dashed var(--sand)';
      li.style.fontSize = '13.5px';
      li.style.color = 'var(--ink)';
      li.textContent = item;
      tocList.appendChild(li);
    });
  }

  // Included Items
  const incList = document.getElementById('details-included-list');
  if (incList && note.includedItems) {
    incList.innerHTML = '';
    note.includedItems.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>${ui.createElement('span', '', item).outerHTML}</span>
      `;
      incList.appendChild(li);
    });
  }

  // Action Buttons Box (Buy Now / Add to Cart / Preview / Read)
  const actionContainer = document.getElementById('details-action-container');
  if (actionContainer) {
    actionContainer.innerHTML = '';

    if (note.isPurchased) {
      actionContainer.innerHTML = `
        <div style="background:#E8F3ED; border:1px solid rgba(47,107,79,0.3); border-radius:10px; padding:14px; margin-bottom:16px;">
          <div style="display:flex; align-items:center; gap:8px; color:#2F6B4F; font-weight:700; font-size:13px; margin-bottom:4px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>You own this study note</span>
          </div>
          <p style="font-size:11.5px; color:var(--muted); margin:0;">Purchased on ${ui.formatDate(note.purchaseRecord?.purchasedAt)}.</p>
        </div>
        <a href="note-viewer.html?id=${encodeURIComponent(note.id)}" class="btn btn-primary" style="width:100%; height:46px; margin-bottom:10px;">
          Open in PDF Reader &rarr;
        </a>
      `;
    } else {
      actionContainer.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
          <button type="button" id="buy-now-btn" class="btn btn-primary" style="width:100%; height:46px;">
            Buy Now (${ui.formatRupees(note.price)})
          </button>
          <button type="button" id="add-to-cart-btn" class="btn btn-secondary" style="width:100%;">
            + Add to Cart
          </button>
          <a href="note-viewer.html?id=${encodeURIComponent(note.id)}&preview=true" class="btn btn-outline" style="width:100%;">
            Preview First 3 Pages
          </a>
        </div>
      `;

      actionContainer.querySelector('#buy-now-btn')?.addEventListener('click', async () => {
        const orderRes = await api.createOrder(note.id);
        if (!orderRes.ok) {
          ui.showToast(orderRes.error || 'Failed to create order', 'error');
          return;
        }
        const payRes = await payments.startCheckout(orderRes.data);
        const completeRes = await api.completePayment(orderRes.data.id, payRes);

        if (completeRes.ok && completeRes.data.unlocked) {
          ui.showToast(`Purchased "${note.title}" successfully!`, 'success');
          setTimeout(() => {
            window.location.href = `note-viewer.html?id=${encodeURIComponent(note.id)}`;
          }, 600);
        } else if (payRes.status === 'failed') {
          ui.showToast('Payment failed. Note remains locked.', 'error');
        }
      });

      actionContainer.querySelector('#add-to-cart-btn')?.addEventListener('click', async () => {
        const res = await api.addToCart(note.id);
        if (res.ok) {
          ui.showToast(`"${note.title}" added to cart!`, 'success');
          ui.updateCartBadge();
        } else {
          ui.showToast(res.error || 'Failed to add to cart.', 'error');
        }
      });
    }
  }

  // Reviews List and Review Submission Form
  const reviewsList = document.getElementById('details-reviews-list');
  const reviewFormBox = document.getElementById('review-form-container');

  if (reviewsList) {
    reviewsList.innerHTML = '';
    const reviews = note.reviews || [];

    if (reviews.length === 0) {
      reviewsList.innerHTML = '<p style="color:var(--muted); font-size:13px;">No student reviews submitted yet.</p>';
    } else {
      reviews.forEach(r => {
        const revCard = document.createElement('div');
        revCard.style.padding = '14px 0';
        revCard.style.borderBottom = '1px solid var(--sand)';
        revCard.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="font-size:13.5px; color:var(--ink);">${ui.createElement('span', '', r.userName || 'Student').outerHTML}</strong>
            <span style="color:var(--copper); font-size:12px;">${'★'.repeat(r.rating || 5)}${'☆'.repeat(5 - (r.rating || 5))}</span>
          </div>
          <p style="font-size:13px; color:var(--muted); line-height:1.5; margin:0;">${ui.createElement('span', '', r.text || 'Insightful and practical exam notes.').outerHTML}</p>
          <span style="font-size:11px; color:var(--muted); display:block; margin-top:4px;">${ui.formatDate(r.updatedAt)}</span>
        `;
        reviewsList.appendChild(revCard);
      });
    }
  }

  // Review Form (only for purchasers)
  if (reviewFormBox) {
    if (!note.isPurchased) {
      reviewFormBox.innerHTML = `
        <div style="background:var(--sand-light); border:1px solid var(--sand); border-radius:10px; padding:14px; font-size:12.5px; color:var(--muted); text-align:center;">
          Only verified purchasers who have studied this note can submit a student review.
        </div>
      `;
    } else {
      reviewFormBox.innerHTML = `
        <form id="submit-review-form">
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Your Rating (1 to 5 Stars)</label>
            <select id="review-rating-select" class="form-select" style="height:42px;">
              <option value="5">★★★★★ (5 Stars - Exceptional)</option>
              <option value="4">★★★★☆ (4 Stars - Highly Practical)</option>
              <option value="3">★★★☆☆ (3 Stars - Good)</option>
              <option value="2">★★☆☆☆ (2 Stars - Fair)</option>
              <option value="1">★☆☆☆☆ (1 Star - Needs Improvement)</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label class="form-label">Review Comments</label>
            <textarea id="review-text-input" class="form-textarea" placeholder="Share your experience with these notes for exams or studio drafting..." rows="3"></textarea>
          </div>
          <button type="submit" class="btn btn-secondary btn-sm">Submit Review</button>
        </form>
      `;

      reviewFormBox.querySelector('#submit-review-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rating = document.getElementById('review-rating-select')?.value || 5;
        const text = document.getElementById('review-text-input')?.value || '';
        const res = await api.addReview(note.id, rating, text);
        if (res.ok) {
          ui.showToast('Your review was submitted successfully!', 'success');
          setTimeout(() => window.location.reload(), 600);
        } else {
          ui.showToast(res.error || 'Failed to submit review.', 'error');
        }
      });
    }
  }

  // Related Notes Row
  const relatedGrid = document.getElementById('related-notes-grid');
  if (relatedGrid && note.related) {
    relatedGrid.innerHTML = '';
    note.related.forEach(r => {
      relatedGrid.appendChild(renderNoteCard(r));
    });
  }
}
