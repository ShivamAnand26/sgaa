/**
 * SGA.IN Student Portal - Cart & Checkout Controller (cart.js)
 * Manages cart items, checkout simulation via payments.js,
 * post-purchase confirmation screen, and jsPDF test receipt generation.
 */

import { api } from '../../client/js/api.js';
import { ui } from '../../client/js/ui.js';
import { authGuard } from '../../client/js/auth-guard.js';
import { payments } from './payments.js';

export async function initCart() {
  const user = await authGuard.protect('student');
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();
  ui.updateCartBadge();

  // Populate header/sidebar
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  const headerAvatarEl = document.getElementById('header-avatar');
  const sidebarAvatarEl = document.getElementById('sidebar-avatar');
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);
  ui.renderAvatar(headerAvatarEl, user);
  ui.renderAvatar(sidebarAvatarEl, user);

  const cartList = document.getElementById('cart-items-container');
  const subtotalEl = document.getElementById('cart-subtotal');
  const totalEl = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('start-checkout-btn');
  const emptyCartState = document.getElementById('cart-empty-state');
  const cartContentWrap = document.getElementById('cart-content-wrap');
  const confirmationWrap = document.getElementById('order-confirmation-container');

  // Check if we arrived with a direct checkout order
  const urlParams = new URLSearchParams(window.location.search);
  const directOrderId = urlParams.get('checkoutOrder');

  async function loadCart() {
    const res = await api.getCart();
    if (!res.ok) {
      ui.showToast('Failed to load cart.', 'error');
      return;
    }

    const { items, subtotal, total } = res.data;

    if (!items || items.length === 0) {
      if (cartContentWrap) cartContentWrap.style.display = 'none';
      if (emptyCartState) emptyCartState.style.display = 'block';
      if (confirmationWrap) confirmationWrap.style.display = 'none';
      return;
    }

    if (cartContentWrap) cartContentWrap.style.display = 'grid';
    if (emptyCartState) emptyCartState.style.display = 'none';
    if (confirmationWrap) confirmationWrap.style.display = 'none';

    if (subtotalEl) subtotalEl.textContent = ui.formatRupees(subtotal);
    if (totalEl) totalEl.textContent = ui.formatRupees(total);

    if (cartList) {
      cartList.innerHTML = '';
      items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
          <div style="display:flex; align-items:center; gap:16px; min-width:0; flex:1;">
            <div style="width:52px; height:52px; border-radius:8px; background:linear-gradient(135deg, #FAF8F5, #EFE9E1); border:1px solid var(--sand); display:grid; place-items:center; color:var(--copper); flex-shrink:0;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            <div style="min-width:0;">
              <h4 style="font-family:var(--font-serif); font-size:17px; margin:0; line-height:1.2; color:var(--ink);">
                ${ui.createElement('span', '', item.title).outerHTML}
              </h4>
              <p style="font-size:11.5px; color:var(--muted); margin:3px 0 0;">${item.subject || 'Architecture'} · ${item.pages || 0} pages</p>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:16px; flex-shrink:0;">
            <span style="font-weight:700; font-size:16px; color:var(--ink);">${ui.formatRupees(item.price)}</span>
            <button type="button" class="file-remove-btn remove-cart-item-btn" data-note-id="${item.noteId}" aria-label="Remove item">&times;</button>
          </div>
        `;

        row.querySelector('.remove-cart-item-btn')?.addEventListener('click', async () => {
          await api.removeFromCart(item.noteId);
          ui.updateCartBadge();
          loadCart();
        });

        cartList.appendChild(row);
      });
    }

    // Checkout button handler
    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.onclick = async () => {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Initializing Checkout...';

        const noteIds = items.map(i => i.noteId);
        const orderRes = await api.createOrder(noteIds);

        if (!orderRes.ok) {
          checkoutBtn.disabled = false;
          checkoutBtn.textContent = `Proceed to Payment (${ui.formatRupees(total)})`;
          ui.showToast(orderRes.error || 'Failed to initiate order.', 'error');
          return;
        }

        executeCheckoutFlow(orderRes.data);
      };
    }
  }

  async function executeCheckoutFlow(order) {
    const payResult = await payments.startCheckout(order);

    const completeRes = await api.completePayment(order.id, payResult);

    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = 'Proceed to Payment';
    }

    if (completeRes.ok && completeRes.data.unlocked) {
      // Show confirmation screen
      showConfirmationScreen(completeRes.data);
      ui.updateCartBadge();
      ui.updateNotificationBadge();
    } else if (payResult.status === 'failed') {
      ui.showToast(payResult.error || 'Payment declined. Your cart has been preserved.', 'error');
    } else {
      ui.showToast('Checkout cancelled.', 'info');
    }
  }

  function showConfirmationScreen({ payment, order, purchases }) {
    if (cartContentWrap) cartContentWrap.style.display = 'none';
    if (emptyCartState) emptyCartState.style.display = 'none';
    if (!confirmationWrap) return;

    confirmationWrap.style.display = 'block';

    const orderIdEl = document.getElementById('conf-order-id');
    const paymentIdEl = document.getElementById('conf-payment-id');
    const amountEl = document.getElementById('conf-amount');
    const unlockedList = document.getElementById('conf-unlocked-notes');
    const receiptBtn = document.getElementById('download-receipt-btn');

    if (orderIdEl) orderIdEl.textContent = order.id;
    if (paymentIdEl) paymentIdEl.textContent = payment.id;
    if (amountEl) amountEl.textContent = ui.formatRupees(order.totalAmount);

    if (unlockedList) {
      unlockedList.innerHTML = '';
      order.items.forEach(item => {
        const li = document.createElement('li');
        li.style.padding = '8px 0';
        li.style.borderBottom = '1px solid var(--sand)';
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.innerHTML = `
          <span><strong>${ui.createElement('span', '', item.title).outerHTML}</strong> <small style="color:var(--muted)">(${item.subject})</small></span>
          <a href="note-viewer.html?id=${encodeURIComponent(item.noteId)}" class="btn btn-primary btn-sm" style="height:32px; padding:0 12px; font-size:11px;">Read Now &rarr;</a>
        `;
        unlockedList.appendChild(li);
      });
    }

    if (receiptBtn) {
      receiptBtn.onclick = () => {
        generatePdfReceipt(payment, order, user);
      };
    }

    window.scrollTo({ top: 80, behavior: 'smooth' });
  }

  /**
   * Client-side jsPDF Test Receipt Generator
   */
  function generatePdfReceipt(payment, order, student) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      ui.showToast('jsPDF library loading...', 'info');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      unit: 'mm',
      format: 'a4'
    });

    // Branding header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(196, 122, 59); // Copper
    doc.text('SGA.IN', 20, 24);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(111, 106, 100); // Muted
    doc.text('Shilp Griha · Architecture & Learning (by NXT Services)', 20, 30);
    doc.text('Official Study Notes Payment Receipt', 20, 35);

    // Test mode watermark banner
    doc.setFillColor(255, 243, 224);
    doc.rect(20, 42, 170, 10, 'F');
    doc.setTextColor(230, 81, 0);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('TEST RECEIPT · DEMO MODE (No real currency was exchanged)', 25, 48);

    // Meta details table
    doc.setTextColor(28, 27, 26);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Receipt Details', 20, 60);

    doc.setFont('helvetica', 'normal');
    doc.text(`Receipt / Payment ID: ${payment.id}`, 20, 67);
    doc.text(`Order Reference: ${order.id}`, 20, 73);
    doc.text(`Date & Time: ${ui.formatDateTime(payment.createdAt)}`, 20, 79);
    doc.text(`Payment Status: SUCCESSFUL`, 20, 85);

    // Student Info
    doc.setFont('helvetica', 'bold');
    doc.text('Billed To (Student)', 110, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${student.fullName}`, 110, 67);
    doc.text(`Email: ${student.email}`, 110, 73);
    doc.text(`College: ${student.college || 'Architecture Institute'}`, 110, 79);

    // Table Header
    doc.setFillColor(239, 233, 225); // Sand
    doc.rect(20, 95, 170, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Item Description', 24, 100);
    doc.text('Subject', 110, 100);
    doc.text('Amount (INR)', 160, 100);

    let y = 110;
    doc.setFont('helvetica', 'normal');
    order.items.forEach(item => {
      doc.text(item.title.substring(0, 40), 24, y);
      doc.text((item.subject || 'Architecture').substring(0, 20), 110, y);
      doc.text(`Rs. ${item.price}`, 160, y);
      y += 8;
    });

    // Total
    doc.setDrawColor(239, 233, 225);
    doc.line(20, y + 2, 190, y + 2);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Amount Paid:', 110, y + 10);
    doc.setTextColor(196, 122, 59);
    doc.text(`Rs. ${order.totalAmount}`, 160, y + 10);

    // Footer note
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(111, 106, 100);
    doc.text('This is an in-browser generated receipt for academic study notes on SGA.IN.', 20, 260);
    doc.text('Keep this receipt for your records. For questions, contact ar.vikasverma0401@gmail.com · +91 79854 36965', 20, 265);

    doc.save(`Receipt_${payment.id}.pdf`);
    ui.showToast('Test receipt PDF downloaded!', 'success');
  }

  // If page loaded with direct checkout parameter
  if (directOrderId) {
    const orders = api.getMe().then(async () => {
      // Find order
      const res = await api.getStudentDashboard();
      // Execute
    });
  }

  loadCart();
}
