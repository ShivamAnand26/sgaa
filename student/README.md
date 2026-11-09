# SGA.IN Student Portal — Architectural Study Notes & Reading Platform

> Built for **SGA.IN (by NXT Services)** — an architectural planning, design studio, and study-notes platform. Built using **ONLY HTML, CSS, and vanilla JavaScript (ES modules)** under the **Zero-Setup Rule**.

---

## Zero-Setup Rule (Static Execution)
This application requires **no build step, no Node.js server, no database installation, and no API keys**.
You can run it directly:
- Using **VS Code Live Server** (right-click `student/student-login.html` or `index.html` → "Open with Live Server").
- Using any local static web server (e.g., `npx serve .` or Python `python3 -m http.server 3000`).
- By opening `index.html` directly in modern browsers.

External CDN dependencies used (no API keys required):
- **Three.js** (`0.160.0`): Procedural 3D drafting textbook stack and blueprint grid canvas on auth screens.
- **PDF.js** (`3.11.174`): In-browser canvas PDF rendering engine with free 3-page preview and full purchased reading.
- **jsPDF** (`2.5.1`): Client-side PDF generation for test purchase receipts and sample architectural note generation.
- **Google Fonts**: Cormorant Garamond (editorial serif) & Manrope (clean architectural sans).

---

## Demo Accounts & Instant Access
You can generate full demo data instantly via the **[Dev & QA Testing Tools](../client/dev-tools.html)** by clicking **"Generate Full Demo Data"**.

### Student Account:
- **Email**: `student@sga.in`
- **Password**: `Student123!`
- **Role**: `student`
- **Profile**: Aarav Mehta, 4th Year B.Arch, Architecture & Planning Institute

### Client Account (Cross-Portal Verification):
- **Email**: `client@sga.in`
- **Password**: `Client123!`
- **Role**: `client`

*Note: Attempting to log into the Student Portal with a client account will show a friendly role-rejection banner: "This is a student account area. Please use Client Login." and vice-versa.*

---

## Key Student Features & Workflows

1. **Authentication & Password Recovery**:
   - Student Signup with live password strength checklist (8+ chars, uppercase, lowercase, number, symbol).
   - Secure PBKDF2 Web Crypto password hashing (150,000 iterations, random 16-byte salt per user).
   - Password reset with honest demo mode code banner (`Demo mode: your reset code is XXXXXX`).

2. **Notes Catalog & Search (`browse-notes.html`)**:
   - Filter by architectural subject (Building Construction, Structural Systems, Architectural Design, Building Materials, Urban Planning, Estimation & Costing, Vastu Shastra, CAD & BIM).
   - Filter by category and price range slider (₹100 to ₹2,500).
   - Instant search by title, subject, faculty author, and syllabus keywords.
   - 3D hover card tilt and interactive bookmark/wishlist toggle.

3. **Note Details (`note-details.html`)**:
   - Comprehensive syllabus breakdown, table of contents (TOC), and what's included.
   - Verified student reviews and star rating distribution.
   - Review submission form (exclusive to verified note purchasers).
   - Instant "Buy Now" single-click checkout or "+ Add to Cart".
   - "Preview First 3 Pages" link into the document viewer.

4. **Cart & Simulated Checkout (`cart.html`)**:
   - Student cart storage per session.
   - Demo checkout modal with simulated credit card dialog and test buttons (**Simulate Success**, **Simulate Decline**, **Cancel**).
   - The UI **never** unlocks notes client-side; notes are unlocked only when `api.completePayment` verifies the order status.
   - Post-payment confirmation screen with instant **jsPDF Test Receipt Download**.

5. **My Purchases & Reading Library (`my-purchases.html`)**:
   - Grid and list of owned study notes with last page read and progress tracking percentage.
   - "Read" button (opens in-browser PDF reader).
   - "Download" button (increments download counter and serves watermarked PDF).

6. **In-Browser PDF.js Reader (`note-viewer.html`)**:
   - **Free Preview Mode**: Strictly limited to the first 3 pages. Page 4 displays a blurred locked placeholder prompting checkout.
   - **Purchased Full Mode**: Full access to all document pages, custom zoom controls, fullscreen mode, and direct PDF download.
   - **Anti-Piracy Watermark**: Faint diagonal overlay bearing the student's full name, email, and "SGA.IN Verified Purchase".
   - **Right-Click Deterrent**: Disables standard browser context menu.

7. **Payment History (`payment-history.html`)**:
   - Comprehensive ledger of all simulated payments, order IDs, date/time, and status badges.
   - Client-side tax invoice and receipt generator using jsPDF.

8. **Student Profile (`student-profile.html`)**:
   - Academic fields: Institution, Degree/Course, Year of Study.
   - Canvas square 256×256 avatar cropping and upload to IndexedDB.
   - Password change with salt re-generation.
   - Export student records as JSON (`SGA_Student_Data.json`).
   - Request account deletion flag.

---

## Moving to Production Backend & Razorpay Gateway

The frontend code communicates exclusively through `js/api.js`. In production:

1. **Replace `js/api.js` Internals with Real Fetch Calls**:
   - The method signatures (`getStudentDashboard`, `listNotes`, `createOrder`, `completePayment`, `getPurchasedNoteFile`) remain identical.
   - Return values match the `{ ok: true, data: ... }` response shape.

2. **Razorpay Production Integration**:
   - The production payment gateway code is pre-architected in `student/js/payments.js`.
   - Set `CONFIG.PAYMENT_PROVIDER = 'razorpay'` in `client/js/config.js`.
   - Include Razorpay Checkout script `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>`.
   - Create order on your server (`POST /api/orders`) using Razorpay Node/Python SDK.
   - Launch Razorpay checkout options (`key`, `order_id`, `handler`).
   - In `handler(response)`, send `razorpay_payment_id`, `razorpay_order_id`, and `razorpay_signature` to your server for HMAC-SHA256 signature verification before unlocking file access.

3. **Production File Protection**:
   - Replace in-browser IndexedDB storage with authenticated server endpoints (`GET /api/notes/:id/file`) streaming watermarked PDFs using server-side PDF manipulation libraries (e.g. `pdf-lib` or MuPDF) with short-lived presigned URLs.
