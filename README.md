# Shilp Griha Associate (SGA) — नक्शा सही, निर्माण सही

Architectural Planning, 2D Floor Plans, 3D Elevation, Interior Design, Construction Consultancy, and Student Learning Platform for **Shilp Griha Associate (SGA)**, led by **Ar. Vikas Verma**.

## Content Placeholders & Customisation Guide

- **Founder Portrait**: Ar. Vikas Verma's official photograph has been installed at `/public/assets/images/vikas-verma.jpg`. To update this image, replace this file or upload a new picture in the **Admin Panel → Content Management**.
- **Recent Work Project Slides**: 14 real architectural project renders and elevation concepts designed by Ar. Vikas Verma are installed at `/public/assets/images/portfolio/project-01.png` through `project-14.png` (featuring 3D residential elevations, master bedroom suites, classical bungalows, corporate workstations, commercial salons, and outdoor landscape pergolas).
  - **Recommended Dimensions & Aspect Ratio**: 1200×800px (3:2 aspect ratio) or 1200×900px (4:3 aspect ratio), minimum 800px wide. Formats: WebP, JPG, or PNG.
  - **How to Replace**: Upload new project photos and 3D elevation renders in **Admin Panel → Portfolio / Work**, or configure custom image paths in `/client/js/api.js` under `listHomeSliderWork()`.
- **Empty Links by Default**:
  - Google Review link, Instagram URL, and Justdial URL are empty by default.
  - According to brand requirements, any social or review button with an empty link is completely hidden from public view.
  - **How to Activate**: Enter the verified URLs in `/client/js/config.js` (`SOCIAL_LINKS` object) or update them in **Admin Panel → Settings**. Once configured, the button automatically renders on the website.
- **Logo Asset Note**: The official logo is located at `/public/assets/logo-full.png` (with circular monogram favicon at `/public/favicon.png`). On dark sections and footers, it is enclosed in an ivory rounded plate.

---

## Single Source of Truth — Business Information

- **Business Name**: Shilp Griha Associate (Short Name: SGA)
- **Principal Architect & Founder**: Ar. Vikas Verma, Architect
- **Official Hindi Tagline**: नक्शा सही, निर्माण सही
- **Phone**: +91 79854 36965 (Direct dial: `tel:+917985436965`; WhatsApp: `https://wa.me/917985436965`)
- **Email**: ar.vikasverma0401@gmail.com
- **Website Domain**: Read dynamically from `CONFIG.SITE_DOMAIN` (default: `www.sgaup31.in`)
- **Studio Address**: Laxmi Nagar Colony, Cinema Road, in front of Shree Siddhivinayak Palace, Gola Gokarnath, Lakhimpur Kheri, Uttar Pradesh 262802, India
- **Service Area**: Gola Gokarnath, Lakhimpur Kheri and nearby areas of Uttar Pradesh
- **Google Maps Directions Link**: [Get Directions](https://www.google.com/maps?gs_lcrp=EgZjaHJvbWUqCggAEAAY4wIYgAQyCggAEAAY4wIYgAQyDQgBEC4YrwEYxwEYgAQyBggCEEUYOTINCAMQABiGAxiABBiKBTINCAQQABiGAxiABBiKBTIKCAUQABiABBiiBDIKCAYQABiABBiiBDIGCAcQRRg80gEJMTA2NTRqMGo3qAIAsAIA&um=1&ie=UTF-8&fb=1&gl=in&sa=X&geocode=Kc-4FEcAQ585Metx1h-VJKp4&daddr=Gola+Gokaran+Nath,+Gola,+Uttar+Pradesh+262802)
- **Map Embed**: `https://www.google.com/maps?q=Gola+Gokaran+Nath,+Gola,+Uttar+Pradesh+262802&output=embed`

> **Note on Logo Assets**: The official logo is stored at `public/assets/logo-full.png` (circle monogram with house roof, "SHILP GRIHA ASSOCIATE", "Ar. Vikas Verma"). Because the logo artwork uses dark text, on dark backgrounds (such as the dark footer and dark sections) it is placed on a small ivory rounded plate (`background:var(--ivory)`) without modifying or redrawing the original logo. **Action item**: Please provide a transparent PNG and a white monochrome version of the logo for native dark background placement.

---

## Portals & Quick Links

### 1. Public Website
- [`/index.html`](index.html) — Shilp Griha Associate landing page with 3D villa model, story animation, testimonials, service catalog, WhatsApp chat, and embedded map with directions.
- [`/about.html`](about.html) — Dedicated 10-section About Us page: Practice overview, Ar. Vikas Verma profile & framed portrait, 6 architectural services, 10 project specialisation chips, 4 why-us commitments, 6-step timeline, 14+ item filtered project showcase with zoom lightbox, client testimonials, and studio location map.
- [`/notes.html`](notes.html) — Architectural study notes catalog and preview.

### 2. Client Portal (Architectural Planning & Requests)
- [Client Sign In](client/login.html) (`client@sga.in` / `Client123!`)
- [Register Client Account](client/register.html)
- [Client Dashboard](client/dashboard.html)
- [Submit Architectural Request](client/new-request.html)
- [My Requests & Timeline](client/my-requests.html)
- [Client Notifications](client/notifications.html)
- [Client Profile & Security](client/profile.html)
- [Client Portal Architecture Docs](client/README.md)

### 3. Student Portal (Study Notes, PDF Reader & Checkout)
- [Student Sign In](student/student-login.html) (`student@sga.in` / `Student123!`)
- [Register Student Account](student/student-register.html)
- [Student Dashboard](student/student-dashboard.html)
- [Browse Architectural Notes](student/browse-notes.html)
- [Shopping Cart & Demo Checkout](student/cart.html)
- [My Purchases & Library](student/my-purchases.html)
- [In-Browser PDF Document Reader](student/note-viewer.html)
- [Payment History & Receipts](student/payment-history.html)
- [Saved Notes Wishlist](student/wishlist.html)
- [Student Notifications](student/student-notifications.html)
- [Student Profile & Academic Records](student/student-profile.html)
- [Student Portal Architecture Docs](student/README.md)

### 4. Admin Management Console
- [Studio Admin Console](admin/admin-login.html) (`vikasverma_gola` / `Vikas@2026`)
- [Portfolio & Work Showcase Manager](admin/admin-portfolio.html)
- [Website Content & About Page CMS](admin/admin-content.html)
- [Project Proposals](admin/admin-proposals.html)
- [Client Requests](admin/admin-requests.html)
- [Payment Receipts](admin/admin-payments.html)

### 5. Developer & QA Testing Tools
- [`/client/dev-tools.html`](client/dev-tools.html) (or [`/dev-tools.html`](dev-tools.html))
  - Seed / Reset full workspace.
  - Study Notes Manager: Add, edit, delete notes, toggle published status, upload PDFs or auto-generate multi-page architectural PDFs.
  - Client Timeline & Status Simulator.
