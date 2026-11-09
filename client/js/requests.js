/**
 * SGA.IN Client Portal - Requests Management Controller (requests.js)
 * Covers: New Request 4-step wizard, My Requests list & filter, and Request Details with timeline.
 */

import { api } from './api.js';
import { ui } from './ui.js';
import { authGuard } from './auth-guard.js';
import { CONFIG } from './config.js';

// ==========================================
// 1. SUBMIT NEW REQUEST CONTROLLER
// ==========================================
export async function initNewRequest() {
  const user = await authGuard.protect();
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();

  // Populate header/sidebar avatar
  const headerAvatar = document.getElementById('header-avatar');
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);
  ui.renderAvatar(headerAvatar, user);
  ui.renderAvatar(sidebarAvatar, user);

  let currentStep = 1;
  const totalSteps = 4;
  let uploadedFiles = [];
  let isSubmitting = false;
  let formDirty = false;

  // Step 1: Pre-fill personal info
  const nameInput = document.getElementById('req-client-name');
  const emailInput = document.getElementById('req-client-email');
  const phoneInput = document.getElementById('req-client-phone');
  if (nameInput) nameInput.value = user.fullName || '';
  if (emailInput) emailInput.value = user.email || '';
  if (phoneInput) phoneInput.value = user.phone || '';

  // Character counter for description
  const descInput = document.getElementById('req-desc');
  const charCounter = document.getElementById('desc-char-counter');
  if (descInput && charCounter) {
    descInput.addEventListener('input', () => {
      formDirty = true;
      charCounter.textContent = `${descInput.value.length} / 1000 characters`;
    });
  }

  // Restore draft from sessionStorage if present
  try {
    const savedDraft = sessionStorage.getItem('sga_request_draft');
    if (savedDraft) {
      const draft = JSON.parse(savedDraft);
      if (draft.title && document.getElementById('req-title')) document.getElementById('req-title').value = draft.title;
      if (draft.projectType && document.getElementById('req-type')) document.getElementById('req-type').value = draft.projectType;
      if (draft.siteLocation && document.getElementById('req-location')) document.getElementById('req-location').value = draft.siteLocation;
      if (draft.plotArea && document.getElementById('req-plot-area')) document.getElementById('req-plot-area').value = draft.plotArea;
      if (draft.plotUnit && document.getElementById('req-plot-unit')) document.getElementById('req-plot-unit').value = draft.plotUnit;
      if (draft.floors && document.getElementById('req-floors')) document.getElementById('req-floors').value = draft.floors;
      if (draft.budget && document.getElementById('req-budget')) document.getElementById('req-budget').value = draft.budget;
      if (draft.description && descInput) {
        descInput.value = draft.description;
        if (charCounter) charCounter.textContent = `${draft.description.length} / 1000 characters`;
      }
      if (draft.files && Array.isArray(draft.files)) {
        uploadedFiles = draft.files;
        renderUploadedFilesList();
      }
    }
  } catch (e) {
    console.warn('Could not parse request draft from session.', e);
  }

  // Save draft helper
  function saveDraft() {
    const draft = {
      title: document.getElementById('req-title')?.value || '',
      projectType: document.getElementById('req-type')?.value || 'Residential Building',
      siteLocation: document.getElementById('req-location')?.value || '',
      plotArea: document.getElementById('req-plot-area')?.value || '',
      plotUnit: document.getElementById('req-plot-unit')?.value || 'sq ft',
      floors: document.getElementById('req-floors')?.value || 'G+1',
      budget: document.getElementById('req-budget')?.value || '₹25L - ₹50L',
      description: descInput?.value || '',
      files: uploadedFiles
    };
    sessionStorage.setItem('sga_request_draft', JSON.stringify(draft));
  }

  // Warn before leaving with unsaved inputs
  window.addEventListener('beforeunload', (e) => {
    if (formDirty && !isSubmitting) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Track field changes for draft and dirty state
  document.querySelectorAll('#wizard-form input, #wizard-form select, #wizard-form textarea').forEach(input => {
    input.addEventListener('change', () => {
      formDirty = true;
      saveDraft();
    });
  });

  // Wizard Step Switching
  function goToStep(step) {
    if (step < 1 || step > totalSteps) return;

    // Validate if moving forward
    if (step > currentStep) {
      if (!validateStep(currentStep)) return;
    }

    currentStep = step;

    // Update Stepper indicators
    document.querySelectorAll('.stepper-step').forEach(btn => {
      const s = parseInt(btn.dataset.step, 10);
      btn.classList.toggle('is-active', s === currentStep);
      btn.classList.toggle('is-completed', s < currentStep);
    });

    // Update Step visibility
    document.querySelectorAll('.step-content').forEach(section => {
      const s = parseInt(section.dataset.step, 10);
      section.classList.toggle('is-active', s === currentStep);
    });

    if (currentStep === 4) {
      populateReviewStep();
    }

    window.scrollTo({ top: 120, behavior: 'smooth' });
  }

  function validateStep(step) {
    if (step === 1) {
      const p = phoneInput?.value.trim() || '';
      if (p.length < 8) {
        ui.showToast('Please verify your contact phone number.', 'error');
        phoneInput?.focus();
        return false;
      }
      return true;
    }

    if (step === 2) {
      const title = document.getElementById('req-title')?.value.trim();
      const loc = document.getElementById('req-location')?.value.trim();
      const area = document.getElementById('req-plot-area')?.value.trim();
      const desc = descInput?.value.trim();

      if (!title || title.length < 3) {
        ui.showToast('Please enter a clear project title (at least 3 characters).', 'error');
        document.getElementById('req-title')?.focus();
        return false;
      }
      if (!loc || loc.length < 2) {
        ui.showToast('Please specify the site location or city.', 'error');
        document.getElementById('req-location')?.focus();
        return false;
      }
      if (!area || isNaN(area) || Number(area) <= 0) {
        ui.showToast('Please enter a valid numeric plot area.', 'error');
        document.getElementById('req-plot-area')?.focus();
        return false;
      }
      if (!desc || desc.length < 10) {
        ui.showToast('Please provide a brief project description (at least 10 characters).', 'error');
        descInput?.focus();
        return false;
      }
      return true;
    }

    return true;
  }

  // Next / Back buttons
  document.getElementById('step-1-next')?.addEventListener('click', () => goToStep(2));
  document.getElementById('step-2-back')?.addEventListener('click', () => goToStep(1));
  document.getElementById('step-2-next')?.addEventListener('click', () => goToStep(3));
  document.getElementById('step-3-back')?.addEventListener('click', () => goToStep(2));
  document.getElementById('step-3-next')?.addEventListener('click', () => goToStep(4));
  document.getElementById('step-4-back')?.addEventListener('click', () => goToStep(3));

  // Edit buttons inside Step 4 review
  document.querySelectorAll('[data-goto-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = parseInt(btn.dataset.gotoStep, 10);
      goToStep(s);
    });
  });

  // Step 3: File Upload Handling
  const dropzone = document.getElementById('file-dropzone');
  const fileInput = document.getElementById('req-file-input');
  const categorySelect = document.getElementById('file-category-select');
  const uploadProgress = document.getElementById('upload-progress');
  const uploadBar = document.getElementById('upload-progress-bar');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) handleFilesSelected(files);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleFilesSelected(fileInput.files);
      }
    });
  }

  async function handleFilesSelected(fileList) {
    const category = categorySelect?.value || 'Site Photographs';
    const remainingSlots = CONFIG.MAX_FILES_PER_REQUEST - uploadedFiles.length;

    if (fileList.length > remainingSlots) {
      ui.showToast(`You can only upload up to ${CONFIG.MAX_FILES_PER_REQUEST} files per request (${remainingSlots} remaining).`, 'error');
      return;
    }

    if (uploadProgress) uploadProgress.style.display = 'block';
    if (uploadBar) uploadBar.style.width = '20%';

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (uploadBar) uploadBar.style.width = `${Math.min(90, 20 + (i + 1) * 20)}%`;

      const uploadRes = await api.uploadFile(file, category);
      if (!uploadRes.ok) {
        ui.showToast(uploadRes.error, 'error');
      } else {
        uploadedFiles.push(uploadRes.data);
      }
    }

    if (uploadBar) uploadBar.style.width = '100%';
    setTimeout(() => {
      if (uploadProgress) uploadProgress.style.display = 'none';
      if (uploadBar) uploadBar.style.width = '0%';
    }, 400);

    formDirty = true;
    saveDraft();
    renderUploadedFilesList();
    if (fileInput) fileInput.value = '';
  }

  function renderUploadedFilesList() {
    const listEl = document.getElementById('uploaded-files-list');
    const counterEl = document.getElementById('files-count-badge');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (counterEl) counterEl.textContent = `${uploadedFiles.length} / ${CONFIG.MAX_FILES_PER_REQUEST} files attached`;

    if (uploadedFiles.length === 0) {
      listEl.innerHTML = '<p style="font-size:12px; color:var(--muted); margin-top:8px;">No files attached yet. (Optional, you can also upload later during architectural review).</p>';
      return;
    }

    uploadedFiles.forEach((file, index) => {
      const row = document.createElement('div');
      row.className = 'file-row';

      const left = document.createElement('div');
      left.className = 'file-row-left';

      const thumb = document.createElement('div');
      thumb.className = 'file-thumb';
      if (file.type.startsWith('image/')) {
        thumb.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
      } else {
        thumb.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
      }

      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'file-info-name';
      name.textContent = file.name;

      const size = document.createElement('div');
      size.className = 'file-info-size';
      size.textContent = `${file.category} · ${ui.formatBytes(file.size)}`;

      info.appendChild(name);
      info.appendChild(size);
      left.appendChild(thumb);
      left.appendChild(info);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'file-remove-btn';
      removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', () => {
        uploadedFiles.splice(index, 1);
        formDirty = true;
        saveDraft();
        renderUploadedFilesList();
      });

      row.appendChild(left);
      row.appendChild(removeBtn);
      listEl.appendChild(row);
    });
  }

  // Step 4: Populate Review Summary
  function populateReviewStep() {
    ui.setText(document.getElementById('rev-name'), user.fullName);
    ui.setText(document.getElementById('rev-email'), user.email);
    ui.setText(document.getElementById('rev-phone'), phoneInput?.value || user.phone);

    ui.setText(document.getElementById('rev-title'), document.getElementById('req-title')?.value);
    ui.setText(document.getElementById('rev-type'), document.getElementById('req-type')?.value);
    ui.setText(document.getElementById('rev-location'), document.getElementById('req-location')?.value);
    ui.setText(document.getElementById('rev-plot'), `${document.getElementById('req-plot-area')?.value} ${document.getElementById('req-plot-unit')?.value}`);
    ui.setText(document.getElementById('rev-floors'), document.getElementById('req-floors')?.value);
    ui.setText(document.getElementById('rev-budget'), document.getElementById('req-budget')?.value);
    ui.setText(document.getElementById('rev-desc'), descInput?.value);

    const filesCountSpan = document.getElementById('rev-files-summary');
    if (filesCountSpan) {
      if (uploadedFiles.length === 0) {
        filesCountSpan.textContent = 'None attached (can be added during review)';
      } else {
        filesCountSpan.textContent = `${uploadedFiles.length} file(s) attached (${uploadedFiles.map(f => f.name).join(', ')})`;
      }
    }
  }

  // Final Submission
  const submitBtn = document.getElementById('submit-request-final-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      if (!validateStep(1) || !validateStep(2)) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting your request...';
      isSubmitting = true;

      const requestPayload = {
        title: document.getElementById('req-title')?.value || 'Architectural Project',
        projectType: document.getElementById('req-type')?.value || 'Residential Building',
        siteLocation: document.getElementById('req-location')?.value || '',
        plotArea: document.getElementById('req-plot-area')?.value || '',
        plotUnit: document.getElementById('req-plot-unit')?.value || 'sq ft',
        floors: document.getElementById('req-floors')?.value || 'G+1',
        budget: document.getElementById('req-budget')?.value || '₹25L - ₹50L',
        description: descInput?.value || '',
        files: uploadedFiles
      };

      const res = await api.createRequest(requestPayload);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Design Request';

      if (!res.ok) {
        isSubmitting = false;
        ui.showToast(res.error || 'Failed to submit request.', 'error');
        return;
      }

      // Clear draft
      sessionStorage.removeItem('sga_request_draft');
      formDirty = false;

      // Show Confirmation Screen
      const wizardWrap = document.getElementById('wizard-container');
      const confirmationWrap = document.getElementById('confirmation-container');
      const confIdEl = document.getElementById('conf-request-id');
      const viewDetailsBtn = document.getElementById('conf-view-details-btn');

      if (confIdEl) confIdEl.textContent = res.data.id;
      if (viewDetailsBtn) viewDetailsBtn.href = `request-details.html?id=${encodeURIComponent(res.data.id)}`;

      if (wizardWrap) wizardWrap.style.display = 'none';
      if (confirmationWrap) {
        confirmationWrap.style.display = 'block';
        window.scrollTo({ top: 80, behavior: 'smooth' });
      }

      ui.showToast(`Request ${res.data.id} submitted successfully!`, 'success');
      ui.updateNotificationBadge();
    });
  }
}

