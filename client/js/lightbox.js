/**
 * Shilp Griha Associate (SGA) - Architectural Lightbox Component
 * Zoomable, responsive, accessible lightbox with keyboard & touch navigation.
 */

class SGALightbox {
  constructor() {
    this.isOpen = false;
    this.items = [];
    this.currentIndex = 0;
    this.triggerEl = null;
    this.isZoomed = false;
    this.touchStartX = 0;
    this.touchStartY = 0;

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    if (document.getElementById('sga-lightbox')) {
      this.overlay = document.getElementById('sga-lightbox');
      this.imgEl = document.getElementById('sga-lightbox-img');
      this.titleEl = document.getElementById('sga-lightbox-title');
      this.metaEl = document.getElementById('sga-lightbox-meta');
      this.badgeEl = document.getElementById('sga-lightbox-badge');
      this.counterEl = document.getElementById('sga-lightbox-counter');
      this.descEl = document.getElementById('sga-lightbox-desc');
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'sga-lightbox';
    overlay.className = 'sga-lightbox-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Project Image Lightbox');
    overlay.innerHTML = `
      <style>
        .sga-lightbox-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 13, 11, 0.94);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          z-index: 99999;
          display: flex;
          flex-direction: column;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1);
          color: #FAF8F5;
          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .sga-lightbox-overlay.is-active {
          opacity: 1;
          pointer-events: auto;
        }
        .sga-lightbox-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%);
          z-index: 10;
        }
        .sga-lightbox-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sga-lightbox-counter {
          font-size: 13px;
          letter-spacing: 0.08em;
          color: #D9B77E;
          font-weight: 600;
        }
        .sga-lightbox-badge {
          background: rgba(196, 122, 59, 0.25);
          border: 1px solid rgba(196, 122, 59, 0.5);
          color: #D9B77E;
          font-size: 11px;
          padding: 3px 10px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }
        .sga-lightbox-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .sga-lightbox-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #FAF8F5;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .sga-lightbox-btn:hover {
          background: rgba(196, 122, 59, 0.85);
          border-color: #C47A3B;
          transform: scale(1.05);
        }
        .sga-lightbox-body {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          padding: 10px 60px;
        }
        .sga-lightbox-img-wrap {
          max-width: 100%;
          max-height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          cursor: zoom-in;
        }
        .sga-lightbox-img-wrap.is-zoomed {
          cursor: zoom-out;
          transform: scale(1.5);
        }
        .sga-lightbox-img {
          max-width: 90vw;
          max-height: 75vh;
          object-fit: contain;
          border-radius: 6px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
          transition: opacity 0.2s ease;
        }
        .sga-lightbox-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #FAF8F5;
          width: 46px;
          height: 46px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          z-index: 10;
        }
        .sga-lightbox-nav:hover {
          background: #C47A3B;
          border-color: #C47A3B;
          transform: translateY(-50%) scale(1.08);
        }
        .sga-lightbox-prev { left: 16px; }
        .sga-lightbox-next { right: 16px; }
        .sga-lightbox-footer {
          padding: 18px 28px 24px;
          background: linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%);
          text-align: center;
          z-index: 10;
        }
        .sga-lightbox-title {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 24px;
          font-weight: 600;
          color: #FAF8F5;
          margin: 0 0 4px;
          letter-spacing: -0.01em;
        }
        .sga-lightbox-meta {
          font-size: 13px;
          color: #A39D95;
          margin-bottom: 4px;
        }
        .sga-lightbox-desc {
          font-size: 13px;
          color: #D6D0C7;
          max-width: 680px;
          margin: 0 auto;
          line-height: 1.5;
        }
        @media (max-width: 768px) {
          .sga-lightbox-body { padding: 10px 16px; }
          .sga-lightbox-nav { width: 38px; height: 38px; }
          .sga-lightbox-prev { left: 8px; }
          .sga-lightbox-next { right: 8px; }
          .sga-lightbox-title { font-size: 20px; }
        }
      </style>

      <div class="sga-lightbox-header">
        <div class="sga-lightbox-header-left">
          <span class="sga-lightbox-counter" id="sga-lightbox-counter">1 / 1</span>
          <span class="sga-lightbox-badge" id="sga-lightbox-badge">Exterior Elevation</span>
        </div>
        <div class="sga-lightbox-actions">
          <button type="button" class="sga-lightbox-btn" id="sga-lightbox-zoom-btn" title="Toggle Zoom (Double Click)" aria-label="Toggle Zoom">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
          </button>
          <button type="button" class="sga-lightbox-btn" id="sga-lightbox-close-btn" title="Close Lightbox (Esc)" aria-label="Close Lightbox">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      <div class="sga-lightbox-body" id="sga-lightbox-body">
        <button type="button" class="sga-lightbox-nav sga-lightbox-prev" id="sga-lightbox-prev-btn" aria-label="Previous Project (Arrow Left)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>

        <div class="sga-lightbox-img-wrap" id="sga-lightbox-img-wrap">
          <img class="sga-lightbox-img" id="sga-lightbox-img" src="" alt="Project Image">
        </div>

        <button type="button" class="sga-lightbox-nav sga-lightbox-next" id="sga-lightbox-next-btn" aria-label="Next Project (Arrow Right)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>

      <div class="sga-lightbox-footer">
        <h3 class="sga-lightbox-title" id="sga-lightbox-title"></h3>
        <div class="sga-lightbox-meta" id="sga-lightbox-meta"></div>
        <div class="sga-lightbox-desc" id="sga-lightbox-desc"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    this.overlay = overlay;
    this.imgWrapEl = overlay.querySelector('#sga-lightbox-img-wrap');
    this.imgEl = overlay.querySelector('#sga-lightbox-img');
    this.titleEl = overlay.querySelector('#sga-lightbox-title');
    this.metaEl = overlay.querySelector('#sga-lightbox-meta');
    this.badgeEl = overlay.querySelector('#sga-lightbox-badge');
    this.counterEl = overlay.querySelector('#sga-lightbox-counter');
    this.descEl = overlay.querySelector('#sga-lightbox-desc');
  }

  bindEvents() {
    const closeBtn = this.overlay.querySelector('#sga-lightbox-close-btn');
    const zoomBtn = this.overlay.querySelector('#sga-lightbox-zoom-btn');
    const prevBtn = this.overlay.querySelector('#sga-lightbox-prev-btn');
    const nextBtn = this.overlay.querySelector('#sga-lightbox-next-btn');

    closeBtn.addEventListener('click', () => this.close());
    zoomBtn.addEventListener('click', () => this.toggleZoom());
    prevBtn.addEventListener('click', () => this.prev());
    nextBtn.addEventListener('click', () => this.next());

    // Click backdrop to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay || e.target.id === 'sga-lightbox-body') {
        this.close();
      }
    });

    // Double click image to zoom
    this.imgWrapEl.addEventListener('click', (e) => {
      if (e.target === this.imgEl) {
        this.toggleZoom();
      }
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.next();
      }
    });

    // Touch swipe gestures
    this.overlay.addEventListener('touchstart', (e) => {
      if (!this.isOpen) return;
      this.touchStartX = e.changedTouches[0].screenX;
      this.touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    this.overlay.addEventListener('touchend', (e) => {
      if (!this.isOpen) return;
      const diffX = e.changedTouches[0].screenX - this.touchStartX;
      const diffY = e.changedTouches[0].screenY - this.touchStartY;
      if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX > 0) {
          this.prev();
        } else {
          this.next();
        }
      }
    }, { passive: true });
  }

  open(index = 0, items = [], triggerElement = null) {
    if (!items || items.length === 0) return;
    this.items = items;
    this.currentIndex = Math.max(0, Math.min(index, items.length - 1));
    this.triggerEl = triggerElement;
    this.isOpen = true;
    this.isZoomed = false;
    this.imgWrapEl.classList.remove('is-zoomed');

    document.body.style.overflow = 'hidden';
    this.overlay.classList.add('is-active');
    this.renderCurrent();
  }

  renderCurrent() {
    const item = this.items[this.currentIndex];
    if (!item) return;

    this.imgEl.style.opacity = '0';
    setTimeout(() => {
      this.imgEl.src = item.fullImage || item.thumbnail;
      this.imgEl.alt = item.altText || item.title;
      this.imgEl.style.opacity = '1';
    }, 100);

    this.titleEl.textContent = item.title;
    this.counterEl.textContent = `${this.currentIndex + 1} / ${this.items.length}`;
    this.badgeEl.textContent = item.category || 'Architecture';

    const metaParts = [];
    if (item.location) metaParts.push(item.location);
    if (item.year) metaParts.push(item.year);
    this.metaEl.textContent = metaParts.join(' · ');

    if (item.shortDescription) {
      this.descEl.textContent = item.shortDescription;
      this.descEl.style.display = 'block';
    } else {
      this.descEl.style.display = 'none';
    }

    // Hide/show navigation buttons if single item
    const prevBtn = this.overlay.querySelector('#sga-lightbox-prev-btn');
    const nextBtn = this.overlay.querySelector('#sga-lightbox-next-btn');
    if (this.items.length <= 1) {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
    } else {
      prevBtn.style.display = 'flex';
      nextBtn.style.display = 'flex';
    }
  }

  toggleZoom() {
    this.isZoomed = !this.isZoomed;
    this.imgWrapEl.classList.toggle('is-zoomed', this.isZoomed);
  }

  next() {
    if (this.items.length <= 1) return;
    this.isZoomed = false;
    this.imgWrapEl.classList.remove('is-zoomed');
    this.currentIndex = (this.currentIndex + 1) % this.items.length;
    this.renderCurrent();
  }

  prev() {
    if (this.items.length <= 1) return;
    this.isZoomed = false;
    this.imgWrapEl.classList.remove('is-zoomed');
    this.currentIndex = (this.currentIndex - 1 + this.items.length) % this.items.length;
    this.renderCurrent();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('is-active');
    document.body.style.overflow = '';

    if (this.triggerEl && typeof this.triggerEl.focus === 'function') {
      this.triggerEl.focus();
    }
  }
}

// Global Singleton Instance
let singleton = null;

export function initLightbox() {
  if (!singleton) {
    singleton = new SGALightbox();
  }
  return singleton;
}

export function openLightbox(index = 0, items = [], triggerElement = null) {
  const lb = initLightbox();
  lb.open(index, items, triggerElement);
}

// Attach to window for non-module usage if desired
if (typeof window !== 'undefined') {
  window.SGALightbox = {
    init: initLightbox,
    open: openLightbox
  };
}
