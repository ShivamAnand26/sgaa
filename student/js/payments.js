/**
 * SGA.IN Student Portal - Payments Gateway Adapter (payments.js)
 * The ONLY module that knows about the payment provider.
 * Currently runs "demo" provider (with explicit test simulation banner & controls).
 * Prepared with full architecture for Razorpay integration when moving to backend.
 */

import { CONFIG } from '../../client/js/config.js';
import { ui } from '../../client/js/ui.js';

export const payments = {
  /**
   * Start Checkout process for an Order
   * @param {Object} order - Order object created by api.createOrder()
   * @returns {Promise<{ ok: boolean, status: 'success' | 'failed' | 'cancelled', paymentId?: string, error?: string }>}
   */
  async startCheckout(order) {
    if (!order || !order.id || !order.totalAmount) {
      return { ok: false, status: 'failed', error: 'Invalid order details provided to checkout.' };
    }

    const provider = CONFIG.PAYMENT_PROVIDER || 'demo';

    if (provider === 'demo') {
      return this._openDemoModal(order);
    } else if (provider === 'razorpay') {
      return this._openRazorpayCheckout(order);
    } else {
      return { ok: false, status: 'failed', error: `Unknown payment provider: ${provider}` };
    }
  },

  /**
   * Internal Demo Checkout Modal
   */
  _openDemoModal(order) {
    return new Promise((resolve) => {
      // Remove any existing modal
      const existing = document.getElementById('sga-checkout-modal-backdrop');
      if (existing) existing.remove();

      const backdrop = document.createElement('div');
      backdrop.id = 'sga-checkout-modal-backdrop';
      backdrop.className = 'modal-backdrop is-open';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-label', 'SGA.IN Demo Checkout');

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.maxWidth = '520px';
      modal.style.padding = '0';
      modal.style.overflow = 'hidden';

      const itemsListHtml = order.items.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px dashed var(--sand); font-size:13px;">
          <div>
            <strong>${ui.createElement('span', '', item.title).outerHTML}</strong>
            <span style="display:block; font-size:11px; color:var(--muted);">${item.subject || 'Architecture'} · ${item.pages || 0} pages</span>
          </div>
          <span style="font-weight:600;">${ui.formatRupees(item.price)}</span>
        </div>
      `).join('');

      modal.innerHTML = `
        <!-- Permanent Test Mode Banner -->
        <div style="background:#FFF3E0; border-bottom:1px solid #FFE0B2; padding:10px 18px; display:flex; align-items:center; gap:10px; color:#E65100; font-size:11.5px; font-weight:600;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>TEST MODE. No real money is charged. No real payment is processed.</span>
        </div>

        <div style="padding:24px 28px;">
          <!-- Header -->
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px;">
            <div>
              <span class="section-label" style="margin-bottom:4px;">Checkout Summary</span>
              <h3 style="font-size:22px; margin:0;">Complete Purchase</h3>
              <p style="font-size:12px; color:var(--muted); margin-top:2px;">Order ID: <code>${order.id}</code></p>
            </div>
            <button type="button" id="demo-close-btn" class="modal-close" aria-label="Close checkout" style="position:static;">&times;</button>
          </div>

          <!-- Items Breakdown -->
          <div style="background:var(--sand-light); border:1px solid var(--sand); border-radius:10px; padding:12px 16px; margin-bottom:20px; max-height:160px; overflow-y:auto;">
            ${itemsListHtml}
            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; margin-top:4px; font-weight:700; font-size:15px; color:var(--ink);">
              <span>Total Payable</span>
              <span style="color:var(--copper); font-size:18px;">${ui.formatRupees(order.totalAmount)}</span>
            </div>
          </div>

          <!-- Mock Payment Method Box -->
          <div style="border:1px solid var(--sand); border-radius:10px; padding:14px 16px; margin-bottom:22px; background:var(--white);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <span style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted);">Payment Method (Test Simulation)</span>
              <span style="font-size:11px; color:#2F6B4F; font-weight:600; background:#E8F3ED; padding:2px 8px; border-radius:999px;">Mock UPI / Card</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px; font-size:13px; color:var(--ink);">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              <span>Test Architectural Student Card &bull;&bull;&bull;&bull; 4242</span>
            </div>
          </div>

          <!-- Action Buttons -->
          <div style="display:flex; flex-direction:column; gap:10px;">
            <button type="button" id="simulate-success-btn" class="btn btn-primary" style="width:100%; height:46px;">
              Simulate Successful Payment (${ui.formatRupees(order.totalAmount)})
            </button>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <button type="button" id="simulate-fail-btn" class="btn btn-danger btn-sm">
                Simulate Failed Payment
              </button>
              <button type="button" id="simulate-cancel-btn" class="btn btn-secondary btn-sm">
                Cancel Checkout
              </button>
            </div>
          </div>
        </div>
      `;

      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      const cleanup = (result) => {
        backdrop.classList.remove('is-open');
        setTimeout(() => backdrop.remove(), 250);
        resolve(result);
      };

      const successBtn = modal.querySelector('#simulate-success-btn');
      const failBtn = modal.querySelector('#simulate-fail-btn');
      const cancelBtn = modal.querySelector('#simulate-cancel-btn');
      const closeBtn = modal.querySelector('#demo-close-btn');

      successBtn?.addEventListener('click', () => {
        successBtn.disabled = true;
        successBtn.textContent = 'Processing simulated payment...';
        setTimeout(() => {
          const demoPaymentId = `DEMO_PAY_${Date.now().toString(36).toUpperCase()}`;
          cleanup({ ok: true, status: 'success', paymentId: demoPaymentId });
        }, 400);
      });

      failBtn?.addEventListener('click', () => {
        failBtn.disabled = true;
        cleanup({ ok: false, status: 'failed', error: 'Payment declined by card issuer (simulation).' });
      });

      cancelBtn?.addEventListener('click', () => cleanup({ ok: false, status: 'cancelled' }));
      closeBtn?.addEventListener('click', () => cleanup({ ok: false, status: 'cancelled' }));
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) cleanup({ ok: false, status: 'cancelled' });
      });

      document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', escHandler);
          cleanup({ ok: false, status: 'cancelled' });
        }
      });
    });
  },

  /**
   * =========================================================================
   * RAZORPAY ADAPTER (Commented Architectural Reference for Production)
   * =========================================================================
   * In a production server environment:
   * 1. Client calls backend: `POST /api/orders { noteIds: [...] }`.
   * 2. Backend initializes Razorpay instance with `KEY_ID` and `KEY_SECRET`.
   *    `const razorpayOrder = await razorpay.orders.create({ amount: totalInPaise, currency: "INR", receipt: orderId });`
   * 3. Client receives `razorpay_order_id` and opens Razorpay modal:
   *    ```javascript
   *    const options = {
   *      key: RAZORPAY_KEY_ID, // public key only, never secret
   *      amount: order.totalAmount * 100,
   *      currency: "INR",
   *      name: "SGA.IN Architectural Study Library",
   *      description: "Purchase study notes",
   *      order_id: razorpayOrderId,
   *      handler: async function (response) {
   *        // response has { razorpay_payment_id, razorpay_order_id, razorpay_signature }
   *        // Post to backend for HMAC SHA256 verification:
   *        // generated_signature = hmac_sha256(order_id + "|" + payment_id, secret);
   *        // If verified, backend unlocks note and marks purchase.
   *      },
   *      prefill: { name: student.name, email: student.email }
   *    };
   *    const rzp = new window.Razorpay(options);
   *    rzp.open();
   *    ```
   * 4. A webhook endpoint (`/api/webhooks/razorpay`) validates signatures as redundancy.
   * =========================================================================
   */
  async _openRazorpayCheckout(order) {
    console.warn('Razorpay adapter invoked in browser environment. Please configure backend server endpoints.');
    return { ok: false, status: 'failed', error: 'Razorpay requires backend server signature verification.' };
  }
};