// ==========================================
// 2. MY REQUESTS LIST CONTROLLER
// ==========================================
export async function initMyRequests() {
  const user = await authGuard.protect();
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();

  // Populate user header & sidebar
  const headerAvatar = document.getElementById('header-avatar');
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);
  ui.renderAvatar(headerAvatar, user);
  ui.renderAvatar(sidebarAvatar, user);

  let currentPage = 1;
  const limit = 6;
  let currentSearch = '';
  let currentStatus = 'all';
  let currentType = 'all';
  let currentSort = 'newest';

  const searchInput = document.getElementById('requests-search');
  const statusFilter = document.getElementById('filter-status');
  const typeFilter = document.getElementById('filter-type');
  const sortFilter = document.getElementById('filter-sort');
  const tableBody = document.getElementById('requests-table-body');
  const paginationInfo = document.getElementById('pagination-info');
  const prevBtn = document.getElementById('pagination-prev');
  const nextBtn = document.getElementById('pagination-next');

  async function loadRequests() {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:32px;"><div class="skeleton" style="height:40px;"></div></td></tr>`;
    }

    const res = await api.listRequests({
      search: currentSearch,
      status: currentStatus,
      type: currentType,
      sort: currentSort,
      page: currentPage,
      limit
    });

    if (!res.ok) {
      ui.showToast('Failed to load design requests.', 'error');
      return;
    }

    const { items, total, totalPages } = res.data;
    renderRequests(items, total);

    // Pagination controls
    if (paginationInfo) {
      const start = total === 0 ? 0 : (currentPage - 1) * limit + 1;
      const end = Math.min(total, currentPage * limit);
      paginationInfo.textContent = `Showing ${start}-${end} of ${total} requests`;
    }

    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  }

  function renderRequests(items, total) {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (!items || items.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding:48px 20px; text-align:center;">
            <div class="empty-state" style="border:none; padding:0;">
              <div class="empty-state-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <div class="empty-state-title">No Matching Requests</div>
              <p class="empty-state-desc">No design requests found for your selected criteria.</p>
              <a href="new-request.html" class="btn btn-primary btn-sm">Submit New Request</a>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    items.forEach(req => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        window.location.href = `request-details.html?id=${encodeURIComponent(req.id)}`;
      });

      // ID
      const tdId = document.createElement('td');
      tdId.style.fontWeight = '600';
      tdId.style.color = 'var(--copper)';
      tdId.textContent = req.id;

      // Title & Location
      const tdTitle = document.createElement('td');
      const titleSpan = document.createElement('strong');
      titleSpan.style.display = 'block';
      titleSpan.textContent = req.title;
      const locSpan = document.createElement('span');
      locSpan.style.fontSize = '11px';
      locSpan.style.color = 'var(--muted)';
      locSpan.textContent = req.siteLocation || 'Location unspecified';
      tdTitle.appendChild(titleSpan);
      tdTitle.appendChild(locSpan);

      // Type
      const tdType = document.createElement('td');
      tdType.textContent = req.projectType;

      // Date
      const tdDate = document.createElement('td');
      tdDate.textContent = ui.formatDate(req.createdAt);

      // Status
      const tdStatus = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `status-badge status-badge--${req.status}`;
      badge.textContent = req.status.replace('_', ' ');
      tdStatus.appendChild(badge);

      tr.appendChild(tdId);
      tr.appendChild(tdTitle);
      tr.appendChild(tdType);
      tr.appendChild(tdDate);
      tr.appendChild(tdStatus);

      tableBody.appendChild(tr);
    });
  }

  // Event Listeners for Filters
  let searchTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = searchInput.value;
        currentPage = 1;
        loadRequests();
      }, 300);
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      currentStatus = statusFilter.value;
      currentPage = 1;
      loadRequests();
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', () => {
      currentType = typeFilter.value;
      currentPage = 1;
      loadRequests();
    });
  }

  if (sortFilter) {
    sortFilter.addEventListener('change', () => {
      currentSort = sortFilter.value;
      currentPage = 1;
      loadRequests();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadRequests();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentPage++;
      loadRequests();
    });
  }

  loadRequests();
}

