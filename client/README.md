# SGA.IN Client Portal (by NXT Services)

A client portal for **Shilp Griha Associate (SGA)**, designed for clients to submit architectural briefs, monitor 2D/3D design progress, track vertical milestone timelines, review drawing dossiers, and communicate directly with the design studio.

---

## 1. Zero-Setup Rule (How to Run)

The portal adheres to a **Zero-Setup Rule**:
- **No Node.js, no npm install, no database setup, no `.env` file, and no API keys required.**
- Open the project by launching a static local server (e.g. VS Code Live Server, Python `python3 -m http.server 3000`, or via Vite `npm run dev`) or opening `index.html` directly in any modern browser.
- CDN libraries loaded without API keys:
  - Cormorant Garamond & Manrope Google Fonts
  - Three.js `0.160.0` (for procedural isometric house geometry on auth screens)
  - Swiper `11` and GSAP `3.12.5` on the landing page

---

## 2. Testing with Dev Tools

An internal testing utility is provided at:
👉 **[`/client/dev-tools.html`](dev-tools.html)**

### What you can test in Dev Tools:
1. **Seed Demo Data**:
   - Generates a pre-configured client account:
     - **Email**: `client@sga.in`
     - **Password**: `Client123!`
   - Seeds realistic architectural design requests (`SGA-2026-0001`, `SGA-2026-0002`, `SGA-2026-0003`) across statuses: *Submitted*, *Under Review*, *Approved*, *In Progress*, and *Completed*.
2. **Timeline Status Switcher**:
   - Change any request's milestone status.
   - Enter a **Client-Visible Timeline Note** (shows up immediately on the client's vertical timeline).
   - Enter a **Private Internal Remark** (stored safely in studio records and never leaked to the client API response).
3. **Database Inspector & Clear Data**:
   - Live inspection of `sga_users`, `sga_requests`, `sga_notifications`, and session records.
   - One-click clear of all localStorage and IndexedDB files.

---

## 3. Browser Storage Architecture

All data is stored directly in your browser:
- **Structured Documents**: Stored under namespaced keys in `localStorage`:
  - `sga_users` (client profiles, PBKDF2 password hashes, salts, lockout states)
  - `sga_requests` (project specifications, floor areas, timelines, message threads)
  - `sga_notifications` (studio alerts and milestone updates)
  - `sga_sessions` (cryptographically random session tokens with expiration)
- **Binary Files & Avatars**: Uploaded PDFs, site photos, and cropped user avatars are stored as Blobs in browser `IndexedDB` (`sga_files_db`), keeping storage clean and quota-efficient.
- **Security**:
  - Passwords hashed using **Web Crypto API PBKDF2** with **SHA-256**, **150,000 iterations**, and unique 16-byte random salts.
  - Plain-text passwords and cryptographic hashes are never stored or exposed to UI scripts.
  - Account lockout after 5 consecutive failed attempts (15-minute lock).
  - Magic bytes file validation for PDF, JPG, and PNG uploads.
  - Multi-tab session synchronization: logging out in one tab invalidates all active tabs.

---

## 4. How to Switch to a Real Backend Later

All client pages communicate **exclusively** with `js/api.js`. The pages never touch `localStorage` or `IndexedDB` directly.

When migrating to a live Node.js/Go/Python REST or GraphQL backend, replace the internals of the functions in `js/api.js` with standard `fetch()` or `axios` calls:

| API Function | Endpoint Target |
| :--- | :--- |
| `register(data)` | `POST /api/v1/auth/register` |
| `login(data)` | `POST /api/v1/auth/login` |
| `logout()` | `POST /api/v1/auth/logout` |
| `getMe()` | `GET /api/v1/auth/me` |
| `forgotPassword(email)` | `POST /api/v1/auth/forgot-password` |
| `resetPassword(data)` | `POST /api/v1/auth/reset-password` |
| `getDashboard()` | `GET /api/v1/dashboard` |
| `createRequest(data)` | `POST /api/v1/requests` |
| `listRequests(query)` | `GET /api/v1/requests?...` |
| `getRequest(id)` | `GET /api/v1/requests/:id` |
| `addMessage(id, text)` | `POST /api/v1/requests/:id/messages` |
| `addFiles(id, files)` | `POST /api/v1/requests/:id/files` |
| `cancelRequest(id)` | `POST /api/v1/requests/:id/cancel` |
| `getFile(id)` | `GET /api/v1/files/:id` |
| `listNotifications()` | `GET /api/v1/notifications` |
| `markRead(id)` | `PATCH /api/v1/notifications/:id/read` |
| `markAllRead()` | `PATCH /api/v1/notifications/read-all` |
| `deleteNotification(id)` | `DELETE /api/v1/notifications/:id` |
| `getProfile()` | `GET /api/v1/profile` |
| `updateProfile(data)` | `PUT /api/v1/profile` |
| `uploadAvatar(blob)` | `POST /api/v1/profile/avatar` (multipart/form-data) |
| `changePassword(data)` | `POST /api/v1/profile/change-password` |
| `requestAccountDeletion()`| `POST /api/v1/profile/delete-request` |

**Page templates, DOM rendering, form validation, and CSS will remain 100% identical without any changes.**
