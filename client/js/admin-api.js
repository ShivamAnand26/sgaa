/**
 * SGA Admin Panel - Browser Backend & Admin API (admin-api.js)
 * Architecture: Sits directly on top of db.js, crypto.js, and browser storage.
 * 
 * Replace the internals of these functions with fetch() calls when a real backend is added. Page code will not change.
 */

import { db } from './db.js';
import { cryptoService } from './crypto.js';
import { CONFIG } from './config.js';
import { firebaseDataService } from './firebase.js';

// Realistic network delay simulation
const delay = (ms = null) => {
  const d = ms || Math.floor(Math.random() * (CONFIG.API_DELAY_MAX - CONFIG.API_DELAY_MIN + 1)) + CONFIG.API_DELAY_MIN;
  return new Promise((resolve) => setTimeout(resolve, d));
};

const LOCKOUT_PREFIX = 'sga_admin_lockout_';

export const adminApi = {
  /**
   * Ensures default admin user (vikasverma_gola / Vikas@2026) is always seeded
   */
  async ensureDefaultAdmin() {
    try {
      const users = db.get(db.KEYS.USERS) || [];
      const adminExists = users.some(u => 
        u.role === 'admin' && (
          u.username === 'vikasverma_gola' || 
          u.email === 'vikasverma_gola@sga.in' ||
          u.email === 'vikasverma_gola'
        )
      );

      if (!adminExists) {
        const salt = cryptoService.generateSalt();
        const passwordHash = await cryptoService.hashPassword('Vikas@2026', salt);
        const adminUser = {
          id: 'ADM-VIKAS-01',
          username: 'vikasverma_gola',
          name: 'Vikas Verma',
          email: 'vikasverma_gola@sga.in',
          phone: '+91 79854 36965',
          role: 'admin',
          isSuperAdmin: true,
          salt,
          passwordHash,
          status: 'active',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };

        // If another legacy admin exists, keep them, but add this one
        users.push(adminUser);
        db.set(db.KEYS.USERS, users);
      }
    } catch (e) {
      console.warn('Error ensuring default admin:', e);
    }
  },

  /**
   * Check if any administrator account exists in the system
   */
  async hasAdminAccount() {
    await this.ensureDefaultAdmin();
    const users = db.get(db.KEYS.USERS);
    return users.some(u => u.role === 'admin');
  },

  /**
   * Setup initial first-time administrator account
   * ONLY succeeds if NO admin user exists currently.
   */
  async createFirstAdmin({ name, email, password, phone = '' }) {
    await delay(350);
    const users = db.get(db.KEYS.USERS);
    const existingAdmin = users.find(u => u.role === 'admin');
    if (existingAdmin) {
      return { ok: false, error: 'Setup is closed. An administrator account is already initialized.' };
    }

    if (!name || name.trim().length < 2) {
      return { ok: false, error: 'Please enter a valid administrator name.' };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return { ok: false, error: 'Please enter a valid administrator email.' };
    }
    if (!password || password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters with letters, numbers and symbols.' };
    }

    const salt = cryptoService.generateSalt();
    const passwordHash = await cryptoService.hashPassword(password, salt);
    const adminId = db.generateId('ADM');

    const newAdmin = {
      id: adminId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      role: 'admin',
      isSuperAdmin: true,
      salt,
      passwordHash,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };

    users.push(newAdmin);
    db.set(db.KEYS.USERS, users);

    // Create session token
    const token = cryptoService.generateSessionToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    
    const sessions = db.get(db.KEYS.SESSIONS);
    sessions.push({
      token,
      userId: newAdmin.id,
      userRole: 'admin',
      userEmail: newAdmin.email,
      userName: newAdmin.name,
      createdAt: new Date().toISOString(),
      expiresAt
    });
    db.set(db.KEYS.SESSIONS, sessions);

    sessionStorage.setItem('sga_auth_token', token);

    // Audit log
    await this.logActivity({
      adminId: newAdmin.id,
      adminName: newAdmin.name,
      adminEmail: newAdmin.email,
      action: 'ADMIN_SETUP',
      entityType: 'AUTH',
      entityId: newAdmin.id,
      summary: `Initial administrator account created for ${newAdmin.email}`
    });

    return {
      ok: true,
      data: {
        user: { id: newAdmin.id, name: newAdmin.name, email: newAdmin.email, role: 'admin' },
        token
      }
    };
  },

  /**
   * Administrator Login with lockout & remember-me protection
   */
  async adminLogin(identifier, password, rememberMe = false) {
    await delay(250);
    await this.ensureDefaultAdmin();
    const cleanId = (identifier || '').trim().toLowerCase();
    
    // Check lockout
    const lockoutKey = `${LOCKOUT_PREFIX}${cleanId}`;
    const lockoutData = localStorage.getItem(lockoutKey);
    if (lockoutData) {
      try {
        const { attempts, lockedUntil } = JSON.parse(lockoutData);
        if (lockedUntil && Date.now() < lockedUntil) {
          const remainingMinutes = Math.ceil((lockedUntil - Date.now()) / (60 * 1000));
          return {
            ok: false,
            error: `Account locked due to 5 consecutive failed attempts. Try again in ${remainingMinutes} minute(s).`
          };
        }
      } catch (e) {
        localStorage.removeItem(lockoutKey);
      }
    }

    const users = db.get(db.KEYS.USERS) || [];
    const user = users.find(u => 
      u.role === 'admin' && (
        (u.username && u.username.toLowerCase() === cleanId) ||
        (u.email && u.email.toLowerCase() === cleanId) ||
        (cleanId === 'vikasverma_gola' && (u.username === 'vikasverma_gola' || u.email.includes('vikasverma_gola')))
      )
    );

    if (!user || user.role !== 'admin') {
      this.recordFailedAttempt(cleanId);
      return { ok: false, error: 'Invalid administrator credentials.' };
    }

    if (user.status === 'suspended') {
      return { ok: false, error: 'This administrator account has been suspended.' };
    }

    let isValid = false;
    if (user.salt && user.passwordHash) {
      isValid = await cryptoService.verifyPassword(password, user.salt, user.passwordHash);
    }
    // Direct check fallback for initial root admin Vikas@2026
    if (!isValid && cleanId === 'vikasverma_gola' && password === 'Vikas@2026') {
      isValid = true;
      // Re-hash to maintain crypto integrity
      const newSalt = cryptoService.generateSalt();
      user.salt = newSalt;
      user.passwordHash = await cryptoService.hashPassword(password, newSalt);
      db.set(db.KEYS.USERS, users);
    }

    if (!isValid) {
      this.recordFailedAttempt(cleanId);
      return { ok: false, error: 'Invalid administrator credentials.' };
    }

    // Success: clear lockout
    localStorage.removeItem(lockoutKey);

    // Update last login
    user.lastLoginAt = new Date().toISOString();
    db.set(db.KEYS.USERS, users);

    // Generate session
    const token = cryptoService.generateSessionToken();
    const durationHours = rememberMe ? (30 * 24) : 8;
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

    const sessions = db.get(db.KEYS.SESSIONS);
    sessions.push({
      token,
      userId: user.id,
      userRole: 'admin',
      userEmail: user.email,
      userName: user.name,
      rememberMe: Boolean(rememberMe),
      createdAt: new Date().toISOString(),
      expiresAt
    });
    db.set(db.KEYS.SESSIONS, sessions);

    // Save token
    if (rememberMe) {
      localStorage.setItem('sga_auth_token', token);
    } else {
      sessionStorage.setItem('sga_auth_token', token);
    }

    await this.logActivity({
      adminId: user.id,
      adminName: user.name,
      adminEmail: user.email,
      action: 'LOGIN',
      entityType: 'AUTH',
      entityId: user.id,
      summary: `Administrator signed in (${user.email})`
    });

    return {
      ok: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: 'admin', isSuperAdmin: user.isSuperAdmin },
        token
      }
    };
  },

  /**
   * Helper to handle failed login count
   */
  recordFailedAttempt(email) {
    if (!email) return;
    const key = `${LOCKOUT_PREFIX}${email}`;
    let attempts = 1;
    let lockedUntil = null;
    const existing = localStorage.getItem(key);
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        attempts = (parsed.attempts || 0) + 1;
      } catch (e) {
        attempts = 1;
      }
    }
    if (attempts >= 5) {
      lockedUntil = Date.now() + 15 * 60 * 1000; // 15 mins
    }
    localStorage.setItem(key, JSON.stringify({ attempts, lockedUntil }));
  },

  /**
   * Verify session token and require role: "admin"
   */
  async requireAdmin() {
    const token = localStorage.getItem('sga_auth_token') || sessionStorage.getItem('sga_auth_token');
    if (!token) {
      return { ok: false, error: 'Authentication required. No active session found.', code: 'UNAUTHORIZED' };
    }

    const sessions = db.get(db.KEYS.SESSIONS);
    const session = sessions.find(s => s.token === token);
    if (!session) {
      return { ok: false, error: 'Session expired or invalid.', code: 'SESSION_EXPIRED' };
    }

    if (new Date(session.expiresAt) < new Date()) {
      // Remove expired
      const remaining = sessions.filter(s => s.token !== token);
      db.set(db.KEYS.SESSIONS, remaining);
      localStorage.removeItem('sga_auth_token');
      sessionStorage.removeItem('sga_auth_token');
      return { ok: false, error: 'Session has expired. Please sign in again.', code: 'SESSION_EXPIRED' };
    }

    if (session.userRole !== 'admin') {
      return { ok: false, error: 'Forbidden: Administrator privileges required.', code: 'FORBIDDEN' };
    }

    const users = db.get(db.KEYS.USERS);
    const user = users.find(u => u.id === session.userId);
    if (!user || user.role !== 'admin' || user.status === 'suspended') {
      return { ok: false, error: 'Administrator user not found or suspended.', code: 'FORBIDDEN' };
    }

    return {
      ok: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: 'admin', isSuperAdmin: user.isSuperAdmin },
        session
      }
    };
  },

  /**
   * Admin Logout
   */
  async adminLogout() {
    await delay(120);
    const token = localStorage.getItem('sga_auth_token') || sessionStorage.getItem('sga_auth_token');
    if (token) {
      const sessions = db.get(db.KEYS.SESSIONS);
      const activeSession = sessions.find(s => s.token === token);
      if (activeSession) {
        await this.logActivity({
          adminId: activeSession.userId,
          adminName: activeSession.userName,
          adminEmail: activeSession.userEmail,
          action: 'LOGOUT',
          entityType: 'AUTH',
          entityId: activeSession.userId,
          summary: `Administrator signed out`
        });
      }
      const remaining = sessions.filter(s => s.token !== token);
      db.set(db.KEYS.SESSIONS, remaining);
    }
    localStorage.removeItem('sga_auth_token');
    sessionStorage.removeItem('sga_auth_token');
    return { ok: true };
  },

  /**
   * Audit logging
   */
  async logActivity({ adminId, adminName, adminEmail, action, entityType, entityId, summary, details = {} }) {
    try {
      const logs = db.get(db.KEYS.ACTIVITY_LOG) || [];
      const record = {
        id: db.generateId('LOG'),
        adminId: adminId || 'SYSTEM',
        adminName: adminName || 'System Admin',
        adminEmail: adminEmail || 'admin@sga.in',
        action: action || 'MUTATION',
        entityType: entityType || 'GENERAL',
        entityId: entityId || 'N/A',
        summary: summary || 'System mutation',
        details,
        timestamp: new Date().toISOString()
      };
      logs.unshift(record);
      // Keep recent 500 records
      db.set(db.KEYS.ACTIVITY_LOG, logs.slice(0, 500));
      return record;
    } catch (e) {
      console.warn('Could not record activity log:', e);
      return null;
    }
  },

  async getActivityLogs(limit = 100) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(150);
    const logs = db.get(db.KEYS.ACTIVITY_LOG) || [];
    return { ok: true, data: logs.slice(0, limit) };
  },

  /**
   * Overview & Analytics KPI Metrics
   */
  async getOverviewMetrics(range = '30d') {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(250);

    const orders = db.get(db.KEYS.ORDERS) || [];
    const payments = db.get(db.KEYS.PAYMENTS) || [];
    const students = (db.get(db.KEYS.USERS) || []).filter(u => u.role === 'student');
    const clients = (db.get(db.KEYS.USERS) || []).filter(u => u.role === 'client');
    const requests = db.get(db.KEYS.REQUESTS) || [];
    const notes = db.get(db.KEYS.NOTES) || [];
    const proposals = db.get(db.KEYS.PROPOSALS) || [];

    // Filter by days
    const days = range === '7d' ? 7 : range === '90d' ? 90 : range === '1y' ? 365 : 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const periodOrders = orders.filter(o => new Date(o.createdAt || o.date) >= cutoff);
    const successfulOrders = periodOrders.filter(o => o.status === 'completed' || o.paymentStatus === 'paid');
    
    const grossRevenue = successfulOrders.reduce((sum, o) => sum + (Number(o.totalAmount || o.amount) || 0), 0);
    const activeRequests = requests.filter(r => !['completed', 'cancelled'].includes(r.status));
    const pendingProposals = proposals.filter(p => p.status === 'sent' || p.status === 'draft');

    // Attention flags
    const attention = {
      unreviewedRequests: requests.filter(r => r.status === 'submitted' || r.status === 'in_review').length,
      pendingProposals: pendingProposals.length,
      unreadMessages: (db.get(db.KEYS.CONTACT_MESSAGES) || []).filter(m => m.status === 'unread').length,
      expiringProposals: proposals.filter(p => p.status === 'sent' && new Date(p.expiresAt) < new Date(Date.now() + 3 * 86400000)).length
    };

    return {
      ok: true,
      data: {
        grossRevenue,
        ordersCount: successfulOrders.length,
        totalStudents: students.length,
        totalClients: clients.length,
        activeRequestsCount: activeRequests.length,
        publishedNotesCount: notes.filter(n => n.status === 'published').length,
        attention,
        recentOrders: orders.slice(0, 5),
        recentRequests: requests.slice(0, 5)
      }
    };
  },

  /**
   * STUDY NOTES CRUD (with cross-browser Server Backend & Firestore synchronization)
   */
  async getNotes() {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(100);

    let localNotes = db.get(db.KEYS.NOTES) || [];

    // 0. Primary: Sync from Server Database Backend (/api/notes)
    try {
      const resp = await fetch('/api/notes');
      if (resp.ok) {
        const json = await resp.json();
        if (json.ok && Array.isArray(json.data)) {
          localNotes = json.data;
          db.set(db.KEYS.NOTES, localNotes);
          return { ok: true, data: localNotes };
        }
      }
    } catch (apiErr) {
      console.warn('[Server DB] Admin getNotes fetch note:', apiErr);
    }

    // Fallback sync from Firestore if server is unreachable
    try {
      const fbRes = await firebaseDataService.getNotes();
      if (fbRes.ok && fbRes.data && Array.isArray(fbRes.data)) {
        const mergedMap = new Map();
        localNotes.forEach(n => mergedMap.set(n.id, n));
        fbRes.data.forEach(n => mergedMap.set(n.id, { ...mergedMap.get(n.id), ...n }));
        localNotes = Array.from(mergedMap.values());
        db.set(db.KEYS.NOTES, localNotes);
      }
    } catch (e) {
      console.warn('[Firebase] Admin getNotes cloud sync warning:', e);
    }

    return { ok: true, data: localNotes };
  },

  async getNote(id) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(80);
    let notes = db.get(db.KEYS.NOTES) || [];
    let note = notes.find(n => n.id === id);

    if (!note) {
      try {
        const fbRes = await firebaseDataService.getNote(id);
        if (fbRes.ok && fbRes.data) {
          note = fbRes.data;
          notes.unshift(note);
          db.set(db.KEYS.NOTES, notes);
        }
      } catch (e) {}
    }

    if (!note) return { ok: false, error: 'Study note not found' };
    return { ok: true, data: note };
  },

  async createNote(data) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(200);

    const notes = db.get(db.KEYS.NOTES) || [];
    const isPublished = data.published === true || data.status === 'published';
    const pages = Math.max(1, parseInt(data.pages || data.pageCount, 10) || 12);
    const fileId = data.fileId || data.fileBlobId || null;
    const topics = Array.isArray(data.keyTopics)
      ? data.keyTopics
      : (data.keyTopics ? data.keyTopics.split(',').map(s => s.trim()).filter(Boolean) : []);
    const toc = Array.isArray(data.tableOfContents) && data.tableOfContents.length > 0
      ? data.tableOfContents
      : (topics.length > 0 ? topics : [
          '1. Theoretical Framework & Core Principles',
          '2. Statutory Standards & Building Codes',
          '3. Numerical Calculations & Formula Sheets',
          '4. Construction Blueprints & Detail Sections'
        ]);

    const newNote = {
      id: db.generateId('NOTE'),
      title: data.title?.trim() || 'Untitled Architectural Note',
      subject: data.subject?.trim() || 'General Architecture',
      category: data.category || 'Structures & Engineering',
      price: Math.max(0, Number(data.price) || 0),
      pages: pages,
      pageCount: pages,
      previewPages: Math.max(1, parseInt(data.previewPages, 10) || 3),
      description: data.description?.trim() || '',
      author: data.author?.trim() || 'SGA Studio Faculty',
      language: data.language || 'English',
      keyTopics: topics,
      tableOfContents: toc,
      includedItems: data.includedItems || [
        'Complete high-resolution PDF document',
        'Vector drafting diagrams & structural details',
        'Watermarked offline study copy',
        'Exam-oriented summary & formula sheets'
      ],
      fileId: fileId,
      fileBlobId: fileId,
      driveFileId: data.driveFileId || null,
      coverBlobId: data.coverBlobId || null,
      coverUrl: data.coverUrl || '',
      status: isPublished ? 'published' : 'draft',
      published: isPublished,
      version: 1,
      salesCount: 0,
      rating: Number(data.rating) || 5.0,
      initialRating: Number(data.rating) || 5.0,
      reviewCount: Number(data.reviewCount) || 12,
      initialReviewCount: Number(data.reviewCount) || 12,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    notes.unshift(newNote);
    db.set(db.KEYS.NOTES, notes);

    // Sync to Server Database Backend
    try {
      const srvResp = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNote)
      });
      if (srvResp.ok) {
        const srvJson = await srvResp.json();
        if (srvJson.ok && srvJson.data) {
          Object.assign(newNote, srvJson.data);
        }
      }
    } catch (e) {
      console.warn('[Server DB] createNote sync note:', e);
    }

    // Background sync to Firestore (non-blocking)
    firebaseDataService.saveNote(newNote).catch(e => {
      console.warn('[Firebase] Note cloud sync warning:', e);
    });

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'NOTE_CREATED',
      entityType: 'NOTE',
      entityId: newNote.id,
      summary: `Created and published study note "${newNote.title}"`
    });

    return { ok: true, data: newNote };
  },

  async updateNote(id, updates) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(100);

    const notes = db.get(db.KEYS.NOTES) || [];
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) return { ok: false, error: 'Note not found' };

    const existing = notes[index];
    const isPublished = updates.published !== undefined
      ? Boolean(updates.published)
      : (updates.status !== undefined ? updates.status === 'published' : existing.published !== false);

    const pages = Math.max(1, parseInt(updates.pages || updates.pageCount || existing.pages || existing.pageCount, 10) || 12);
    const fileId = updates.fileId || updates.fileBlobId || existing.fileId || existing.fileBlobId || null;

    notes[index] = {
      ...existing,
      ...updates,
      pages,
      pageCount: pages,
      fileId,
      fileBlobId: fileId,
      driveFileId: updates.driveFileId !== undefined ? updates.driveFileId : existing.driveFileId,
      published: isPublished,
      status: isPublished ? 'published' : 'draft',
      updatedAt: new Date().toISOString()
    };
    db.set(db.KEYS.NOTES, notes);

    // Sync to Server Database Backend
    try {
      const srvResp = await fetch(`/api/notes/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notes[index])
      });
      if (srvResp.ok) {
        const srvJson = await srvResp.json();
        if (srvJson.ok && srvJson.data) {
          Object.assign(notes[index], srvJson.data);
        }
      }
    } catch (e) {
      console.warn('[Server DB] updateNote sync note:', e);
    }

    // Background sync to Firestore (non-blocking)
    firebaseDataService.saveNote(notes[index]).catch(e => {
      console.warn('[Firebase] Note cloud update warning:', e);
    });

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'NOTE_UPDATED',
      entityType: 'NOTE',
      entityId: id,
      summary: `Updated study note "${notes[index].title}"`
    });

    return { ok: true, data: notes[index] };
  },

  async deleteNote(id) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(100);

    const notes = db.get(db.KEYS.NOTES) || [];
    const note = notes.find(n => n.id === id);
    if (!note) return { ok: false, error: 'Note not found' };

    const remaining = notes.filter(n => n.id !== id);
    db.set(db.KEYS.NOTES, remaining);

    // Sync to Server Database Backend
    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('[Server DB] deleteNote sync note:', e);
    }

    // Background sync to Firestore (non-blocking)
    firebaseDataService.deleteNote(id).catch(e => {
      console.warn('[Firebase] Note cloud delete warning:', e);
    });

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'NOTE_DELETED',
      entityType: 'NOTE',
      entityId: id,
      summary: `Deleted note "${note.title}"`
    });

    return { ok: true };
  },

  /**
   * SUBJECTS MANAGEMENT (DYNAMIC, ADMIN CONTROLLED)
   */
  async listSubjects() {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(80);

    const notes = db.get(db.KEYS.NOTES) || [];
    const subjects = db.get(db.KEYS.SUBJECTS) || [];

    // Map each subject with attached note count (all notes, draft and published)
    const list = subjects.map(s => {
      const sName = s.name.toLowerCase().trim();
      const count = notes.filter(n => n.subject && n.subject.toLowerCase().trim() === sName).length;
      return {
        ...s,
        noteCount: count
      };
    });

    return { ok: true, data: list };
  },

  async addSubject(name) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);

    const clean = (name || '').trim();
    if (!clean) return { ok: false, error: 'Subject name is required.' };
    if (clean.length > 60) return { ok: false, error: 'Subject name must be under 60 characters.' };

    const subjects = db.get(db.KEYS.SUBJECTS) || [];
    const lower = clean.toLowerCase();
    const existing = subjects.find(s => s.name.toLowerCase().trim() === lower);
    if (existing) {
      return { ok: true, data: existing }; // Re-use duplicate gracefully
    }

    const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'subject';
    const newSub = {
      id: 'SUB_' + Math.random().toString(36).substr(2, 9),
      name: clean,
      slug,
      createdAt: new Date().toISOString()
    };

    subjects.push(newSub);
    db.set(db.KEYS.SUBJECTS, subjects);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'SUBJECT_CREATED',
      entityType: 'SUBJECT',
      entityId: newSub.id,
      summary: `Added new academic subject "${clean}"`
    });

    return { ok: true, data: newSub };
  },

  async renameSubject(id, newName) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);

    const clean = (newName || '').trim();
    if (!clean) return { ok: false, error: 'New subject name is required.' };
    if (clean.length > 60) return { ok: false, error: 'Subject name must be under 60 characters.' };

    const subjects = db.get(db.KEYS.SUBJECTS) || [];
    const subIdx = subjects.findIndex(s => s.id === id);
    if (subIdx === -1) return { ok: false, error: 'Subject not found.' };

    const oldName = subjects[subIdx].name;
    const lower = clean.toLowerCase();
    const collision = subjects.find(s => s.id !== id && s.name.toLowerCase().trim() === lower);
    if (collision) return { ok: false, error: `Subject "${clean}" already exists.` };

    const newSlug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    subjects[subIdx].name = clean;
    subjects[subIdx].slug = newSlug;
    db.set(db.KEYS.SUBJECTS, subjects);

    // Update notes referencing oldName
    const notes = db.get(db.KEYS.NOTES) || [];
    let updatedCount = 0;
    notes.forEach(n => {
      if (n.subject && n.subject.toLowerCase().trim() === oldName.toLowerCase().trim()) {
        n.subject = clean;
        updatedCount++;
      }
    });
    if (updatedCount > 0) {
      db.set(db.KEYS.NOTES, notes);
    }

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'SUBJECT_RENAMED',
      entityType: 'SUBJECT',
      entityId: id,
      summary: `Renamed subject "${oldName}" to "${clean}" (${updatedCount} notes updated)`
    });

    return { ok: true, data: subjects[subIdx] };
  },

  async deleteSubject(id, targetSubjectIdToMove = null) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(140);

    const subjects = db.get(db.KEYS.SUBJECTS) || [];
    const sub = subjects.find(s => s.id === id);
    if (!sub) return { ok: false, error: 'Subject not found.' };

    const notes = db.get(db.KEYS.NOTES) || [];
    const attachedNotes = notes.filter(n => n.subject && n.subject.toLowerCase().trim() === sub.name.toLowerCase().trim());

    if (attachedNotes.length > 0) {
      if (!targetSubjectIdToMove) {
        return {
          ok: false,
          hasNotes: true,
          noteCount: attachedNotes.length,
          error: `Cannot delete: ${attachedNotes.length} note(s) use this subject. Please choose another subject to move them to.`
        };
      }

      const targetSub = subjects.find(s => s.id === targetSubjectIdToMove && s.id !== id);
      if (!targetSub) {
        return { ok: false, error: 'Invalid destination subject selected for moving notes.' };
      }

      // Move notes to target subject
      attachedNotes.forEach(n => {
        n.subject = targetSub.name;
      });
      db.set(db.KEYS.NOTES, notes);
    }

    const filtered = subjects.filter(s => s.id !== id);
    db.set(db.KEYS.SUBJECTS, filtered);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'SUBJECT_DELETED',
      entityType: 'SUBJECT',
      entityId: id,
      summary: `Deleted subject "${sub.name}"${attachedNotes.length > 0 ? ` (reassigned ${attachedNotes.length} notes)` : ''}`
    });

    return { ok: true };
  },

  /**
   * STUDENTS CRM
   */
  async getStudents(query = '') {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(180);

    let students = (db.get(db.KEYS.USERS) || []).filter(u => u.role === 'student');
    if (query) {
      const q = query.toLowerCase();
      students = students.filter(s => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q));
    }

    const purchases = db.get(db.KEYS.PURCHASES) || [];
    // enrich with note counts
    const enriched = students.map(s => {
      const userPurchases = purchases.filter(p => p.studentId === s.id || p.studentEmail === s.email);
      return {
        ...s,
        notesOwnedCount: userPurchases.length,
        lastActivity: s.lastLoginAt || s.createdAt
      };
    });

    return { ok: true, data: enriched };
  },

  async getStudentDetails(id) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(150);

    const users = db.get(db.KEYS.USERS) || [];
    const student = users.find(u => u.id === id && u.role === 'student');
    if (!student) return { ok: false, error: 'Student not found' };

    const purchases = db.get(db.KEYS.PURCHASES) || [];
    const studentPurchases = purchases.filter(p => p.studentId === student.id || p.studentEmail === student.email);
    const orders = (db.get(db.KEYS.ORDERS) || []).filter(o => o.studentId === student.id || o.studentEmail === student.email);

    return {
      ok: true,
      data: {
        student,
        purchases: studentPurchases,
        orders
      }
    };
  },

  async grantNoteAccess(studentId, noteId) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(200);

    const users = db.get(db.KEYS.USERS) || [];
    const student = users.find(u => u.id === studentId);
    const notes = db.get(db.KEYS.NOTES) || [];
    const note = notes.find(n => n.id === noteId);

    if (!student || !note) return { ok: false, error: 'Student or note not found' };

    const purchases = db.get(db.KEYS.PURCHASES) || [];
    const alreadyOwns = purchases.some(p => (p.studentId === studentId || p.studentEmail === student.email) && p.noteId === noteId);
    if (alreadyOwns) {
      return { ok: false, error: 'Student already has access to this study note.' };
    }

    const grantRecord = {
      id: db.generateId('PURCH'),
      orderId: db.generateId('ORD-ADMIN'),
      studentId: student.id,
      studentEmail: student.email,
      studentName: student.name,
      noteId: note.id,
      noteTitle: note.title,
      price: 0,
      grantedByAdmin: true,
      purchasedAt: new Date().toISOString()
    };

    purchases.push(grantRecord);
    db.set(db.KEYS.PURCHASES, purchases);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'ACCESS_GRANTED',
      entityType: 'STUDENT',
      entityId: studentId,
      summary: `Admin granted manual access for note "${note.title}" to student ${student.email}`
    });

    return { ok: true, data: grantRecord };
  },

  async revokeNoteAccess(studentId, noteId) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(180);

    const purchases = db.get(db.KEYS.PURCHASES) || [];
    const filtered = purchases.filter(p => !((p.studentId === studentId || p.studentEmail === studentId) && p.noteId === noteId));
    db.set(db.KEYS.PURCHASES, filtered);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'ACCESS_REVOKED',
      entityType: 'STUDENT',
      entityId: studentId,
      summary: `Admin revoked access for note ${noteId} from student ${studentId}`
    });

    return { ok: true };
  },

  async generateStudentResetCode(studentId) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(150);

    const users = db.get(db.KEYS.USERS) || [];
    const student = users.find(u => u.id === studentId);
    if (!student) return { ok: false, error: 'Student not found' };

    const resetCode = cryptoService.generate6DigitCode();
    student.resetCode = resetCode;
    student.resetCodeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.set(db.KEYS.USERS, users);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'RESET_CODE_GENERATED',
      entityType: 'STUDENT',
      entityId: studentId,
      summary: `Generated one-time temporary password reset code for student ${student.email}`
    });

    return { ok: true, data: { resetCode, expiry: student.resetCodeExpiry } };
  },

  async addStudentRemark(studentId, remarkText) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);

    const users = db.get(db.KEYS.USERS) || [];
    const student = users.find(u => u.id === studentId);
    if (!student) return { ok: false, error: 'Student not found' };

    student.adminRemarks = student.adminRemarks || [];
    student.adminRemarks.push({
      id: db.generateId('REM'),
      text: remarkText.trim(),
      adminName: auth.data.user.name,
      createdAt: new Date().toISOString()
    });
    db.set(db.KEYS.USERS, users);

    return { ok: true, data: student.adminRemarks };
  },

  /**
   * PURCHASES & ORDERS
   */
  async getPurchases(filters = {}) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(180);

    let orders = db.get(db.KEYS.ORDERS) || [];
    if (filters.studentEmail) {
      orders = orders.filter(o => o.studentEmail?.toLowerCase() === filters.studentEmail.toLowerCase());
    }
    if (filters.status) {
      orders = orders.filter(o => o.status === filters.status);
    }
    return { ok: true, data: orders };
  },

  /**
   * PAYMENTS & REFUNDS
   */
  async getPayments() {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(180);
    return { ok: true, data: db.get(db.KEYS.PAYMENTS) || [] };
  },

  async processRefund(paymentId, amount, reason) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(300);

    const payments = db.get(db.KEYS.PAYMENTS) || [];
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return { ok: false, error: 'Payment record not found' };

    const refunds = db.get(db.KEYS.REFUNDS) || [];
    const refundRecord = {
      id: db.generateId('REF'),
      paymentId,
      orderId: payment.orderId,
      studentId: payment.studentId,
      amount: Number(amount) || payment.amount,
      reason: reason || 'Client requested refund',
      status: 'processed',
      processedBy: auth.data.user.name,
      processedAt: new Date().toISOString()
    };

    refunds.push(refundRecord);
    db.set(db.KEYS.REFUNDS, refunds);

    payment.status = 'refunded';
    payment.refundId = refundRecord.id;
    db.set(db.KEYS.PAYMENTS, payments);

    // Update order status
    const orders = db.get(db.KEYS.ORDERS) || [];
    const order = orders.find(o => o.id === payment.orderId);
    if (order) {
      order.status = 'refunded';
      db.set(db.KEYS.ORDERS, orders);
    }

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'PAYMENT_REFUNDED',
      entityType: 'PAYMENT',
      entityId: paymentId,
      summary: `Processed ₹${refundRecord.amount} refund for payment ${paymentId}`
    });

    return { ok: true, data: refundRecord };
  },

  /**
   * COUPONS CRUD
   */
  async getCoupons() {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);
    return { ok: true, data: db.get(db.KEYS.COUPONS) || [] };
  },

  async createCoupon(data) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(200);

    const coupons = db.get(db.KEYS.COUPONS) || [];
    const code = (data.code || '').trim().toUpperCase();
    if (!code) return { ok: false, error: 'Coupon code cannot be empty' };

    if (coupons.some(c => c.code === code)) {
      return { ok: false, error: `Coupon code "${code}" already exists.` };
    }

    const newCoupon = {
      id: db.generateId('CPN'),
      code,
      discountType: data.discountType || 'percent', // 'percent' | 'flat'
      discountValue: Number(data.discountValue) || 10,
      minOrderValue: Number(data.minOrderValue) || 0,
      maxDiscount: data.maxDiscount ? Number(data.maxDiscount) : null,
      maxUses: data.maxUses ? Number(data.maxUses) : null,
      usedCount: 0,
      active: data.active !== false,
      expiresAt: data.expiresAt || null,
      createdAt: new Date().toISOString()
    };

    coupons.push(newCoupon);
    db.set(db.KEYS.COUPONS, coupons);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'COUPON_CREATED',
      entityType: 'COUPON',
      entityId: newCoupon.id,
      summary: `Created discount coupon ${newCoupon.code}`
    });

    return { ok: true, data: newCoupon };
  },

  async updateCoupon(id, updates) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(150);

    const coupons = db.get(db.KEYS.COUPONS) || [];
    const index = coupons.findIndex(c => c.id === id);
    if (index === -1) return { ok: false, error: 'Coupon not found' };

    coupons[index] = { ...coupons[index], ...updates };
    db.set(db.KEYS.COUPONS, coupons);

    return { ok: true, data: coupons[index] };
  },

  async deleteCoupon(id) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);

    const coupons = db.get(db.KEYS.COUPONS) || [];
    const remaining = coupons.filter(c => c.id !== id);
    db.set(db.KEYS.COUPONS, remaining);

    return { ok: true };
  },

  /**
   * DESIGN REQUESTS CRM & KANBAN
   */
  async getRequests(filters = {}) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(180);

    // Local requests
    let requests = db.get(db.KEYS.REQUESTS) || [];
    if (filters.status && filters.status !== 'all') {
      requests = requests.filter(r => r.status === filters.status);
    }
    return { ok: true, data: requests };
  },

  async getRequest(id) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);

    const requests = db.get(db.KEYS.REQUESTS) || [];
    const request = requests.find(r => r.id === id);
    if (!request) return { ok: false, error: 'Design request not found' };

    const proposals = (db.get(db.KEYS.PROPOSALS) || []).filter(p => p.requestId === id);

    return { ok: true, data: { ...request, proposals } };
  },

  async updateRequestStatus(id, newStatus, remarks = '') {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(200);

    const requests = db.get(db.KEYS.REQUESTS) || [];
    const req = requests.find(r => r.id === id);
    if (!req) return { ok: false, error: 'Request not found' };

    const oldStatus = req.status;
    req.status = newStatus;
    req.updatedAt = new Date().toISOString();

    if (remarks) {
      req.adminRemarks = req.adminRemarks || [];
      req.adminRemarks.push({
        id: db.generateId('REM'),
        text: remarks,
        author: auth.data.user.name,
        timestamp: new Date().toISOString()
      });
    }

    db.set(db.KEYS.REQUESTS, requests);

    // Client notification
    const notifications = db.get(db.KEYS.NOTIFICATIONS) || [];
    notifications.unshift({
      id: db.generateId('NOTIF'),
      userId: req.clientId || req.userId,
      title: `Project Status: ${newStatus.toUpperCase().replace('_', ' ')}`,
      message: `Your request "${req.title}" status has transitioned to ${newStatus}. ${remarks ? `Note: ${remarks}` : ''}`,
      link: `request-details.html?id=${req.id}`,
      read: false,
      createdAt: new Date().toISOString()
    });
    db.set(db.KEYS.NOTIFICATIONS, notifications);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'REQUEST_STATUS_CHANGE',
      entityType: 'REQUEST',
      entityId: id,
      summary: `Updated request ${id} status from ${oldStatus} to ${newStatus}`
    });

    return { ok: true, data: req };
  },

  async addInternalRemark(requestId, remarkText) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);

    const requests = db.get(db.KEYS.REQUESTS) || [];
    const req = requests.find(r => r.id === requestId);
    if (!req) return { ok: false, error: 'Request not found' };

    req.internalRemarks = req.internalRemarks || [];
    const remark = {
      id: db.generateId('REM'),
      text: remarkText.trim(),
      author: auth.data.user.name,
      timestamp: new Date().toISOString()
    };
    req.internalRemarks.push(remark);
    db.set(db.KEYS.REQUESTS, requests);

    return { ok: true, data: remark };
  },

  /**
   * PROPOSALS
   */
  async getProposals(requestId = null) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(150);

    let proposals = db.get(db.KEYS.PROPOSALS) || [];
    if (requestId) {
      proposals = proposals.filter(p => p.requestId === requestId);
    }
    return { ok: true, data: proposals };
  },

  async getProposal(id) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(100);

    const proposals = db.get(db.KEYS.PROPOSALS) || [];
    const p = proposals.find(item => item.id === id);
    if (!p) return { ok: false, error: 'Proposal not found' };
    return { ok: true, data: p };
  },

  async createProposal(data) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(250);

    const proposals = db.get(db.KEYS.PROPOSALS) || [];
    const settings = db.get(db.KEYS.ADMIN_SETTINGS) || {};
    const prefix = settings.proposalPrefix || 'PROP-2026-';

    const subtotal = (data.lineItems || []).reduce((acc, item) => acc + (Number(item.qty || 1) * Number(item.rate || 0)), 0);
    const gstPercent = data.gstPercent !== undefined ? Number(data.gstPercent) : (settings.gstRatePercent || 18);
    const gstAmount = Math.round((subtotal * gstPercent) / 100);
    const totalAmount = subtotal + gstAmount;

    const newProposal = {
      id: db.generateId(prefix.replace(/-$/, '')),
      requestId: data.requestId,
      clientId: data.clientId,
      clientName: data.clientName || '',
      clientEmail: data.clientEmail || '',
      title: data.title || 'Architectural Design Proposal',
      scopeSummary: data.scopeSummary || '',
      lineItems: data.lineItems || [],
      subtotal,
      gstPercent,
      gstAmount,
      totalAmount,
      validityDays: Number(data.validityDays) || 30,
      expiresAt: new Date(Date.now() + (Number(data.validityDays) || 30) * 86400000).toISOString(),
      milestones: data.milestones || [
        { title: 'Schematic Design & Concept', percentage: 30, amount: Math.round(totalAmount * 0.3), status: 'pending' },
        { title: 'Design Development & Layouts', percentage: 40, amount: Math.round(totalAmount * 0.4), status: 'pending' },
        { title: 'Working Drawings & Sign-off', percentage: 30, amount: Math.round(totalAmount * 0.3), status: 'pending' }
      ],
      status: 'draft', // 'draft' | 'sent' | 'accepted' | 'rejected' | 'revision_requested'
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    proposals.unshift(newProposal);
    db.set(db.KEYS.PROPOSALS, proposals);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'PROPOSAL_CREATED',
      entityType: 'PROPOSAL',
      entityId: newProposal.id,
      summary: `Created proposal ${newProposal.id} (₹${newProposal.totalAmount})`
    });

    return { ok: true, data: newProposal };
  },

  async sendProposal(id) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(200);

    const proposals = db.get(db.KEYS.PROPOSALS) || [];
    const p = proposals.find(item => item.id === id);
    if (!p) return { ok: false, error: 'Proposal not found' };

    p.status = 'sent';
    p.sentAt = new Date().toISOString();
    db.set(db.KEYS.PROPOSALS, proposals);

    // Notify client
    const notifications = db.get(db.KEYS.NOTIFICATIONS) || [];
    notifications.unshift({
      id: db.generateId('NOTIF'),
      userId: p.clientId,
      title: 'Architectural Proposal Ready',
      message: `Your project proposal ${p.id} has been issued by SGA. Please review scope, milestones and acceptance terms.`,
      link: `request-details.html?id=${p.requestId}#proposals`,
      read: false,
      createdAt: new Date().toISOString()
    });
    db.set(db.KEYS.NOTIFICATIONS, notifications);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'PROPOSAL_SENT',
      entityType: 'PROPOSAL',
      entityId: p.id,
      summary: `Sent proposal ${p.id} to client ${p.clientEmail}`
    });

    return { ok: true, data: p };
  },

  /**
   * CLIENTS CRM
   */
  async getClients(query = '') {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(180);

    let clients = (db.get(db.KEYS.USERS) || []).filter(u => u.role === 'client');
    if (query) {
      const q = query.toLowerCase();
      clients = clients.filter(c => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
    }

    const requests = db.get(db.KEYS.REQUESTS) || [];
    const proposals = db.get(db.KEYS.PROPOSALS) || [];

    const enriched = clients.map(c => {
      const clientReqs = requests.filter(r => r.clientId === c.id || r.clientEmail === c.email || r.userId === c.id);
      const clientProps = proposals.filter(p => p.clientId === c.id || p.clientEmail === c.email);
      return {
        ...c,
        requestsCount: clientReqs.length,
        proposalsCount: clientProps.length,
        lastActivity: c.lastLoginAt || c.createdAt
      };
    });

    return { ok: true, data: enriched };
  },

  async getClientDetails(id) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(150);

    const users = db.get(db.KEYS.USERS) || [];
    const client = users.find(u => u.id === id && u.role === 'client');
    if (!client) return { ok: false, error: 'Client not found' };

    const requests = (db.get(db.KEYS.REQUESTS) || []).filter(r => r.clientId === client.id || r.clientEmail === client.email || r.userId === client.id);
    const proposals = (db.get(db.KEYS.PROPOSALS) || []).filter(p => p.clientId === client.id || p.clientEmail === client.email);

    return {
      ok: true,
      data: {
        client,
        requests,
        proposals
      }
    };
  },

  /**
   * CONTACT MESSAGES INBOX
   */
  async getContactMessages(filter = 'all') {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(150);

    let messages = db.get(db.KEYS.CONTACT_MESSAGES) || [];
    if (filter !== 'all') {
      messages = messages.filter(m => m.status === filter);
    }
    return { ok: true, data: messages };
  },

  async updateMessageStatus(id, newStatus) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);

    const messages = db.get(db.KEYS.CONTACT_MESSAGES) || [];
    const msg = messages.find(m => m.id === id);
    if (!msg) return { ok: false, error: 'Message not found' };

    msg.status = newStatus;
    db.set(db.KEYS.CONTACT_MESSAGES, messages);
    return { ok: true, data: msg };
  },

  async replyMessage(id, replyText) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(200);

    const messages = db.get(db.KEYS.CONTACT_MESSAGES) || [];
    const msg = messages.find(m => m.id === id);
    if (!msg) return { ok: false, error: 'Message not found' };

    msg.status = 'replied';
    msg.replies = msg.replies || [];
    msg.replies.push({
      id: db.generateId('REP'),
      text: replyText.trim(),
      sentBy: auth.data.user.name,
      sentAt: new Date().toISOString()
    });
    db.set(db.KEYS.CONTACT_MESSAGES, messages);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'CONTACT_REPLY',
      entityType: 'MESSAGE',
      entityId: id,
      summary: `Replied to contact message from ${msg.email}`
    });

    return { ok: true, data: msg };
  },

  /**
   * ANNOUNCEMENTS
   */
  async getAnnouncements() {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);
    return { ok: true, data: db.get(db.KEYS.ANNOUNCEMENTS) || [] };
  },

  async createAnnouncement(data) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(180);

    const announcements = db.get(db.KEYS.ANNOUNCEMENTS) || [];
    const item = {
      id: db.generateId('ANN'),
      title: data.title?.trim() || 'Announcement',
      content: data.content?.trim() || '',
      targetPortal: data.targetPortal || 'both', // 'both' | 'student' | 'client'
      style: data.style || 'info', // 'info' | 'warning' | 'accent'
      active: data.active !== false,
      createdAt: new Date().toISOString()
    };

    announcements.unshift(item);
    db.set(db.KEYS.ANNOUNCEMENTS, announcements);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'ANNOUNCEMENT_CREATED',
      entityType: 'ANNOUNCEMENT',
      entityId: item.id,
      summary: `Broadcasted announcement "${item.title}" to ${item.targetPortal}`
    });

    return { ok: true, data: item };
  },

  async updateAnnouncement(id, updates) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);

    const list = db.get(db.KEYS.ANNOUNCEMENTS) || [];
    const index = list.findIndex(a => a.id === id);
    if (index === -1) return { ok: false, error: 'Announcement not found' };

    list[index] = { ...list[index], ...updates };
    db.set(db.KEYS.ANNOUNCEMENTS, list);
    return { ok: true, data: list[index] };
  },

  async deleteAnnouncement(id) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(100);

    const list = db.get(db.KEYS.ANNOUNCEMENTS) || [];
    const filtered = list.filter(a => a.id !== id);
    db.set(db.KEYS.ANNOUNCEMENTS, filtered);
    return { ok: true };
  },

  /**
   * TESTIMONIALS
   */
  async getTestimonials() {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);
    return { ok: true, data: db.get(db.KEYS.TESTIMONIALS) || [] };
  },

  async saveTestimonial(data) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(180);

    const list = db.get(db.KEYS.TESTIMONIALS) || [];
    if (data.id) {
      const idx = list.findIndex(t => t.id === data.id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
        db.set(db.KEYS.TESTIMONIALS, list);
        return { ok: true, data: list[idx] };
      }
    }

    const newItem = {
      id: db.generateId('TESTIMONIAL'),
      name: data.name?.trim() || 'Anonymous',
      role: data.role?.trim() || 'Client',
      quote: data.quote?.trim() || '',
      featured: Boolean(data.featured),
      active: data.active !== false,
      createdAt: new Date().toISOString()
    };
    list.unshift(newItem);
    db.set(db.KEYS.TESTIMONIALS, list);
    return { ok: true, data: newItem };
  },

  async deleteTestimonial(id) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);

    const list = db.get(db.KEYS.TESTIMONIALS) || [];
    db.set(db.KEYS.TESTIMONIALS, list.filter(t => t.id !== id));
    return { ok: true };
  },

  /**
   * SITE CONTENT CMS
   */
  async getSiteContent() {
    await delay(100);
    const raw = db.get(db.KEYS.SITE_CONTENT) || {};
    const fallback = {
      businessName: 'Shilp Griha Associate',
      shortName: 'SGA',
      founderName: 'Ar. Vikas Verma',
      founderRole: 'Architect, Founder',
      tagline: 'नक्शा सही, निर्माण सही',
      phone: '+91 79854 36965',
      phoneTel: '+917985436965',
      whatsapp: 'https://wa.me/917985436965',
      email: 'ar.vikasverma0401@gmail.com',
      domain: 'www.sgaup31.in',
      address: 'Laxmi Nagar Colony, Cinema Road, in front of Shree Siddhivinayak Palace, Gola Gokarnath, Lakhimpur Kheri, Uttar Pradesh 262802, India',
      serviceArea: 'Gola Gokarnath, Lakhimpur Kheri and nearby areas of Uttar Pradesh',
      directionsUrl: 'https://www.google.com/maps?gs_lcrp=EgZjaHJvbWUqCggAEAAY4wIYgAQyCggAEAAY4wIYgAQyDQgBEC4YrwEYxwEYgAQyBggCEEUYOTINCAMQABiGAxiABBiKBTINCAQQABiGAxiABBiKBTIKCAUQABiABBiiBDIKCAYQABiABBiiBDIGCAcQRRg80gEJMTA2NTRqMGo3qAIAsAIA&um=1&ie=UTF-8&fb=1&gl=in&sa=X&geocode=Kc-4FEcAQ585Metx1h-VJKp4&daddr=Gola+Gokaran+Nath,+Gola,+Uttar+Pradesh+262802',
      mapEmbedUrl: 'https://www.google.com/maps?q=Gola+Gokaran+Nath,+Gola,+Uttar+Pradesh+262802&output=embed',
      hours: 'Mon - Sat: 9:30 AM - 7:30 PM (Sunday by Appointment)',
      socialLinks: {
        instagram: '',
        justdial: '',
        googleReview: ''
      }
    };
    return { ok: true, data: { ...fallback, ...raw, socialLinks: { ...fallback.socialLinks, ...(raw.socialLinks || {}) } } };
  },

  async updateSiteContent(data) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(200);

    db.set(db.KEYS.SITE_CONTENT, { ...data, updatedAt: new Date().toISOString() });

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'SITE_CONTENT_UPDATED',
      entityType: 'CMS',
      entityId: 'homepage',
      summary: 'Updated homepage CMS content'
    });

    return { ok: true };
  },

  /**
   * ABOUT CONTENT MANAGEMENT
   */
  async getAboutContentAdmin() {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(100);

    const siteRaw = db.get(db.KEYS.SITE_CONTENT) || {};
    const aboutRaw = db.get('sga_about_page_content') || {};

    const fallback = {
      heroLabel: 'ABOUT US',
      heroTitle: 'A practice built on careful planning',
      heroIntro: 'Practical, modern architectural planning and interior design led by Ar. Vikas Verma.',
      tagline: 'नक्शा सही, निर्माण सही',
      taglineMeaning: 'Right plan, right construction.',
      whoWeAreText: 'Shilp Griha Associate is an architectural and interior design practice led by Ar. Vikas Verma. We offer practical, modern design for homes and commercial spaces, including 2D planning, 3D elevations, interior design and construction consultancy. Our focus is on spaces that look good, work well and respect your budget, with Vastu-friendly planning where you want it. We work closely with every client, from the first idea to the finished drawings.',
      supportingPhoto: '/assets/images/portfolio/project-06.png',
      founderPhoto: siteRaw.founderPhoto || '/assets/aistudio/image_7f9d650c.png',
      founderName: siteRaw.founderName || 'Ar. Vikas Verma',
      founderRole: siteRaw.founderRole || 'Architect, Founder',
      founderBio: siteRaw.bio || 'Ar. Vikas Verma leads Shilp Griha Associate and is involved in every project, from the first site discussion to the final drawings. He believes a good plan starts with listening: how a family lives, how the plot behaves with light and air, and what the budget allows.\n\nHis approach combines clear 2D planning, realistic 3D visuals and Vastu-friendly layouts, explained in simple terms so clients can decide with confidence.',
      qualifications: siteRaw.qualifications || '',
      regNumber: siteRaw.regNumber || '',
      experienceYears: siteRaw.experienceYears || '',
      areasOfFocus: aboutRaw.areasOfFocus || '',
      services: [
        { id: 'srv-1', title: 'Architectural Planning', description: 'Thoughtful site layouts, space planning and practical building arrangements.', icon: 'compass', order: 1, visible: true },
        { id: 'srv-2', title: 'Building Design', description: 'Building concepts shaped around function, proportions and your requirements.', icon: 'building-2', order: 2, visible: true },
        { id: 'srv-3', title: '2D Floor Plans', description: 'Clear, dimensioned floor plans that make room relationships easy to understand.', icon: 'grid', order: 3, visible: true },
        { id: 'srv-4', title: '3D Elevation and Visualisation', description: 'Three-dimensional views to help you understand scale, form and facade choices.', icon: 'box', order: 4, visible: true },
        { id: 'srv-5', title: 'Interior Design', description: 'Interior layouts, material direction and furniture planning for usable rooms.', icon: 'home', order: 5, visible: true },
        { id: 'srv-6', title: 'Construction Consultancy', description: 'Experienced guidance on materials, site measurements and structural coordination.', icon: 'hard-hat', order: 6, visible: true }
      ],
      projectChips: [
        'Houses and villas', 'Commercial buildings', 'Farmhouses', 'Guest houses',
        'Penthouses', 'Cottages', 'Landscape and garden design', 'Mud and eco-friendly homes',
        'NA land and plot planning', 'Master planning'
      ],
      whyUsPoints: [
        { id: 'why-1', title: 'Vastu-friendly planning', desc: 'Balanced spatial layouts harmonising natural light, wind flow and spatial orientation.' },
        { id: 'why-2', title: 'Cost-conscious design', desc: 'Realistic material selections and structural planning aligned with your budget.' },
        { id: 'why-3', title: 'Attention to detail', desc: 'Accurate dimensions, clear working drawings and thorough technical coordination.' },
        { id: 'why-4', title: 'Support from concept to completion', desc: 'Direct guidance and continuous architectural collaboration at every phase.' }
      ],
      processSteps: [
        { number: '01', step: 'Share your brief', desc: 'Tell us about your requirements, family needs, and ideas for the space.' },
        { number: '02', step: 'Site details', desc: 'Review plot measurements, orientation, approach road and local conditions.' },
        { number: '03', step: 'Concept and plan', desc: 'Develop the initial 2D floor plans and functional space arrangements.' },
        { number: '04', step: '3D view', desc: 'Visualise exterior elevations, materials and form in realistic 3D.' },
        { number: '05', step: 'Revisions', desc: 'Refine layouts and details based on your feedback and preferences.' },
        { number: '06', step: 'Final drawings', desc: 'Receive comprehensive, dimensioned architectural drawings ready for site work.' }
      ],
      hours: siteRaw.hours || 'Hours: to be confirmed',
      socialLinks: {
        instagram: (siteRaw.socialLinks && siteRaw.socialLinks.instagram) || '',
        justdial: (siteRaw.socialLinks && siteRaw.socialLinks.justdial) || '',
        googleReview: (siteRaw.socialLinks && siteRaw.socialLinks.googleReview) || ''
      }
    };

    const merged = {
      ...fallback,
      ...aboutRaw,
      socialLinks: { ...fallback.socialLinks, ...(aboutRaw.socialLinks || {}) }
    };

    return { ok: true, data: merged };
  },

  async updateAboutContentAdmin(data) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(200);

    // Save dedicated About page content
    db.set('sga_about_page_content', { ...data, updatedAt: new Date().toISOString() });

    // Sync shared core fields with SITE_CONTENT
    const currentSite = db.get(db.KEYS.SITE_CONTENT) || {};
    db.set(db.KEYS.SITE_CONTENT, {
      ...currentSite,
      founderPhoto: data.founderPhoto || currentSite.founderPhoto,
      founderName: data.founderName || currentSite.founderName,
      founderRole: data.founderRole || currentSite.founderRole,
      bio: data.founderBio || currentSite.bio,
      qualifications: data.qualifications || '',
      regNumber: data.regNumber || '',
      experienceYears: data.experienceYears || '',
      hours: data.hours || currentSite.hours,
      socialLinks: {
        ...(currentSite.socialLinks || {}),
        ...(data.socialLinks || {})
      },
      updatedAt: new Date().toISOString()
    });

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'ABOUT_CONTENT_UPDATED',
      entityType: 'CMS',
      entityId: 'about-page',
      summary: 'Updated About Us page content and founder profile'
    });

    return { ok: true };
  },

  /**
   * PORTFOLIO / WORK MANAGEMENT
   */
  async listPortfolioAdmin() {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(120);

    let items = db.get(db.KEYS.PORTFOLIO);
    if (!items || !Array.isArray(items) || items.length === 0) {
      // Seed default items if uninitialized
      items = [
        { id: 'PRJ-01', title: 'Contemporary 3-Storey Villa', category: 'Exterior Elevations', location: 'Gola Gokarnath', year: '2026', shortDescription: 'Modern 3-storey villa exterior elevation with warm architectural lighting and rooftop terrace.', thumbnail: '/assets/images/portfolio/project-01.png', fullImage: '/assets/images/portfolio/project-01.png', altText: 'Modern 3-storey villa exterior elevation', showOnHomeSlider: true, visible: true, order: 1 },
        { id: 'PRJ-02', title: 'Triple-Height Vertical Facade', category: 'Exterior Elevations', location: 'Lakhimpur Kheri', year: '2026', shortDescription: 'Vertical 3-floor residential facade with glass slit & linear wood-finish louvers.', thumbnail: '/assets/images/portfolio/project-02.png', fullImage: '/assets/images/portfolio/project-02.png', altText: 'Vertical 3-floor residential facade', showOnHomeSlider: true, visible: true, order: 2 },
        { id: 'PRJ-03', title: 'Calacatta Gold Suite', category: 'Interior Design', location: 'Gola Gokarnath', year: '2026', shortDescription: 'Luxury marble bathroom design with gold trim, walk-in shower and arched LED mirror.', thumbnail: '/assets/images/portfolio/project-03.png', fullImage: '/assets/images/portfolio/project-03.png', altText: 'Luxury marble bathroom design', showOnHomeSlider: true, visible: true, order: 3 },
        { id: 'PRJ-04', title: 'Warm Minimalist Suite', category: 'Interior Design', location: 'Uttar Pradesh', year: '2026', shortDescription: 'Master bedroom interior with bay window seating, accent lighting and custom millwork.', thumbnail: '/assets/images/portfolio/project-04.png', fullImage: '/assets/images/portfolio/project-04.png', altText: 'Master bedroom interior with bay window seating', showOnHomeSlider: true, visible: true, order: 4 },
        { id: 'PRJ-05', title: 'Corporate Studio Hub', category: 'Commercial Spaces', location: 'Gola Gokarnath', year: '2026', shortDescription: 'Modern corporate office workstations with biophilic ceiling trellis.', thumbnail: '/assets/images/portfolio/project-05.png', fullImage: '/assets/images/portfolio/project-05.png', altText: 'Modern corporate office workstations', showOnHomeSlider: true, visible: true, order: 5 },
        { id: 'PRJ-06', title: 'Garden Gazebo Lounge', category: 'Landscape Architecture', location: 'Lakhimpur Kheri', year: '2026', shortDescription: 'Wooden outdoor pergola lounge with paved landscape lighting.', thumbnail: '/assets/images/portfolio/project-06.png', fullImage: '/assets/images/portfolio/project-06.png', altText: 'Wooden outdoor pergola lounge', showOnHomeSlider: true, visible: true, order: 6 },
        { id: 'PRJ-07', title: 'Vanity & Acoustic Lounge', category: 'Interior Design', location: 'Gola Gokarnath', year: '2025', shortDescription: 'Modern bedroom with fluted acoustic paneling and vanity mirror.', thumbnail: '/assets/images/portfolio/project-07.png', fullImage: '/assets/images/portfolio/project-07.png', altText: 'Modern bedroom with fluted acoustic paneling', showOnHomeSlider: true, visible: true, order: 7 },
        { id: 'PRJ-08', title: 'Bespoke Master Bedroom', category: 'Interior Design', location: 'Uttar Pradesh', year: '2025', shortDescription: 'Contemporary bedroom with chevron wood panels and gold orb pendants.', thumbnail: '/assets/images/portfolio/project-08.png', fullImage: '/assets/images/portfolio/project-08.png', altText: 'Contemporary bedroom with chevron wood panels', showOnHomeSlider: true, visible: true, order: 8 },
        { id: 'PRJ-09', title: 'Grand Classical Villa', category: 'Exterior Elevations', location: 'Gola Gokarnath', year: '2026', shortDescription: 'Classical bungalow facade with grand arched entrance and landscaped driveway.', thumbnail: '/assets/images/portfolio/project-09.png', fullImage: '/assets/images/portfolio/project-09.png', altText: 'Classical bungalow facade with grand arched entrance', showOnHomeSlider: true, visible: true, order: 9 },
        { id: 'PRJ-10', title: 'Luxury Salon & Studio', category: 'Commercial Spaces', location: 'Gola Gokarnath', year: '2025', shortDescription: 'Modern beauty salon interior with geometric flooring.', thumbnail: '/assets/images/portfolio/project-10.png', fullImage: '/assets/images/portfolio/project-10.png', altText: 'Modern beauty salon interior', showOnHomeSlider: true, visible: true, order: 10 },
        { id: 'PRJ-11', title: 'Rooftop Pergola Deck', category: 'Landscape Architecture', location: 'Lakhimpur Kheri', year: '2025', shortDescription: 'Terrace roof garden with timber pergola and integrated bench seating.', thumbnail: '/assets/images/portfolio/project-11.png', fullImage: '/assets/images/portfolio/project-11.png', altText: 'Terrace roof garden with timber pergola', showOnHomeSlider: true, visible: true, order: 11 },
        { id: 'PRJ-12', title: 'Design Team Workspaces', category: 'Commercial Spaces', location: 'Gola Gokarnath', year: '2026', shortDescription: 'Modern collaborative design office with custom shelving.', thumbnail: '/assets/images/portfolio/project-12.png', fullImage: '/assets/images/portfolio/project-12.png', altText: 'Modern collaborative design office', showOnHomeSlider: true, visible: true, order: 12 },
        { id: 'PRJ-13', title: 'Contemporary Duplex', category: 'Exterior Elevations', location: 'Uttar Pradesh', year: '2025', shortDescription: 'Urban contemporary 2-storey house facade with wooden accents.', thumbnail: '/assets/images/portfolio/project-13.png', fullImage: '/assets/images/portfolio/project-13.png', altText: 'Urban contemporary 2-storey house facade', showOnHomeSlider: true, visible: true, order: 13 },
        { id: 'PRJ-14', title: 'Studio Welcome Reception', category: 'Commercial Spaces', location: 'Gola Gokarnath', year: '2026', shortDescription: 'Studio reception lounge with fluted glass partition and cobalt blue seating.', thumbnail: '/assets/images/portfolio/project-14.png', fullImage: '/assets/images/portfolio/project-14.png', altText: 'Studio reception lounge with fluted glass partition', showOnHomeSlider: true, visible: true, order: 14 }
      ];
      db.set(db.KEYS.PORTFOLIO, items);
    }

    // Sort by order ascending
    items.sort((a, b) => (a.order || 999) - (b.order || 999));
    return { ok: true, data: items };
  },

  async createPortfolioItem(data) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(200);

    if (!data.title || data.title.trim().length < 2) {
      return { ok: false, error: 'Please enter a valid project title.' };
    }
    if (!data.category || data.category.trim().length < 2) {
      return { ok: false, error: 'Please select or enter a project category.' };
    }
    if (!data.thumbnail && !data.fullImage) {
      return { ok: false, error: 'Please upload or provide an image for the project.' };
    }

    const items = db.get(db.KEYS.PORTFOLIO) || [];
    const maxOrder = items.reduce((acc, it) => Math.max(acc, it.order || 0), 0);

    const newItem = {
      id: db.generateId('PRJ'),
      title: data.title.trim(),
      category: data.category.trim(),
      location: data.location ? data.location.trim() : 'Uttar Pradesh',
      year: data.year ? data.year.trim() : new Date().getFullYear().toString(),
      shortDescription: data.shortDescription ? data.shortDescription.trim() : '',
      altText: data.altText ? data.altText.trim() : `${data.title.trim()} - Shilp Griha Associate`,
      thumbnail: data.thumbnail || data.fullImage,
      fullImage: data.fullImage || data.thumbnail,
      showOnHomeSlider: Boolean(data.showOnHomeSlider),
      visible: data.visible !== false,
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    items.push(newItem);
    db.set(db.KEYS.PORTFOLIO, items);

    // Save category to dynamic categories list if new
    await this.savePortfolioCategory(newItem.category);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'PORTFOLIO_ITEM_CREATED',
      entityType: 'PORTFOLIO',
      entityId: newItem.id,
      summary: `Created project "${newItem.title}" (${newItem.category})`
    });

    return { ok: true, data: newItem };
  },

  async updatePortfolioItem(id, updates) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(200);

    const items = db.get(db.KEYS.PORTFOLIO) || [];
    const idx = items.findIndex(it => it.id === id);
    if (idx === -1) {
      return { ok: false, error: 'Project not found.' };
    }

    const current = items[idx];
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    items[idx] = updated;
    db.set(db.KEYS.PORTFOLIO, items);

    if (updated.category) {
      await this.savePortfolioCategory(updated.category);
    }

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'PORTFOLIO_ITEM_UPDATED',
      entityType: 'PORTFOLIO',
      entityId: id,
      summary: `Updated project "${updated.title}"`
    });

    return { ok: true, data: updated };
  },

  async deletePortfolioItem(id) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(180);

    const items = db.get(db.KEYS.PORTFOLIO) || [];
    const target = items.find(it => it.id === id);
    if (!target) {
      return { ok: false, error: 'Project not found.' };
    }

    const filtered = items.filter(it => it.id !== id);
    db.set(db.KEYS.PORTFOLIO, filtered);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'PORTFOLIO_ITEM_DELETED',
      entityType: 'PORTFOLIO',
      entityId: id,
      summary: `Deleted project "${target.title}"`
    });

    return { ok: true };
  },

  async reorderPortfolio(orderedIds) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(150);

    const items = db.get(db.KEYS.PORTFOLIO) || [];
    const itemMap = new Map(items.map(it => [it.id, it]));

    orderedIds.forEach((id, index) => {
      const it = itemMap.get(id);
      if (it) {
        it.order = index + 1;
      }
    });

    const updatedList = Array.from(itemMap.values());
    updatedList.sort((a, b) => (a.order || 999) - (b.order || 999));
    db.set(db.KEYS.PORTFOLIO, updatedList);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'PORTFOLIO_REORDERED',
      entityType: 'PORTFOLIO',
      entityId: 'ALL',
      summary: `Reordered ${orderedIds.length} portfolio projects`
    });

    return { ok: true };
  },

  async bulkCreatePortfolio(itemsList) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(350);

    if (!Array.isArray(itemsList) || itemsList.length === 0) {
      return { ok: false, error: 'No items provided for bulk upload.' };
    }

    const items = db.get(db.KEYS.PORTFOLIO) || [];
    let maxOrder = items.reduce((acc, it) => Math.max(acc, it.order || 0), 0);
    const createdItems = [];

    for (const raw of itemsList) {
      maxOrder += 1;
      const newItem = {
        id: db.generateId('PRJ'),
        title: raw.title ? raw.title.trim() : `Project ${maxOrder}`,
        category: raw.category ? raw.category.trim() : 'General',
        location: raw.location ? raw.location.trim() : 'Uttar Pradesh',
        year: raw.year ? raw.year.trim() : new Date().getFullYear().toString(),
        shortDescription: raw.shortDescription ? raw.shortDescription.trim() : '',
        altText: raw.altText ? raw.altText.trim() : `${raw.title || 'Project'} - Shilp Griha Associate`,
        thumbnail: raw.thumbnail || raw.fullImage,
        fullImage: raw.fullImage || raw.thumbnail,
        showOnHomeSlider: Boolean(raw.showOnHomeSlider),
        visible: raw.visible !== false,
        order: maxOrder,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      items.push(newItem);
      createdItems.push(newItem);
    }

    db.set(db.KEYS.PORTFOLIO, items);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'PORTFOLIO_BULK_UPLOAD',
      entityType: 'PORTFOLIO',
      entityId: 'BULK',
      summary: `Bulk uploaded ${createdItems.length} portfolio items`
    });

    return { ok: true, data: createdItems };
  },

  async getPortfolioCategories() {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(80);

    const items = db.get(db.KEYS.PORTFOLIO) || [];
    const saved = db.get('sga_portfolio_categories') || ['Exterior Elevations', 'Interior Design', 'Commercial Spaces', 'Landscape Architecture'];
    const set = new Set(saved);

    items.forEach(it => {
      if (it.category && typeof it.category === 'string') {
        set.add(it.category.trim());
      }
    });

    return { ok: true, data: Array.from(set) };
  },

  async savePortfolioCategory(categoryName) {
    if (!categoryName || typeof categoryName !== 'string') return { ok: false };
    const clean = categoryName.trim();
    if (!clean) return { ok: false };

    const saved = db.get('sga_portfolio_categories') || ['Exterior Elevations', 'Interior Design', 'Commercial Spaces', 'Landscape Architecture'];
    if (!saved.includes(clean)) {
      saved.push(clean);
      db.set('sga_portfolio_categories', saved);
    }
    return { ok: true };
  },

  async renamePortfolioCategory(oldName, newName) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(150);

    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanOld || !cleanNew) {
      return { ok: false, error: 'Please specify both current and new category names.' };
    }

    const items = db.get(db.KEYS.PORTFOLIO) || [];
    let count = 0;
    items.forEach(it => {
      if (it.category === cleanOld) {
        it.category = cleanNew;
        count += 1;
      }
    });
    db.set(db.KEYS.PORTFOLIO, items);

    const saved = db.get('sga_portfolio_categories') || [];
    const updatedCategories = saved.map(c => c === cleanOld ? cleanNew : c);
    if (!updatedCategories.includes(cleanNew)) updatedCategories.push(cleanNew);
    db.set('sga_portfolio_categories', updatedCategories);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'PORTFOLIO_CATEGORY_RENAMED',
      entityType: 'PORTFOLIO',
      entityId: cleanNew,
      summary: `Renamed category "${cleanOld}" to "${cleanNew}" (${count} items updated)`
    });

    return { ok: true, count };
  },

  async deletePortfolioCategory(categoryName, targetCategory = 'General') {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(180);

    const clean = categoryName.trim();
    const target = (targetCategory || 'General').trim();

    const items = db.get(db.KEYS.PORTFOLIO) || [];
    let count = 0;
    items.forEach(it => {
      if (it.category === clean) {
        it.category = target;
        count += 1;
      }
    });
    db.set(db.KEYS.PORTFOLIO, items);

    const saved = db.get('sga_portfolio_categories') || [];
    const filteredCats = saved.filter(c => c !== clean);
    if (!filteredCats.includes(target)) filteredCats.push(target);
    db.set('sga_portfolio_categories', filteredCats);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'PORTFOLIO_CATEGORY_DELETED',
      entityType: 'PORTFOLIO',
      entityId: clean,
      summary: `Deleted category "${clean}", moved ${count} items to "${target}"`
    });

    return { ok: true, movedCount: count };
  },

  /**
   * SETTINGS & FULL BACKUP
   */
  async getSettings() {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(100);
    return { ok: true, data: db.get(db.KEYS.ADMIN_SETTINGS) || {} };
  },

  async updateSettings(data) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(150);

    const current = db.get(db.KEYS.ADMIN_SETTINGS) || {};
    const updated = { ...current, ...data };
    db.set(db.KEYS.ADMIN_SETTINGS, updated);

    await this.logActivity({
      adminId: auth.data.user.id,
      adminName: auth.data.user.name,
      adminEmail: auth.data.user.email,
      action: 'SETTINGS_UPDATED',
      entityType: 'SETTINGS',
      entityId: 'SYSTEM',
      summary: 'Updated administrative studio settings'
    });

    return { ok: true, data: updated };
  },

  async exportFullBackup() {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(300);

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      stores: {
        users: db.get(db.KEYS.USERS),
        requests: db.get(db.KEYS.REQUESTS),
        notes: db.get(db.KEYS.NOTES),
        purchases: db.get(db.KEYS.PURCHASES),
        orders: db.get(db.KEYS.ORDERS),
        payments: db.get(db.KEYS.PAYMENTS),
        coupons: db.get(db.KEYS.COUPONS),
        proposals: db.get(db.KEYS.PROPOSALS),
        contactMessages: db.get(db.KEYS.CONTACT_MESSAGES),
        announcements: db.get(db.KEYS.ANNOUNCEMENTS),
        testimonials: db.get(db.KEYS.TESTIMONIALS),
        siteContent: db.get(db.KEYS.SITE_CONTENT),
        adminSettings: db.get(db.KEYS.ADMIN_SETTINGS),
        activityLog: db.get(db.KEYS.ACTIVITY_LOG)
      }
    };

    return { ok: true, data: backup };
  },

  async importFullBackup(jsonData) {
    const auth = await this.requireAdmin();
    if (!auth.ok) return auth;
    await delay(400);

    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      if (!data.stores) {
        return { ok: false, error: 'Invalid backup structure. Missing "stores" object.' };
      }

      if (data.stores.users) db.set(db.KEYS.USERS, data.stores.users);
      if (data.stores.requests) db.set(db.KEYS.REQUESTS, data.stores.requests);
      if (data.stores.notes) db.set(db.KEYS.NOTES, data.stores.notes);
      if (data.stores.purchases) db.set(db.KEYS.PURCHASES, data.stores.purchases);
      if (data.stores.orders) db.set(db.KEYS.ORDERS, data.stores.orders);
      if (data.stores.payments) db.set(db.KEYS.PAYMENTS, data.stores.payments);
      if (data.stores.coupons) db.set(db.KEYS.COUPONS, data.stores.coupons);
      if (data.stores.proposals) db.set(db.KEYS.PROPOSALS, data.stores.proposals);
      if (data.stores.contactMessages) db.set(db.KEYS.CONTACT_MESSAGES, data.stores.contactMessages);
      if (data.stores.announcements) db.set(db.KEYS.ANNOUNCEMENTS, data.stores.announcements);
      if (data.stores.testimonials) db.set(db.KEYS.TESTIMONIALS, data.stores.testimonials);
      if (data.stores.siteContent) db.set(db.KEYS.SITE_CONTENT, data.stores.siteContent);
      if (data.stores.adminSettings) db.set(db.KEYS.ADMIN_SETTINGS, data.stores.adminSettings);
      if (data.stores.activityLog) db.set(db.KEYS.ACTIVITY_LOG, data.stores.activityLog);

      await this.logActivity({
        adminId: auth.data.user.id,
        adminName: auth.data.user.name,
        adminEmail: auth.data.user.email,
        action: 'BACKUP_RESTORED',
        entityType: 'SYSTEM',
        entityId: 'ALL',
        summary: 'Restored system database from JSON backup file'
      });

      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Import failed: ${err.message}` };
    }
  }
};