// ==========================================
// 3. REQUEST DETAILS & TIMELINE CONTROLLER
// ==========================================
export async function initRequestDetails() {
  const user = await authGuard.protect();
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();

  // Populate user header & sidebar
  const headerAvatar = document.getElementById('header-avatar');
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);
  ui.renderAvatar(headerAvatar, user);
  ui.renderAvatar(sidebarAvatar, user);

  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get('id');

  if (!requestId) {
    ui.showToast('No request ID provided.', 'error');
    window.location.href = 'my-requests.html';
    return;
  }

  const res = await api.getRequest(requestId);
  if (!res.ok || !res.data) {
    ui.showToast(res.error || 'Design request not found or access denied.', 'error');
    setTimeout(() => {
      window.location.href = 'my-requests.html';
    }, 1500);
    return;
  }

  const req = res.data;

  // Render Header Details
  ui.setText(document.getElementById('details-id'), req.id);
  ui.setText(document.getElementById('details-title'), req.title);
  ui.setText(document.getElementById('details-meta'), `${req.projectType} · Submitted on ${ui.formatDate(req.createdAt)}`);

  const statusBadge = document.getElementById('details-status-badge');
  if (statusBadge) {
    statusBadge.className = `status-badge status-badge--${req.status}`;
    statusBadge.textContent = req.status.replace('_', ' ');
  }

  // Cancel Request Action (Allowed only when status === 'submitted')
  const cancelBtn = document.getElementById('cancel-request-btn');
  if (cancelBtn) {
    if (req.status === 'submitted') {
      cancelBtn.style.display = 'inline-flex';
      cancelBtn.addEventListener('click', async () => {
        const confirmed = await ui.showConfirm({
          title: 'Cancel Design Request',
          message: 'Are you sure you wish to cancel this request? This action cannot be reversed.',
          confirmText: 'Yes, Cancel Request',
          cancelText: 'Keep Active',
          isDanger: true
        });

        if (confirmed) {
          const cancelRes = await api.cancelRequest(req.id);
          if (cancelRes.ok) {
            ui.showToast('Request has been cancelled.', 'info');
            setTimeout(() => window.location.reload(), 400);
          } else {
            ui.showToast(cancelRes.error, 'error');
          }
        }
      });
    } else {
      cancelBtn.style.display = 'none';
    }
  }

  // Render Timeline
  renderTimeline(req);

  // Render Project Information
  ui.setText(document.getElementById('info-type'), req.projectType);
  ui.setText(document.getElementById('info-location'), req.siteLocation);
  ui.setText(document.getElementById('info-plot'), `${req.plotArea} ${req.plotUnit}`);
  ui.setText(document.getElementById('info-floors'), req.floors);
  ui.setText(document.getElementById('info-budget'), req.budget);
  ui.setText(document.getElementById('info-desc'), req.description);

  // Render Uploaded Files with Download Links
  renderFiles(req);

  // Extra files upload (enabled while submitted or under_review)
  const extraUploadSection = document.getElementById('extra-upload-section');
  const extraFileInput = document.getElementById('extra-file-input');
  if (extraUploadSection) {
    if (req.status === 'submitted' || req.status === 'under_review') {
      extraUploadSection.style.display = 'block';
      if (extraFileInput) {
        extraFileInput.addEventListener('change', async () => {
          if (!extraFileInput.files || extraFileInput.files.length === 0) return;
          const files = Array.from(extraFileInput.files);
          ui.showToast('Attaching files...', 'info');

          const uploadedRecords = [];
          for (const f of files) {
            const upRes = await api.uploadFile(f, 'Additional Documents');
            if (upRes.ok) uploadedRecords.push(upRes.data);
            else ui.showToast(upRes.error, 'error');
          }

          if (uploadedRecords.length > 0) {
            const addRes = await api.addFiles(req.id, uploadedRecords);
            if (addRes.ok) {
              ui.showToast('Files attached successfully!', 'success');
              req.files = addRes.data.files;
              renderFiles(req);
            } else {
              ui.showToast(addRes.error, 'error');
            }
          }
          extraFileInput.value = '';
        });
      }
    } else {
      extraUploadSection.style.display = 'none';
    }
  }

  // Render Proposals Card
  renderClientProposals(req);

  // Render Messages Thread
  renderMessages(req);

  // Message Form Submit
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-text');
  if (messageForm && messageInput) {
    messageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = messageInput.value.trim();
      if (!text) return;

      messageInput.disabled = true;
      const sendRes = await api.addMessage(req.id, text);
      messageInput.disabled = false;

      if (!sendRes.ok) {
        ui.showToast(sendRes.error, 'error');
        return;
      }

      req.messages.push(sendRes.data);
      renderMessages(req);
      messageInput.value = '';
      ui.showToast('Message sent to studio.', 'success');
    });
  }

  function renderTimeline(r) {
    const timelineEl = document.getElementById('timeline-container');
    if (!timelineEl) return;
    timelineEl.innerHTML = '';

    const stages = [
      { key: 'submitted', label: 'Submitted' },
      { key: 'under_review', label: 'Under Review' },
      { key: 'approved', label: 'Approved' },
      { key: 'in_progress', label: 'In Progress' },
      { key: 'completed', label: 'Completed' }
    ];

    if (r.status === 'rejected') {
      // Terminal rejected state
      const rejectedEntry = r.timeline.find(t => t.step === 'rejected') || {
        step: 'rejected',
        label: 'Request Rejected / Cancelled',
        date: r.updatedAt,
        note: 'This request was rejected or cancelled.'
      };

      const stepEl = document.createElement('div');
      stepEl.className = 'timeline-step is-rejected';
      stepEl.innerHTML = `
        <div class="timeline-dot">&#10007;</div>
        <div class="timeline-content">
          <div class="timeline-title">${rejectedEntry.label}</div>
          <div class="timeline-date">${ui.formatDateTime(rejectedEntry.date)}</div>
          <div class="timeline-note" style="color:var(--status-rejected); background:var(--status-rejected-bg);">${rejectedEntry.note}</div>
        </div>
      `;
      timelineEl.appendChild(stepEl);
      return;
    }

    const currentStageIndex = stages.findIndex(s => s.key === r.status);

    stages.forEach((stage, idx) => {
      const stepEl = document.createElement('div');
      const isCompleted = idx < currentStageIndex;
      const isCurrent = idx === currentStageIndex;

      stepEl.className = `timeline-step ${isCompleted ? 'is-completed' : ''} ${isCurrent ? 'is-current' : ''}`;

      // Check if there is an explicit timeline history entry
      const historyEntry = r.timeline.find(t => t.step === stage.key);

      const dotIcon = isCompleted ? '&#10003;' : String(idx + 1);
      const dateText = historyEntry ? ui.formatDateTime(historyEntry.date) : (isCurrent ? 'Current Phase' : 'Pending');
      const noteText = historyEntry && historyEntry.note ? `<div class="timeline-note">${historyEntry.note}</div>` : '';

      stepEl.innerHTML = `
        <div class="timeline-dot">${dotIcon}</div>
        <div class="timeline-content">
          <div class="timeline-title">${stage.label}</div>
          <div class="timeline-date">${dateText}</div>
          ${noteText}
        </div>
      `;

      timelineEl.appendChild(stepEl);
    });
  }

  function renderFiles(r) {
    const container = document.getElementById('details-files-container');
    if (!container) return;
    container.innerHTML = '';

    if (!r.files || r.files.length === 0) {
      container.innerHTML = '<p style="font-size:13px; color:var(--muted);">No attachments uploaded for this request.</p>';
      return;
    }

    r.files.forEach(file => {
      const row = document.createElement('div');
      row.className = 'file-row';

      const left = document.createElement('div');
      left.className = 'file-row-left';

      const thumb = document.createElement('div');
      thumb.className = 'file-thumb';
      thumb.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'file-info-name';
      name.textContent = file.name;

      const size = document.createElement('div');
      size.className = 'file-info-size';
      size.textContent = `${file.category || 'Document'} · ${ui.formatBytes(file.size)}`;

      info.appendChild(name);
      info.appendChild(size);
      left.appendChild(thumb);
      left.appendChild(info);

      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'btn btn-secondary btn-sm';
      downloadBtn.innerHTML = `View / Download <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
      downloadBtn.addEventListener('click', async () => {
        const fileRes = await api.getFile(file.id);
        if (fileRes.ok && fileRes.data.url) {
          const a = document.createElement('a');
          a.href = fileRes.data.url;
          a.download = file.name;
          a.target = '_blank';
          a.click();
        } else {
          ui.showToast('Could not load file attachment.', 'error');
        }
      });

      row.appendChild(left);
      row.appendChild(downloadBtn);
      container.appendChild(row);
    });
  }

  function renderMessages(r) {
    const thread = document.getElementById('messages-thread');
    if (!thread) return;
    thread.innerHTML = '';

    if (!r.messages || r.messages.length === 0) {
      thread.innerHTML = '<p style="font-size:13px; color:var(--muted);">No messages exchanged yet.</p>';
      return;
    }

    r.messages.forEach(msg => {
      const bubble = document.createElement('div');
      bubble.className = `message-bubble ${msg.isStudio ? 'message-bubble--sga' : 'message-bubble--client'}`;

      const author = document.createElement('div');
      author.className = 'message-author';

      const authorName = document.createElement('span');
      authorName.textContent = msg.author;

      const dateSpan = document.createElement('span');
      dateSpan.style.color = 'var(--muted)';
      dateSpan.style.fontSize = '10px';
      dateSpan.style.fontWeight = '400';
      dateSpan.textContent = ui.formatDateTime(msg.createdAt);

      author.appendChild(authorName);
      author.appendChild(dateSpan);

      const text = document.createElement('div');
      text.className = 'message-text';
      text.textContent = msg.text;

      bubble.appendChild(author);
      bubble.appendChild(text);
      thread.appendChild(bubble);
    });

    thread.scrollTop = thread.scrollHeight;
  }

  function renderClientProposals(r) {
    const container = document.getElementById('client-proposals-container');
    const badge = document.getElementById('proposal-count-badge');
    if (!container) return;

    // Load from storage
    const allProposals = JSON.parse(localStorage.getItem('sga_proposals') || '[]');
    const projectProposals = allProposals.filter(p => p.requestId === r.id && p.status !== 'draft');

    if (badge) {
      badge.textContent = `${projectProposals.length} Formal Quote(s)`;
      badge.style.display = projectProposals.length > 0 ? 'inline-block' : 'none';
    }

    if (projectProposals.length === 0) {
      container.innerHTML = `
        <div style="background:var(--sand-light); border:1px solid var(--sand); border-radius:8px; padding:16px; font-size:13px; color:var(--muted);">
          Our principal architect is currently conducting feasibility analysis and preparing formal fee quotation and milestone deliverables. When released, you can review and sign off here.
        </div>
      `;
      return;
    }

    container.innerHTML = projectProposals.map(p => `
      <div style="background:var(--sand-light); border:1px solid var(--sand); border-radius:10px; padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <div>
            <span style="font-size:11px; font-weight:700; color:var(--copper); font-family:monospace;">${p.id}</span>
            <h4 style="font-size:16px; font-weight:600; color:var(--ink); margin-top:2px;">${p.title}</h4>
          </div>
          <span class="status-badge status-badge--${p.status === 'accepted' ? 'approved' : 'submitted'}">${p.status.toUpperCase()}</span>
        </div>

        <p style="font-size:13px; color:var(--muted); line-height:1.6; margin-bottom:16px;">${p.scopeSummary || ''}</p>

        <!-- Deliverables Table -->
        <table style="width:100%; border-collapse:collapse; font-size:12.5px; margin-bottom:16px;">
          <thead>
            <tr style="border-bottom:1px solid var(--sand); text-align:left; color:var(--muted);">
              <th style="padding:6px 0;">Deliverable</th>
              <th style="padding:6px 0; text-align:center;">Qty</th>
              <th style="padding:6px 0; text-align:right;">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${(p.lineItems || []).map(li => `
              <tr style="border-bottom:1px solid rgba(0,0,0,0.05);">
                <td style="padding:8px 0;">${li.description}</td>
                <td style="padding:8px 0; text-align:center;">${li.qty || 1}</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">₹${(li.amount || 0).toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Total Breakdown -->
        <div style="background:#FFF; padding:12px 16px; border-radius:6px; border:1px solid var(--sand); margin-bottom:16px; font-size:13px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:var(--muted);">Subtotal:</span>
            <span>₹${(p.subtotal || 0).toLocaleString('en-IN')}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:var(--muted);">GST (18%):</span>
            <span>₹${(p.gstAmount || 0).toLocaleString('en-IN')}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-weight:700; color:var(--copper); font-size:15px; padding-top:6px; border-top:1px solid var(--sand);">
            <span>Total Fee:</span>
            <span>₹${(p.totalAmount || 0).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <!-- Milestones -->
        <div style="margin-bottom:16px;">
          <strong style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink); display:block; margin-bottom:8px;">Payment Milestones:</strong>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px;">
            ${(p.milestones || []).map(m => `
              <div style="background:#FFF; border:1px solid var(--sand); border-radius:6px; padding:8px 10px; font-size:11.5px;">
                <div style="font-weight:600; color:var(--ink);">${m.title} (${m.percentage}%)</div>
                <div style="color:var(--copper); font-weight:700; margin-top:2px;">₹${(m.amount || 0).toLocaleString('en-IN')}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Actions -->
        ${p.status === 'sent' ? `
          <div style="display:flex; gap:10px; flex-wrap:wrap; padding-top:10px; border-top:1px solid var(--sand);">
            <button class="btn btn-primary btn-sm client-accept-prop-btn" data-id="${p.id}">
              Accept Proposal & Authorize Work &rarr;
            </button>
            <button class="btn btn-secondary btn-sm client-revise-prop-btn" data-id="${p.id}">
              Request Scope Adjustment
            </button>
          </div>
        ` : p.status === 'accepted' ? `
          <div style="font-size:12px; color:var(--status-approved); background:var(--status-approved-bg); padding:8px 12px; border-radius:6px; display:flex; align-items:center; gap:6px;">
            <span>&#10003; Formally accepted by <strong>${p.acceptedByName || 'Client'}</strong> on ${new Date(p.acceptedAt || Date.now()).toLocaleDateString()}.</span>
          </div>
        ` : ''}
      </div>
    `).join('');

    // Bind Accept Proposal
    container.querySelectorAll('.client-accept-prop-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const signature = prompt('To formally accept this proposal, please enter your Full Name as your digital authorization signature:');
        if (!signature || signature.trim().length < 2) return;

        const propId = btn.dataset.id;
        const all = JSON.parse(localStorage.getItem('sga_proposals') || '[]');
        const target = all.find(x => x.id === propId);
        if (target) {
          target.status = 'accepted';
          target.acceptedByName = signature.trim();
          target.acceptedAt = new Date().toISOString();
          localStorage.setItem('sga_proposals', JSON.stringify(all));

          // Also update request status to approved
          const requests = JSON.parse(localStorage.getItem('sga_requests') || '[]');
          const req = requests.find(x => x.id === r.id);
          if (req) {
            req.status = 'approved';
            req.timeline.push({
              step: 'approved',
              label: 'Proposal Accepted & Approved',
              date: new Date().toISOString(),
              note: `Proposal ${target.id} accepted by client ${signature.trim()}.`
            });
            localStorage.setItem('sga_requests', JSON.stringify(requests));
          }

          ui.showToast('Proposal accepted successfully! Work commences shortly.', 'success');
          setTimeout(() => window.location.reload(), 1000);
        }
      });
    });

    // Bind Revision Request
    container.querySelectorAll('.client-revise-prop-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const feedback = prompt('Please describe the scope adjustments or budget feedback for the studio:');
        if (!feedback) return;

        const propId = btn.dataset.id;
        const all = JSON.parse(localStorage.getItem('sga_proposals') || '[]');
        const target = all.find(x => x.id === propId);
        if (target) {
          target.status = 'revision_requested';
          target.clientFeedback = feedback;
          localStorage.setItem('sga_proposals', JSON.stringify(all));
          ui.showToast('Scope adjustment request sent to architect.', 'info');
          setTimeout(() => window.location.reload(), 1000);
        }
      });
    });
  }
}
