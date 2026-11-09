/**
 * SGA.IN Student Portal - PDF Note Viewer (viewer.js)
 * In-browser PDF.js reader with:
 * - Free preview mode (first 3 pages only, blurred locked card for page 4+)
 * - Purchased mode (full document, watermark with student name & email, download button)
 * - Zoom, fullscreen, page navigation, and right-click deterrent.
 */

import { api } from '../../client/js/api.js';
import { ui } from '../../client/js/ui.js';
import { CONFIG } from '../../client/js/config.js';

export async function initNoteViewer() {
  const urlParams = new URLSearchParams(window.location.search);
  const noteId = urlParams.get('id');
  const isPreviewParam = urlParams.get('preview') === 'true';

  if (!noteId) {
    ui.showToast('No note specified.', 'error');
    window.location.href = 'browse-notes.html';
    return;
  }

  const container = document.getElementById('viewer-canvas-container');
  const titleEl = document.getElementById('viewer-title');
  const pageIndicator = document.getElementById('viewer-page-indicator');
  const prevBtn = document.getElementById('viewer-prev-btn');
  const nextBtn = document.getElementById('viewer-next-btn');
  const zoomInBtn = document.getElementById('viewer-zoom-in');
  const zoomOutBtn = document.getElementById('viewer-zoom-out');
  const fullscreenBtn = document.getElementById('viewer-fullscreen');
  const downloadBtn = document.getElementById('viewer-download-btn');
  const watermarkEl = document.getElementById('viewer-watermark');
  const modeBadge = document.getElementById('viewer-mode-badge');

  let pdfDoc = null;
  let currentPage = 1;
  let currentZoom = 1.2;
  let totalPages = 0;
  let isPurchased = false;
  let allowedPages = CONFIG.NOTES_PREVIEW_PAGES || 3;
  let currentUser = null;
  let noteData = null;

  // 1. Fetch note details
  const noteRes = await api.getNote(noteId);
  if (!noteRes.ok) {
    ui.showToast('Note not found.', 'error');
    window.location.href = 'browse-notes.html';
    return;
  }

  noteData = noteRes.data;
  if (titleEl) titleEl.textContent = noteData.title;

  const meRes = await api.getMe();
  currentUser = meRes.ok ? meRes.data : null;

  isPurchased = !!noteData.isPurchased && !isPreviewParam;

  if (modeBadge) {
    if (isPurchased) {
      modeBadge.textContent = 'Purchased Full Edition';
      modeBadge.className = 'badge-owned';
    } else {
      modeBadge.textContent = `Preview Mode (Pages 1–${allowedPages})`;
      modeBadge.style.background = '#FAF3E5';
      modeBadge.style.color = '#B7892F';
      modeBadge.style.border = '1px solid rgba(183, 137, 47, 0.3)';
    }
  }

  // Right-click deterrent
  const viewerContainer = document.getElementById('viewer-container');
  viewerContainer?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // 2. Fetch File Blob
  let fileBlob = null;
  if (isPurchased) {
    const fileRes = await api.getPurchasedNoteFile(noteId);
    if (fileRes.ok && fileRes.data.blob) {
      fileBlob = fileRes.data.blob;
      if (downloadBtn) {
        downloadBtn.style.display = 'inline-flex';
        downloadBtn.addEventListener('click', () => {
          const downloadUrl = URL.createObjectURL(fileBlob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = fileRes.data.filename || `${noteData.title}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);
          ui.showToast('PDF download started.', 'info');
        });
      }
    }
  } else {
    // Preview Mode
    const previewRes = await api.getNotePreview(noteId);
    if (previewRes.ok && previewRes.data.fileUrl) {
      // In preview, hide direct download button
      if (downloadBtn) downloadBtn.style.display = 'none';
      try {
        const response = await fetch(previewRes.data.fileUrl);
        fileBlob = await response.blob();
      } catch (e) {
        console.warn('Preview file fetch error:', e);
      }
    }
  }

  // Setup Watermark for purchased view
  if (isPurchased && currentUser && watermarkEl) {
    watermarkEl.innerHTML = '';
    const watermarkText = `${currentUser.fullName} · ${currentUser.email} · SGA.IN Verified Purchase`;
    for (let i = 0; i < 4; i++) {
      const line = document.createElement('div');
      line.className = 'watermark-text';
      line.textContent = watermarkText;
      watermarkEl.appendChild(line);
    }
    watermarkEl.style.display = 'flex';
  } else if (watermarkEl) {
    watermarkEl.style.display = 'none';
  }

  // 3. Render with PDF.js
  if (!window.pdfjsLib) {
    container.innerHTML = `
      <div style="color:white; text-align:center; padding:50px;">
        <p>Loading PDF Reader library...</p>
      </div>
    `;
    return;
  }

  // PDF.js worker
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  if (!fileBlob) {
    container.innerHTML = `
      <div style="color:#FAF8F5; text-align:center; padding:60px 20px; max-width:440px; margin:0 auto;">
        <div style="width:48px; height:48px; border-radius:50%; background:rgba(196,122,59,0.15); color:var(--copper); display:grid; place-items:center; margin:0 auto 16px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
        </div>
        <h3 style="font-size:20px; margin-bottom:8px; font-family:var(--font-serif, 'Cormorant Garamond', Georgia, serif);">No Document Uploaded</h3>
        <p style="font-size:13px; color:var(--muted); line-height:1.6; margin-bottom:20px;">The PDF document for this study note has not yet been uploaded by the administration.</p>
        <a href="browse-notes.html" class="btn btn-primary btn-sm">&larr; Back to Browse Notes</a>
      </div>
    `;
    return;
  }

  try {
    const arrayBuffer = await fileBlob.arrayBuffer();
    pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    totalPages = pdfDoc.numPages;

    // Restore last read page if purchased
    if (isPurchased && noteData.purchaseRecord?.lastPage) {
      currentPage = Math.min(noteData.purchaseRecord.lastPage, totalPages);
    }

    renderCurrentPage();

  } catch (err) {
    console.error('PDF.js loading error:', err);
    container.innerHTML = `
      <div style="color:white; text-align:center; padding:40px;">
        <p>Unable to render PDF document: ${err.message || 'File error'}</p>
      </div>
    `;
  }

  async function renderCurrentPage() {
    if (!pdfDoc || !container) return;

    // Check if in preview mode and page is beyond allowed pages
    if (!isPurchased && currentPage > allowedPages) {
      container.innerHTML = '';
      if (pageIndicator) pageIndicator.textContent = `Page ${currentPage} of ${totalPages} (Locked)`;

      const lockCard = document.createElement('div');
      lockCard.className = 'preview-locked-card';
      lockCard.innerHTML = `
        <div style="width:48px; height:48px; border-radius:50%; background:rgba(196,122,59,0.15); color:var(--copper); display:grid; place-items:center; margin:0 auto 16px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h3 style="font-size:24px; font-family:var(--font-serif); margin-bottom:6px;">Preview Limit Reached</h3>
        <p style="font-size:13.5px; color:#dedede; line-height:1.6; margin-bottom:20px;">
          Pages ${allowedPages + 1} to ${totalPages} contain detailed architectural construction assemblies, exam notes, and formulas. Purchase this study note to unlock the complete document.
        </p>
        <div style="font-size:22px; font-weight:700; color:var(--gold); margin-bottom:18px;">
          ${ui.formatRupees(noteData.price)}
        </div>
        <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
          <button type="button" id="lock-buy-btn" class="btn btn-primary btn-sm">
            Buy Now (${ui.formatRupees(noteData.price)})
          </button>
          <a href="note-details.html?id=${encodeURIComponent(noteData.id)}" class="btn btn-secondary btn-sm" style="color:var(--white); border-color:rgba(255,255,255,0.2); background:transparent;">
            View Details
          </a>
        </div>
      `;

      container.appendChild(lockCard);

      lockCard.querySelector('#lock-buy-btn')?.addEventListener('click', async () => {
        const orderRes = await api.createOrder(noteData.id);
        if (orderRes.ok) {
          window.location.href = `cart.html?checkoutOrder=${encodeURIComponent(orderRes.data.id)}`;
        } else {
          ui.showToast(orderRes.error || 'Failed to initialize order', 'error');
        }
      });

      updateNavButtons();
      return;
    }

    container.innerHTML = '<div style="color:var(--muted); font-size:12px; padding:20px;">Rendering page...</div>';

    const page = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale: currentZoom });

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    container.innerHTML = '';
    container.appendChild(canvas);

    await page.render({ canvasContext: context, viewport }).promise;

    if (pageIndicator) {
      pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    }

    updateNavButtons();

    // Auto-save reading progress if purchased
    if (isPurchased) {
      api.saveNoteProgress(noteId, currentPage);
    }
  }

  function updateNavButtons() {
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  }

  // Event handlers
  prevBtn?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderCurrentPage();
    }
  });

  nextBtn?.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderCurrentPage();
    }
  });

  zoomInBtn?.addEventListener('click', () => {
    if (currentZoom < 2.5) {
      currentZoom += 0.2;
      renderCurrentPage();
    }
  });

  zoomOutBtn?.addEventListener('click', () => {
    if (currentZoom > 0.6) {
      currentZoom -= 0.2;
      renderCurrentPage();
    }
  });

  fullscreenBtn?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      viewerContainer?.requestFullscreen().catch(err => console.warn(err));
    } else {
      document.exitFullscreen().catch(err => console.warn(err));
    }
  });

  // Keyboard controls (Left / Right arrow)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && currentPage < totalPages) {
      currentPage++;
      renderCurrentPage();
    } else if (e.key === 'ArrowLeft' && currentPage > 1) {
      currentPage--;
      renderCurrentPage();
    }
  });
}
