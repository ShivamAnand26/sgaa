import { CONFIG } from './config.js';
import { db } from './db.js';
import { cryptoService } from './crypto.js';
import { firebaseAuthService, firebaseDataService } from './firebase.js';

/**
 * Artificial realistic network latency helper
 */
async function simulateLatency() {
  const ms = Math.floor(Math.random() * (CONFIG.API_DELAY_MAX - CONFIG.API_DELAY_MIN + 1)) + CONFIG.API_DELAY_MIN;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validates file magic bytes (file signature)
 */
async function checkMagicBytes(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = (e) => {
      if (!e.target || !e.target.result) return resolve(false);
      const arr = new Uint8Array(e.target.result);
      
      // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
      if (arr.length >= 5 && arr[0] === 0x25 && arr[1] === 0x50 && arr[2] === 0x44 && arr[3] === 0x46 && arr[4] === 0x2D) {
        return resolve('application/pdf');
      }
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (arr.length >= 8 && arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47 && arr[4] === 0x0D && arr[5] === 0x0A && arr[6] === 0x1A && arr[7] === 0x0A) {
        return resolve('image/png');
      }
      // JPG / JPEG: FF D8 FF
      if (arr.length >= 3 && arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) {
        return resolve('image/jpeg');
      }
      return resolve(false);
    };
    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file.slice(0, 16));
  });
}

/**
 * Strips sensitive password and security hash properties from user record
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, resetCodeHash, resetCodeSalt, resetExpiresAt, ...safeUser } = user;
  return safeUser;
}

/**
 * Resolves current authenticated session user
 */
function getCurrentSessionUser() {
  const token = localStorage.getItem('sga_auth_token') || sessionStorage.getItem('sga_auth_token');
  if (!token) return null;

  const sessions = db.get(db.KEYS.SESSIONS);
  const session = sessions.find(s => s.token === token);
  if (!session) return null;

  // Check expiry
  if (new Date(session.expiresAt) < new Date()) {
    // Session expired
    const activeSessions = sessions.filter(s => s.token !== token);
    db.set(db.KEYS.SESSIONS, activeSessions);
    localStorage.removeItem('sga_auth_token');
    sessionStorage.removeItem('sga_auth_token');
    return null;
  }

  const users = db.get(db.KEYS.USERS);
  const user = users.find(u => u.id === session.userId);
  return user || null;
}

export const api = {
  /**
   * Register a new client account
   */
  async register({ fullName, email, phone, password }) {
    await simulateLatency();

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (fullName || '').trim();
    const cleanPhone = (phone || '').trim();

    if (!cleanName || cleanName.length < 2) {
      return { ok: false, error: 'Please enter your full name.' };
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }
    if (!cleanPhone || cleanPhone.length < 8) {
      return { ok: false, error: 'Please enter a valid contact phone number.' };
    }
    if (!password || password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters long.' };
    }

    const users = db.get(db.KEYS.USERS);
    const existing = users.find(u => u.email === cleanEmail);
    if (existing) {
      return { ok: false, error: 'An account with this email address already exists. Please log in.' };
    }

    const salt = cryptoService.generateSalt();
    const hash = await cryptoService.hashPassword(password, salt);
    const userId = db.generateId('USR');

    const newUser = {
      id: userId,
      role: 'client', // Role is always client for public sign up
      fullName: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      address: '',
      avatarId: null,
      passwordHash: hash,
      passwordSalt: salt,
      failedAttempts: 0,
      lockedUntil: null,
      deletionRequested: false,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    db.set(db.KEYS.USERS, users);

    // Initial welcome notification
    const notifications = db.get(db.KEYS.NOTIFICATIONS);
    notifications.push({
      id: db.generateId('NOTIF'),
      userId: newUser.id,
      title: 'Welcome to SGA Client Portal',
      body: 'Your client account is now active. You can begin submitting architectural planning and design requests.',
      requestId: null,
      read: false,
      createdAt: new Date().toISOString()
    });
    db.set(db.KEYS.NOTIFICATIONS, notifications);

    // Sync with Firebase Auth and Firestore
    try {
      await firebaseAuthService.register({
        email: cleanEmail,
        password,
        fullName: cleanName,
        role: 'client',
        phone: cleanPhone
      });
    } catch (fbErr) {
      console.warn('[Firebase] Auth sync note:', fbErr);
    }

    // Auto-login after registration
    const token = cryptoService.generateSessionToken();
    const expiresAt = new Date(Date.now() + CONFIG.SESSION_HOURS_STANDARD * 60 * 60 * 1000).toISOString();
    const sessions = db.get(db.KEYS.SESSIONS);
    sessions.push({ token, userId: newUser.id, expiresAt, createdAt: new Date().toISOString() });
    db.set(db.KEYS.SESSIONS, sessions);

    sessionStorage.setItem('sga_auth_token', token);

    return {
      ok: true,
      data: {
        user: sanitizeUser(newUser),
        token,
        expiresAt
      }
    };
  },

  /**
   * Register a new student account
   */
  async registerStudent({ fullName, email, phone = '', college = '', course = '', year = '', password }) {
    await simulateLatency();

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (fullName || '').trim();
    const cleanPhone = (phone || '').trim();
    const cleanCollege = (college || '').trim();
    const cleanCourse = (course || '').trim();
    const cleanYear = (year || '').trim();

    if (!cleanName || cleanName.length < 2) {
      return { ok: false, error: 'Please enter your full name.' };
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }
    if (cleanPhone && cleanPhone.length < 8) {
      return { ok: false, error: 'Please enter a valid contact phone number.' };
    }
    if (!password || password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters long.' };
    }

    const users = db.get(db.KEYS.USERS);
    const existing = users.find(u => u.email === cleanEmail);
    if (existing) {
      return { ok: false, error: 'An account with this email address already exists. Please log in.' };
    }

    const salt = cryptoService.generateSalt();
    const hash = await cryptoService.hashPassword(password, salt);
    const userId = db.generateId('STU');

    const newUser = {
      id: userId,
      role: 'student', // Strictly 'student', never accept from client parameter
      fullName: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      college: cleanCollege,
      course: cleanCourse,
      year: cleanYear,
      avatarId: null,
      passwordHash: hash,
      passwordSalt: salt,
      failedAttempts: 0,
      lockedUntil: null,
      deletionRequested: false,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    db.set(db.KEYS.USERS, users);

    // Initial student welcome notification
    const notifications = db.get(db.KEYS.NOTIFICATIONS);
    notifications.push({
      id: db.generateId('NOTIF'),
      userId: newUser.id,
      title: 'Welcome to SGA Student Notes Portal',
      body: 'Your student account is now active. Explore curated architectural study notes, preview sample pages, and build your digital library.',
      requestId: null,
      noteId: null,
      read: false,
      createdAt: new Date().toISOString()
    });
    db.set(db.KEYS.NOTIFICATIONS, notifications);

    // Sync with Firebase Auth and Firestore
    try {
      await firebaseAuthService.register({
        email: cleanEmail,
        password,
        fullName: cleanName,
        role: 'student',
        phone: cleanPhone,
        college: cleanCollege,
        course: cleanCourse,
        year: cleanYear
      });
    } catch (fbErr) {
      console.warn('[Firebase] Student Auth sync note:', fbErr);
    }

    // Auto-login after registration
    const token = cryptoService.generateSessionToken();
    const expiresAt = new Date(Date.now() + CONFIG.SESSION_HOURS_STANDARD * 60 * 60 * 1000).toISOString();
    const sessions = db.get(db.KEYS.SESSIONS);
    sessions.push({ token, userId: newUser.id, expiresAt, createdAt: new Date().toISOString() });
    db.set(db.KEYS.SESSIONS, sessions);

    sessionStorage.setItem('sga_auth_token', token);

    return {
      ok: true,
      data: {
        user: sanitizeUser(newUser),
        token,
        expiresAt
      }
    };
  },

  /**
   * Log into client portal
   */
  async login({ email, password, rememberMe = false, portal = 'client' }) {
    await simulateLatency();

    const cleanEmail = (email || '').trim().toLowerCase();
    let users = db.get(db.KEYS.USERS);
    let userIndex = users.findIndex(u => u.email === cleanEmail);

    // Try authenticating via Firebase Auth if available
    let fbAuthUser = null;
    if (firebaseAuthService.isConfigured()) {
      try {
        const fbRes = await firebaseAuthService.login({ email: cleanEmail, password });
        if (fbRes.ok) {
          fbAuthUser = fbRes.data.user;
        }
      } catch (e) {
        console.warn('[Firebase] Login attempt note:', e);
      }
    }

    // If authenticated via Firebase but not yet present locally, sync user profile
    if (fbAuthUser && userIndex === -1) {
      const salt = cryptoService.generateSalt();
      const hash = await cryptoService.hashPassword(password, salt);
      const newUser = {
        id: fbAuthUser.id || db.generateId(fbAuthUser.role === 'student' ? 'STU' : 'USR'),
        role: fbAuthUser.role || portal,
        fullName: fbAuthUser.fullName || 'User',
        email: cleanEmail,
        phone: fbAuthUser.phone || '',
        college: fbAuthUser.college || '',
        course: fbAuthUser.course || '',
        year: fbAuthUser.year || '',
        avatarId: null,
        passwordHash: hash,
        passwordSalt: salt,
        failedAttempts: 0,
        lockedUntil: null,
        deletionRequested: false,
        createdAt: new Date().toISOString()
      };
      users.push(newUser);
      db.set(db.KEYS.USERS, users);
      userIndex = users.length - 1;
    }

    if (userIndex === -1 && !fbAuthUser) {
      return { ok: false, error: 'Invalid email or password.' };
    }

    const user = users[userIndex];

    // Enforce role boundaries between portals
    if (portal === 'student' && user.role !== 'student') {
      return { ok: false, error: 'This is a student account area. Please use the appropriate portal.' };
    }
    if (portal === 'client' && user.role !== 'client') {
      return { ok: false, error: 'This is a client account area. Please use the appropriate portal.' };
    }

    // Check account lockout
    if (user.lockedUntil) {
      const lockExpiry = new Date(user.lockedUntil);
      if (lockExpiry > new Date()) {
        const remainingMinutes = Math.ceil((lockExpiry - new Date()) / 60000);
        return {
          ok: false,
          error: `Account is temporarily locked due to too many failed attempts. Please try again in ${remainingMinutes} minute(s).`
        };
      } else {
        // Lock has elapsed
        user.lockedUntil = null;
        user.failedAttempts = 0;
      }
    }

    let isValid = false;
    if (fbAuthUser) {
      isValid = true;
    } else {
      isValid = await cryptoService.verifyPassword(password, user.passwordSalt, user.passwordHash);
    }

    if (!isValid) {
      user.failedAttempts = (user.failedAttempts || 0) + 1;
      if (user.failedAttempts >= CONFIG.MAX_LOGIN_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + CONFIG.LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString();
        db.set(db.KEYS.USERS, users);
        return {
          ok: false,
          error: `Too many failed login attempts. For security, your account is locked for ${CONFIG.LOCKOUT_DURATION_MINUTES} minutes.`
        };
      }
      db.set(db.KEYS.USERS, users);
      return { ok: false, error: 'Invalid email or password.' };
    }

    // Reset attempts on successful login
    user.failedAttempts = 0;
    user.lockedUntil = null;
    db.set(db.KEYS.USERS, users);

    // Create session token
    const token = cryptoService.generateSessionToken();
    const durationMs = rememberMe
      ? CONFIG.SESSION_DAYS_REMEMBER * 24 * 60 * 60 * 1000
      : CONFIG.SESSION_HOURS_STANDARD * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + durationMs).toISOString();

    const sessions = db.get(db.KEYS.SESSIONS);
    sessions.push({ token, userId: user.id, expiresAt, createdAt: new Date().toISOString() });
    db.set(db.KEYS.SESSIONS, sessions);

    if (rememberMe) {
      localStorage.setItem('sga_auth_token', token);
    } else {
      sessionStorage.setItem('sga_auth_token', token);
    }

    return {
      ok: true,
      data: {
        user: sanitizeUser(user),
        token,
        expiresAt
      }
    };
  },

  /**
   * Log out of current session
   */
  async logout() {
    await simulateLatency();
    const token = localStorage.getItem('sga_auth_token') || sessionStorage.getItem('sga_auth_token');
    if (token) {
      const sessions = db.get(db.KEYS.SESSIONS).filter(s => s.token !== token);
      db.set(db.KEYS.SESSIONS, sessions);
    }
    localStorage.removeItem('sga_auth_token');
    sessionStorage.removeItem('sga_auth_token');

    try {
      await firebaseAuthService.logout();
    } catch (e) {}

    return { ok: true, data: { loggedOut: true } };
  },

  /**
   * Get current authenticated user details
   */
  async getMe() {
    const user = getCurrentSessionUser();
    if (!user) {
      return { ok: false, error: 'Unauthenticated' };
    }
    return { ok: true, data: sanitizeUser(user) };
  },

  /**
   * Request password reset code
   */
  async forgotPassword(email) {
    await simulateLatency();

    const cleanEmail = (email || '').trim().toLowerCase();
    const users = db.get(db.KEYS.USERS);
    const userIndex = users.findIndex(u => u.email === cleanEmail);

    if (userIndex === -1) {
      // Do not reveal email existence to prevent user enumeration
      return {
        ok: true,
        data: {
          sent: true,
          demoCode: null,
          message: 'If an account exists with this email, a reset code has been issued.'
        }
      };
    }

    const code = cryptoService.generate6DigitCode();
    const salt = cryptoService.generateSalt();
    const codeHash = await cryptoService.hashCode(code, salt);

    users[userIndex].resetCodeHash = codeHash;
    users[userIndex].resetCodeSalt = salt;
    users[userIndex].resetExpiresAt = new Date(Date.now() + CONFIG.RESET_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();
    db.set(db.KEYS.USERS, users);

    return {
      ok: true,
      data: {
        sent: true,
        email: cleanEmail,
        // Provided for the on-screen Demo Mode banner as specified
        demoCode: code,
        expiresInMinutes: CONFIG.RESET_CODE_EXPIRY_MINUTES
      }
    };
  },

  /**
   * Reset password using 6-digit code
   */
  async resetPassword({ email, code, newPassword }) {
    await simulateLatency();

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanCode = (code || '').trim();

    if (!cleanCode || cleanCode.length !== 6) {
      return { ok: false, error: 'Please enter the 6-digit reset code.' };
    }
    if (!newPassword || newPassword.length < 8) {
      return { ok: false, error: 'New password must be at least 8 characters long.' };
    }

    const users = db.get(db.KEYS.USERS);
    const user = users.find(u => u.email === cleanEmail);

    if (!user || !user.resetCodeHash || !user.resetCodeSalt || !user.resetExpiresAt) {
      return { ok: false, error: 'Invalid or expired reset code. Please request a new code.' };
    }

    if (new Date(user.resetExpiresAt) < new Date()) {
      return { ok: false, error: 'Reset code has expired. Please request a new code.' };
    }

    const computedCodeHash = await cryptoService.hashCode(cleanCode, user.resetCodeSalt);
    if (computedCodeHash !== user.resetCodeHash) {
      return { ok: false, error: 'Incorrect reset code. Please check and try again.' };
    }

    // Set new password
    const newSalt = cryptoService.generateSalt();
    const newHash = await cryptoService.hashPassword(newPassword, newSalt);

    user.passwordSalt = newSalt;
    user.passwordHash = newHash;
    user.resetCodeHash = null;
    user.resetCodeSalt = null;
    user.resetExpiresAt = null;
    user.failedAttempts = 0;
    user.lockedUntil = null;

    db.set(db.KEYS.USERS, users);

    return { ok: true, data: { success: true, message: 'Password has been reset successfully.' } };
  },

  /**
   * Synchronize design requests
   */
  async syncRequestsFromCloud() {
    let localRequests = db.get(db.KEYS.REQUESTS) || [];
    db.set(db.KEYS.REQUESTS, localRequests);
  },

  /**
   * Dashboard statistics and feeds for current client
   */
  async getDashboard() {
    await simulateLatency();
    await this.syncRequestsFromCloud();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const allRequests = db.get(db.KEYS.REQUESTS);
    const myRequests = allRequests.filter(r => r.userId === user.id);

    const stats = {
      total: myRequests.length,
      pending: myRequests.filter(r => r.status === 'submitted' || r.status === 'under_review').length,
      inProgress: myRequests.filter(r => r.status === 'in_progress' || r.status === 'approved').length,
      completed: myRequests.filter(r => r.status === 'completed').length
    };

    // Last 5 requests sorted by submission date desc
    const recentRequests = [...myRequests]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map(r => {
        // Strip internal remarks
        const { internalRemarks, ...safeReq } = r;
        return safeReq;
      });

    // Recent notifications for this user
    const notifications = db.get(db.KEYS.NOTIFICATIONS)
      .filter(n => n.userId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    return {
      ok: true,
      data: {
        user: sanitizeUser(user),
        stats,
        recentRequests,
        notifications
      }
    };
  },

  /**
   * Create a new design request (SGA-2026-0001 format)
   */
  async createRequest(requestData) {
    await simulateLatency();
    await this.syncRequestsFromCloud();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const requests = db.get(db.KEYS.REQUESTS);

    // Calculate sequential number format SGA-YEAR-XXXX
    const currentYear = new Date().getFullYear();
    const yearRequests = requests.filter(r => r.id && r.id.startsWith(`SGA-${currentYear}`));
    const seqNum = String(yearRequests.length + 1).padStart(4, '0');
    const requestId = `SGA-${currentYear}-${seqNum}`;

    const newRequest = {
      id: requestId,
      userId: user.id,
      title: (requestData.title || '').trim(),
      projectType: requestData.projectType || 'Residential Building',
      siteLocation: (requestData.siteLocation || '').trim(),
      plotArea: (requestData.plotArea || '').trim(),
      plotUnit: requestData.plotUnit || 'sq ft',
      floors: requestData.floors || 'G+1',
      budget: requestData.budget || '₹25L - ₹50L',
      description: (requestData.description || '').trim(),
      clientInfo: {
        name: user.fullName,
        email: user.email,
        phone: user.phone
      },
      status: 'submitted', // submitted -> under_review -> approved -> in_progress -> completed (or rejected)
      files: requestData.files || [], // array of { id, name, size, type, category }
      timeline: [
        {
          step: 'submitted',
          label: 'Request Submitted',
          date: new Date().toISOString(),
          note: 'Project request received and queued for architectural review.'
        }
      ],
      messages: [
        {
          id: db.generateId('MSG'),
          author: 'SGA Studio Team',
          isStudio: true,
          text: 'Thank you for submitting your project requirements. Our principal architect is reviewing your plot measurements and reference files.',
          createdAt: new Date().toISOString()
        }
      ],
      internalRemarks: [], // Private internal remarks: NEVER returned to client by api.js
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    requests.push(newRequest);
    db.set(db.KEYS.REQUESTS, requests);

    // Add confirmation notification
    const notifications = db.get(db.KEYS.NOTIFICATIONS);
    notifications.push({
      id: db.generateId('NOTIF'),
      userId: user.id,
      title: `Request ${requestId} Submitted`,
      body: `Your request "${newRequest.title}" was registered successfully. Track status in your portal.`,
      requestId: newRequest.id,
      read: false,
      createdAt: new Date().toISOString()
    });
    db.set(db.KEYS.NOTIFICATIONS, notifications);

    const { internalRemarks, ...clientSafeRequest } = newRequest;
    return { ok: true, data: clientSafeRequest };
  },

  /**
   * List requests with search, filtering, sorting, pagination
   */
  async listRequests({ search = '', status = 'all', type = 'all', sort = 'newest', page = 1, limit = 8 } = {}) {
    await simulateLatency();
    await this.syncRequestsFromCloud();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    let items = db.get(db.KEYS.REQUESTS).filter(r => r.userId === user.id);

    // Search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(r =>
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q)) ||
        (r.siteLocation && r.siteLocation.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (status && status !== 'all') {
      items = items.filter(r => r.status === status);
    }

    // Type filter
    if (type && type !== 'all') {
      items = items.filter(r => r.projectType === type);
    }

    // Sort
    items.sort((a, b) => {
      if (sort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sort === 'title') return a.title.localeCompare(b.title);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const total = items.length;
    const startIndex = (page - 1) * limit;
    const paginated = items.slice(startIndex, startIndex + limit).map(r => {
      const { internalRemarks, ...safeReq } = r;
      return safeReq;
    });

    return {
      ok: true,
      data: {
        items: paginated,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  },

  /**
   * Get single request details by ID (enforces ownership and strips internal remarks)
   */
  async getRequest(id) {
    await simulateLatency();
    await this.syncRequestsFromCloud();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const requests = db.get(db.KEYS.REQUESTS);
    const req = requests.find(r => r.id === id);

    if (!req || req.userId !== user.id) {
      return { ok: false, error: 'Design request not found.' };
    }

    // NEVER return internalRemarks to client
    const { internalRemarks, ...clientSafeRequest } = req;
    return { ok: true, data: clientSafeRequest };
  },

  /**
   * Add a message from client on a request
   */
  async addMessage(requestId, messageText) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const cleanText = (messageText || '').trim();
    if (!cleanText) return { ok: false, error: 'Message cannot be empty.' };

    const requests = db.get(db.KEYS.REQUESTS);
    const reqIndex = requests.findIndex(r => r.id === requestId);

    if (reqIndex === -1 || requests[reqIndex].userId !== user.id) {
      return { ok: false, error: 'Design request not found.' };
    }

    const message = {
      id: db.generateId('MSG'),
      author: user.fullName,
      isStudio: false,
      text: cleanText,
      createdAt: new Date().toISOString()
    };

    requests[reqIndex].messages = requests[reqIndex].messages || [];
    requests[reqIndex].messages.push(message);
    requests[reqIndex].updatedAt = new Date().toISOString();
    db.set(db.KEYS.REQUESTS, requests);

    return { ok: true, data: message };
  },

  /**
   * Add additional files to an existing request (allowed while submitted or under_review)
   */
  async addFiles(requestId, fileRecords) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const requests = db.get(db.KEYS.REQUESTS);
    const reqIndex = requests.findIndex(r => r.id === requestId);

    if (reqIndex === -1 || requests[reqIndex].userId !== user.id) {
      return { ok: false, error: 'Design request not found.' };
    }

    const req = requests[reqIndex];
    if (req.status !== 'submitted' && req.status !== 'under_review') {
      return { ok: false, error: 'Additional files can only be attached while the request is under review.' };
    }

    if ((req.files.length + fileRecords.length) > CONFIG.MAX_FILES_PER_REQUEST) {
      return { ok: false, error: `Maximum ${CONFIG.MAX_FILES_PER_REQUEST} files permitted per design request.` };
    }

    req.files = [...req.files, ...fileRecords];
    req.updatedAt = new Date().toISOString();
    db.set(db.KEYS.REQUESTS, requests);

    const { internalRemarks, ...safeReq } = req;
    return { ok: true, data: safeReq };
  },

  /**
   * Cancel request (only allowed while still in "submitted" status)
   */
  async cancelRequest(requestId) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const requests = db.get(db.KEYS.REQUESTS);
    const reqIndex = requests.findIndex(r => r.id === requestId);

    if (reqIndex === -1 || requests[reqIndex].userId !== user.id) {
      return { ok: false, error: 'Design request not found.' };
    }

    if (requests[reqIndex].status !== 'submitted') {
      return { ok: false, error: 'Requests that have begun review or drafting cannot be cancelled directly.' };
    }

    requests[reqIndex].status = 'rejected';
    requests[reqIndex].timeline.push({
      step: 'rejected',
      label: 'Cancelled by Client',
      date: new Date().toISOString(),
      note: 'This request was cancelled by the client.'
    });
    requests[reqIndex].updatedAt = new Date().toISOString();
    db.set(db.KEYS.REQUESTS, requests);

    const { internalRemarks, ...safeReq } = requests[reqIndex];
    return { ok: true, data: safeReq };
  },

  /**
   * Upload binary file and store in local IndexedDB
   */
  async uploadFile(file, category = 'general') {
    if (!file) return { ok: false, error: 'No file provided.' };

    if (file.size > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
      return { ok: false, error: `File "${file.name}" exceeds the maximum limit of ${CONFIG.MAX_FILE_SIZE_MB}MB.` };
    }

    // Validate MIME + Magic Bytes signature
    const verifiedMime = await checkMagicBytes(file);
    if (!verifiedMime || !CONFIG.ALLOWED_MIME_TYPES.includes(verifiedMime)) {
      return { ok: false, error: `Invalid file format for "${file.name}". Only genuine PDF, JPG, and PNG files are accepted.` };
    }

    let driveFileId = null;

    try {
      const record = await db.storeBlob(file, {
        name: file.name,
        type: verifiedMime,
        size: file.size,
        category,
        driveFileId
      });
      return {
        ok: true,
        data: {
          id: record.id,
          name: record.name,
          size: record.size,
          type: record.type,
          category: record.category,
          driveFileId
        }
      };
    } catch (err) {
      console.error('File storage error:', err);
      return { ok: false, error: 'Storage quota exceeded. Please clear old items from Dev Tools or try smaller files.' };
    }
  },

  /**
   * Get file URL from IndexedDB Blob
   */
  async getFile(fileId) {
    let fileRecord = await db.getBlob(fileId);

    if (!fileRecord || !fileRecord.blob) {
      return { ok: false, error: 'File attachment not found.' };
    }
    const url = URL.createObjectURL(fileRecord.blob);
    return {
      ok: true,
      data: {
        url,
        name: fileRecord.name,
        type: fileRecord.type,
        size: fileRecord.size
      }
    };
  },

  /**
   * Notification endpoints
   */
  async listNotifications() {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const notifications = db.get(db.KEYS.NOTIFICATIONS)
      .filter(n => n.userId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const unreadCount = notifications.filter(n => !n.read).length;

    return {
      ok: true,
      data: {
        items: notifications,
        unreadCount
      }
    };
  },

  async markRead(notificationId) {
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const notifications = db.get(db.KEYS.NOTIFICATIONS);
    const n = notifications.find(item => item.id === notificationId && item.userId === user.id);
    if (n) {
      n.read = true;
      db.set(db.KEYS.NOTIFICATIONS, notifications);
    }
    return { ok: true, data: { success: true } };
  },

  async markAllRead() {
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const notifications = db.get(db.KEYS.NOTIFICATIONS);
    notifications.forEach(n => {
      if (n.userId === user.id) n.read = true;
    });
    db.set(db.KEYS.NOTIFICATIONS, notifications);
    return { ok: true, data: { success: true } };
  },

  async deleteNotification(notificationId) {
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const notifications = db.get(db.KEYS.NOTIFICATIONS)
      .filter(n => !(n.id === notificationId && n.userId === user.id));
    db.set(db.KEYS.NOTIFICATIONS, notifications);
    return { ok: true, data: { success: true } };
  },

  /**
   * Profile management
   */
  async getProfile() {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };
    return { ok: true, data: sanitizeUser(user) };
  },

  async updateProfile({ fullName, phone, address }) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const cleanName = (fullName || '').trim();
    const cleanPhone = (phone || '').trim();
    const cleanAddress = (address || '').trim();

    if (!cleanName || cleanName.length < 2) {
      return { ok: false, error: 'Full name must have at least 2 characters.' };
    }
    if (!cleanPhone || cleanPhone.length < 8) {
      return { ok: false, error: 'Please enter a valid phone number.' };
    }

    const users = db.get(db.KEYS.USERS);
    const idx = users.findIndex(u => u.id === user.id);
    if (idx === -1) return { ok: false, error: 'User record not found.' };

    users[idx].fullName = cleanName;
    users[idx].phone = cleanPhone;
    users[idx].address = cleanAddress;
    users[idx].updatedAt = new Date().toISOString();
    db.set(db.KEYS.USERS, users);

    return { ok: true, data: sanitizeUser(users[idx]) };
  },

  async uploadAvatar(blob) {
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const fileRecord = await db.storeBlob(blob, {
      name: `avatar_${user.id}.jpg`,
      type: 'image/jpeg',
      category: 'avatar'
    });

    const users = db.get(db.KEYS.USERS);
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      users[idx].avatarId = fileRecord.id;
      db.set(db.KEYS.USERS, users);
    }

    return { ok: true, data: { avatarId: fileRecord.id } };
  },

  async changePassword({ currentPassword, newPassword }) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    if (!newPassword || newPassword.length < 8) {
      return { ok: false, error: 'New password must be at least 8 characters long.' };
    }

    const isValid = await cryptoService.verifyPassword(currentPassword, user.passwordSalt, user.passwordHash);
    if (!isValid) {
      return { ok: false, error: 'Current password does not match.' };
    }

    const newSalt = cryptoService.generateSalt();
    const newHash = await cryptoService.hashPassword(newPassword, newSalt);

    const users = db.get(db.KEYS.USERS);
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      users[idx].passwordSalt = newSalt;
      users[idx].passwordHash = newHash;
      db.set(db.KEYS.USERS, users);
    }

    return { ok: true, data: { success: true, message: 'Password updated successfully.' } };
  },

  async requestAccountDeletion() {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const users = db.get(db.KEYS.USERS);
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      users[idx].deletionRequested = true;
      users[idx].deletionRequestedAt = new Date().toISOString();
      db.set(db.KEYS.USERS, users);
    }

    return { ok: true, data: { deletionRequested: true, message: 'Account deletion request submitted. An administrator will verify before permanently removing records.' } };
  },

  /**
   * Export all client data as JSON
   */
  async exportMyData() {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const myRequests = db.get(db.KEYS.REQUESTS).filter(r => r.userId === user.id).map(r => {
      const { internalRemarks, ...safe } = r;
      return safe;
    });

    const myNotifications = db.get(db.KEYS.NOTIFICATIONS).filter(n => n.userId === user.id);

    let studentData = {};
    if (user.role === 'student') {
      const myPurchases = db.get(db.KEYS.PURCHASES).filter(p => p.userId === user.id);
      const myPayments = db.get(db.KEYS.PAYMENTS).filter(p => p.userId === user.id);
      const myWishlist = db.get(db.KEYS.WISHLIST).filter(w => w.userId === user.id);
      const myReviews = db.get(db.KEYS.REVIEWS).filter(r => r.userId === user.id);
      studentData = { purchases: myPurchases, payments: myPayments, wishlist: myWishlist, reviews: myReviews };
    }

    const exportBundle = {
      exportedAt: new Date().toISOString(),
      studio: 'SGA (by NXT Services)',
      profile: sanitizeUser(user),
      requests: myRequests,
      notifications: myNotifications,
      ...studentData
    };

    return { ok: true, data: exportBundle };
  },

  // ==========================================
  // STUDENT PORTAL APIS
  // ==========================================

  /**
   * Update student profile fields
   */
  async updateStudentProfile({ fullName, phone, college, course, year }) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const cleanName = (fullName || '').trim();
    if (!cleanName || cleanName.length < 2) {
      return { ok: false, error: 'Name must be at least 2 characters.' };
    }

    const users = db.get(db.KEYS.USERS);
    const idx = users.findIndex(u => u.id === user.id);
    if (idx === -1) return { ok: false, error: 'User not found' };

    users[idx].fullName = cleanName;
    users[idx].phone = (phone || '').trim();
    users[idx].college = (college || '').trim();
    users[idx].course = (course || '').trim();
    users[idx].year = (year || '').trim();

    db.set(db.KEYS.USERS, users);
    return { ok: true, data: sanitizeUser(users[idx]) };
  },

  /**
   * Synchronize study notes from server database & Firestore
   */
  async syncNotesFromCloud() {
    let localNotes = db.get(db.KEYS.NOTES) || [];

    // 0. Primary: Fetch from server database backend (/api/notes)
    try {
      const resp = await fetch('/api/notes');
      if (resp.ok) {
        const json = await resp.json();
        if (json.ok && Array.isArray(json.data)) {
          localNotes = json.data;
          db.set(db.KEYS.NOTES, localNotes);
          return localNotes;
        }
      }
    } catch (apiErr) {
      console.warn('[Server DB] /api/notes fetch error:', apiErr);
    }

    // Fallback sync from Firestore if server is unreachable
    try {
      const fbRes = await firebaseDataService.getNotes();
      if (fbRes.ok && fbRes.data && Array.isArray(fbRes.data)) {
        const map = new Map();
        localNotes.forEach(n => map.set(n.id, n));
        fbRes.data.forEach(n => map.set(n.id, { ...map.get(n.id), ...n }));
        localNotes = Array.from(map.values());
        db.set(db.KEYS.NOTES, localNotes);
      }
    } catch (e) {
      console.warn('[Firebase] syncNotesFromCloud error:', e);
    }

    return localNotes;
  },

  /**
   * Get student dashboard overview
   */
  async getStudentDashboard() {
    await simulateLatency();
    await this.syncNotesFromCloud();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };
    if (user.role !== 'student' && user.role !== 'admin') {
      return { ok: false, error: 'Unauthorized. Student role required.' };
    }

    const allNotes = db.get(db.KEYS.NOTES).filter(n => n.published !== false);
    const purchases = db.get(db.KEYS.PURCHASES).filter(p => p.userId === user.id);
    const wishlist = db.get(db.KEYS.WISHLIST).filter(w => w.userId === user.id);
    const payments = db.get(db.KEYS.PAYMENTS).filter(p => p.userId === user.id && p.status === 'success');

    const purchasedNoteIds = new Set(purchases.map(p => p.noteId));
    const totalSpent = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // Map purchased notes with purchase metadata
    const purchasedNotes = purchases.map(p => {
      const note = allNotes.find(n => n.id === p.noteId) || { id: p.noteId, title: 'Archived Note', subject: 'Architecture', pages: 0, price: p.amount };
      return {
        ...note,
        purchaseId: p.id,
        purchasedAt: p.purchasedAt,
        lastPage: p.lastPage || 1,
        progressPercent: note.pages ? Math.min(100, Math.round(((p.lastPage || 1) / note.pages) * 100)) : 0
      };
    });

    // Continue reading list: sort by lastReadAt or purchasedAt
    const continueReading = [...purchasedNotes].sort((a, b) => new Date(b.lastReadAt || b.purchasedAt) - new Date(a.lastReadAt || a.purchasedAt)).slice(0, 4);

    // Recent purchases: last 5
    const recentPurchases = [...purchasedNotes].sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt)).slice(0, 5);

    // Recommended notes: unpurchased notes matching purchased subjects or top rated
    const purchasedSubjects = new Set(purchasedNotes.map(n => n.subject));
    let unpurchased = allNotes.filter(n => !purchasedNoteIds.has(n.id));
    
    // Prioritize same subject, then fallback
    let recommended = unpurchased.filter(n => purchasedSubjects.has(n.subject));
    if (recommended.length < 3) {
      recommended = [...recommended, ...unpurchased.filter(n => !recommended.includes(n))];
    }
    recommended = recommended.slice(0, 3);

    // Subjects with counts
    const subjectCounts = {};
    allNotes.forEach(n => {
      subjectCounts[n.subject] = (subjectCounts[n.subject] || 0) + 1;
    });

    return {
      ok: true,
      data: {
        totalAvailableNotes: allNotes.length,
        purchasedNotesCount: purchasedNotes.length,
        totalSpent,
        wishlistCount: wishlist.length,
        continueReading,
        recentPurchases,
        recommendedNotes: recommended,
        subjects: subjectCounts
      }
    };
  },

  /**
   * List published notes with filters, search, sort, and pagination
   */
  async listNotes({ search = '', subject = '', category = '', minPrice = 0, maxPrice = 10000, sort = 'newest', page = 1, limit = 12 } = {}) {
    const fetchedNotes = await this.syncNotesFromCloud();
    const user = getCurrentSessionUser();
    const purchases = user ? db.get(db.KEYS.PURCHASES).filter(p => p.userId === user.id) : [];
    const wishlist = user ? db.get(db.KEYS.WISHLIST).filter(w => w.userId === user.id) : [];
    const reviews = db.get(db.KEYS.REVIEWS) || [];

    const purchasedSet = new Set(purchases.map(p => p.noteId));
    const wishlistSet = new Set(wishlist.map(w => w.noteId));

    let notes = (Array.isArray(fetchedNotes) && fetchedNotes.length > 0) ? [...fetchedNotes] : (db.get(db.KEYS.NOTES) || []);
    notes = notes.filter(n => n.published !== false && n.status !== 'draft');

    // Search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      notes = notes.filter(n => 
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.subject && n.subject.toLowerCase().includes(q)) ||
        (n.description && n.description.toLowerCase().includes(q)) ||
        (n.author && n.author.toLowerCase().includes(q)) ||
        (Array.isArray(n.keyTopics) && n.keyTopics.some(t => t.toLowerCase().includes(q)))
      );
    }

    // Subject filter with flexible substring matching
    if (subject && subject !== 'all') {
      const s = subject.toLowerCase().trim();
      notes = notes.filter(n => {
        if (!n.subject) return false;
        const ns = n.subject.toLowerCase().trim();
        return ns === s || ns.includes(s) || s.includes(ns);
      });
    }

    // Category filter with flexible matching
    if (category && category !== 'all') {
      const c = category.toLowerCase().trim();
      notes = notes.filter(n => {
        if (!n.category) return false;
        const nc = n.category.toLowerCase().trim();
        return nc === c || nc.includes(c) || c.includes(nc);
      });
    }

    // Price range
    const minP = Number(minPrice) || 0;
    const maxP = Number(maxPrice) || 10000;
    if (maxP !== 2500) {
      notes = notes.filter(n => (Number(n.price) || 0) >= minP && (Number(n.price) || 0) <= maxP);
    } else {
      notes = notes.filter(n => (Number(n.price) || 0) >= minP);
    }

    // Compute ratings
    notes = notes.map(n => {
      const noteReviews = reviews.filter(r => r.noteId === n.id);
      const avgRating = noteReviews.length > 0 
        ? parseFloat((noteReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / noteReviews.length).toFixed(1))
        : (n.initialRating || 4.8);
      return {
        ...n,
        rating: avgRating,
        reviewCount: noteReviews.length || (n.initialReviewCount || 12),
        isPurchased: purchasedSet.has(n.id),
        isWishlisted: wishlistSet.has(n.id)
      };
    });

    // Sort
    if (sort === 'price-asc') {
      notes.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (sort === 'price-desc') {
      notes.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else if (sort === 'popular') {
      notes.sort((a, b) => (b.reviewCount * b.rating) - (a.reviewCount * a.rating));
    } else {
      // Newest
      notes.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }

    const total = notes.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 12);
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (pageNum - 1) * pageSize;
    const items = notes.slice(startIndex, startIndex + pageSize);

    return {
      ok: true,
      data: {
        items,
        total,
        page: pageNum,
        totalPages,
        limit: pageSize
      }
    };
  },

  /**
   * Helper: validates that a redirect/return URL is strictly internal (prevents open redirects)
   */
  validateInternalReturnUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const clean = url.trim();
    // Disallow absolute protocol-relative, javascript, or external schema URLs
    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('//') || clean.startsWith('javascript:')) {
      return null;
    }
    // Must begin with relative dot or standard portal page name/slash
    if (clean.startsWith('/') || clean.startsWith('./') || clean.startsWith('../') || /^[a-zA-Z0-9_\-]+\.html(\?.*)?$/.test(clean)) {
      return clean;
    }
    return null;
  },

  /**
   * Get Website Content & Contact settings
   * Merges stored admin settings with canonical fallback defaults
   */
  async getSiteContent() {
    const raw = db.get(db.KEYS.SITE_CONTENT) || {};
    const fallback = {
      businessName: 'Shilp Griha Associate',
      shortName: 'SGA',
      founderName: 'Ar. Vikas Verma',
      founderRole: 'Architect, Founder',
      tagline: 'नक्शा सही, निर्माण सही',
      aboutText: 'Shilp Griha Associate is an architectural and interior design practice led by Ar. Vikas Verma. We create practical, modern homes and commercial spaces with careful planning, clear 3D visuals and Vastu-friendly layouts, working closely with you from the first idea to the final drawings.',
      founderPhoto: '/assets/aistudio/image_7f9d650c.png',
      phone: '+91 79854 36965',
      phoneTel: '+917985436965',
      whatsapp: 'https://wa.me/917985436965',
      email: 'ar.vikasverma0401@gmail.com',
      domain: CONFIG.SITE_DOMAIN || 'www.sgaup31.in',
      address: 'Laxmi Nagar Colony, Cinema Road, in front of Shree Siddhivinayak Palace, Gola Gokarnath, Lakhimpur Kheri, Uttar Pradesh 262802, India',
      serviceArea: 'Gola Gokarnath, Lakhimpur Kheri and nearby areas of Uttar Pradesh',
      directionsUrl: 'https://www.google.com/maps?gs_lcrp=EgZjaHJvbWUqCggAEAAY4wIYgAQyCggAEAAY4wIYgAQyDQgBEC4YrwEYxwEYgAQyBggCEEUYOTINCAMQABiGAxiABBiKBTINCAQQABiGAxiABBiKBTIKCAUQABiABBiiBDIKCAYQABiABBiiBDIGCAcQRRg80gEJMTA2NTRqMGo3qAIAsAIA&um=1&ie=UTF-8&fb=1&gl=in&sa=X&geocode=Kc-4FEcAQ585Metx1h-VJKp4&daddr=Gola+Gokaran+Nath,+Gola,+Uttar+Pradesh+262802',
      mapEmbedUrl: 'https://www.google.com/maps?q=Gola+Gokaran+Nath,+Gola,+Uttar+Pradesh+262802&output=embed',
      hours: 'Hours: to be confirmed',
      socialLinks: {
        instagram: '',
        justdial: '',
        googleReview: ''
      }
    };
    const merged = { ...fallback, ...raw, socialLinks: { ...fallback.socialLinks, ...(raw.socialLinks || {}) } };
    return { ok: true, data: merged };
  },

  /**
   * RECENT WORK / PORTFOLIO: Items visible on the home slider
   * Returns published portfolio items marked for home slider, or canonical sample placeholders
   */
  async listHomeSliderWork() {
    await simulateLatency();
    const stored = db.get(db.KEYS.PORTFOLIO) || [];
    const sliderItems = stored.filter(item => item && item.visible !== false && (item.showOnHomeSlider || item.showOnHome));

    if (sliderItems.length > 0) {
      return {
        ok: true,
        data: sliderItems.map(item => ({
          id: item.id,
          title: item.title || 'Architectural Project',
          location: item.location || 'Uttar Pradesh',
          thumbnail: item.thumbnail || item.image || '/assets/images/work/work-01.svg',
          fullImage: item.fullImage || item.image || item.thumbnail || '/assets/images/work/work-01.svg',
          altText: item.altText || `${item.title || 'Architectural project'} - Shilp Griha Associate`,
          isSample: false
        }))
      };
    }

    // 14 real architectural portfolio projects designed by Ar. Vikas Verma / SGA
    const actualProjects = [
      {
        id: 'WORK-01',
        title: 'Contemporary 3-Storey Villa',
        location: 'Exterior 3D Elevation',
        thumbnail: '/assets/images/portfolio/project-01.png',
        fullImage: '/assets/images/portfolio/project-01.png',
        altText: 'Modern 3-storey villa exterior elevation with warm architectural lighting - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-02',
        title: 'Triple-Height Vertical Facade',
        location: 'Modern Elevation Design',
        thumbnail: '/assets/images/portfolio/project-02.png',
        fullImage: '/assets/images/portfolio/project-02.png',
        altText: 'Vertical 3-floor residential facade with glass slit & linear louvers - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-03',
        title: 'Calacatta Gold Suite',
        location: 'Luxury Bathroom Interior',
        thumbnail: '/assets/images/portfolio/project-03.png',
        fullImage: '/assets/images/portfolio/project-03.png',
        altText: 'Luxury marble bathroom design with gold trim and arched LED mirror - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-04',
        title: 'Warm Minimalist Suite',
        location: 'Master Bedroom Design',
        thumbnail: '/assets/images/portfolio/project-04.png',
        fullImage: '/assets/images/portfolio/project-04.png',
        altText: 'Master bedroom interior with bay window seating and custom millwork - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-05',
        title: 'Corporate Studio Hub',
        location: 'Commercial Workspaces',
        thumbnail: '/assets/images/portfolio/project-05.png',
        fullImage: '/assets/images/portfolio/project-05.png',
        altText: 'Modern corporate office workstations with biophilic ceiling trellis - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-06',
        title: 'Garden Gazebo Lounge',
        location: 'Landscape Architecture',
        thumbnail: '/assets/images/portfolio/project-06.png',
        fullImage: '/assets/images/portfolio/project-06.png',
        altText: 'Wooden outdoor pergola lounge with paved landscape lighting - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-07',
        title: 'Vanity & Acoustic Lounge',
        location: 'Interior Space Planning',
        thumbnail: '/assets/images/portfolio/project-07.png',
        fullImage: '/assets/images/portfolio/project-07.png',
        altText: 'Modern bedroom with fluted acoustic paneling and vanity mirror - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-08',
        title: 'Bespoke Master Bedroom',
        location: 'Luxury Interior Concept',
        thumbnail: '/assets/images/portfolio/project-08.png',
        fullImage: '/assets/images/portfolio/project-08.png',
        altText: 'Contemporary bedroom with chevron wood panels and gold orb pendants - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-09',
        title: 'Grand Classical Villa',
        location: 'Bungalow Elevation',
        thumbnail: '/assets/images/portfolio/project-09.png',
        fullImage: '/assets/images/portfolio/project-09.png',
        altText: 'Classical bungalow facade with grand arched entrance and landscaped driveway - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-10',
        title: 'Luxury Salon & Studio',
        location: 'Commercial Interiors',
        thumbnail: '/assets/images/portfolio/project-10.png',
        fullImage: '/assets/images/portfolio/project-10.png',
        altText: 'Modern beauty salon interior with geometric flooring and illuminated display units - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-11',
        title: 'Rooftop Pergola Deck',
        location: 'Outdoor Living Design',
        thumbnail: '/assets/images/portfolio/project-11.png',
        fullImage: '/assets/images/portfolio/project-11.png',
        altText: 'Terrace roof garden with timber pergola and integrated bench seating - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-12',
        title: 'Design Team Workspaces',
        location: 'Studio Interior Architecture',
        thumbnail: '/assets/images/portfolio/project-12.png',
        fullImage: '/assets/images/portfolio/project-12.png',
        altText: 'Modern collaborative design office with custom shelving and ergonomic stations - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-13',
        title: 'Contemporary Duplex',
        location: '2-Storey Front Elevation',
        thumbnail: '/assets/images/portfolio/project-13.png',
        fullImage: '/assets/images/portfolio/project-13.png',
        altText: 'Urban contemporary 2-storey house facade with wooden accents - Shilp Griha Associate',
        isSample: false
      },
      {
        id: 'WORK-14',
        title: 'Studio Welcome Reception',
        location: 'Reception & Client Lounge',
        thumbnail: '/assets/images/portfolio/project-14.png',
        fullImage: '/assets/images/portfolio/project-14.png',
        altText: 'Studio reception lounge with fluted glass partition and cobalt blue seating - Shilp Griha Associate',
        isSample: false
      }
    ];

    return {
      ok: true,
      data: actualProjects
    };
  },

  /**
   * ABOUT CONTENT: Public read-only about page content
   * Merges admin settings with canonical fallback business defaults
   */
  async getAboutContent() {
    await simulateLatency();
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
      phone: siteRaw.phone || '+91 79854 36965',
      phoneTel: siteRaw.phoneTel || '+917985436965',
      whatsapp: siteRaw.whatsapp || 'https://wa.me/917985436965',
      email: siteRaw.email || 'ar.vikasverma0401@gmail.com',
      address: siteRaw.address || 'Laxmi Nagar Colony, Cinema Road, in front of Shree Siddhivinayak Palace, Gola Gokarnath, Lakhimpur Kheri, Uttar Pradesh 262802, India',
      serviceArea: siteRaw.serviceArea || 'Gola Gokarnath, Lakhimpur Kheri and nearby areas of Uttar Pradesh',
      hours: siteRaw.hours || 'Hours: to be confirmed',
      directionsUrl: siteRaw.directionsUrl || 'https://www.google.com/maps?gs_lcrp=EgZjaHJvbWUqCggAEAAY4wIYgAQyCggAEAAY4wIYgAQyDQgBEC4YrwEYxwEYgAQyBggCEEUYOTINCAMQABiGAxiABBiKBTINCAQQABiGAxiABBiKBTIKCAUQABiABBiiBDIKCAYQABiABBiiBDIGCAcQRRg80gEJMTA2NTRqMGo3qAIAsAIA&um=1&ie=UTF-8&fb=1&gl=in&sa=X&geocode=Kc-4FEcAQ585Metx1h-VJKp4&daddr=Gola+Gokaran+Nath,+Gola,+Uttar+Pradesh+262802',
      mapEmbedUrl: 'https://www.google.com/maps?q=Gola+Gokaran+Nath,+Gola,+Uttar+Pradesh+262802&output=embed',
      socialLinks: {
        instagram: (siteRaw.socialLinks && siteRaw.socialLinks.instagram) || '',
        justdial: (siteRaw.socialLinks && siteRaw.socialLinks.justdial) || '',
        googleReview: (siteRaw.socialLinks && siteRaw.socialLinks.googleReview) || ''
      }
    };

    const merged = {
      ...fallback,
      ...aboutRaw,
      socialLinks: { ...fallback.socialLinks, ...(aboutRaw.socialLinks || {}) },
      services: (aboutRaw.services && Array.isArray(aboutRaw.services)) ? aboutRaw.services.filter(s => s && s.visible !== false) : fallback.services,
      projectChips: (aboutRaw.projectChips && Array.isArray(aboutRaw.projectChips)) ? aboutRaw.projectChips : fallback.projectChips,
      whyUsPoints: (aboutRaw.whyUsPoints && Array.isArray(aboutRaw.whyUsPoints)) ? aboutRaw.whyUsPoints : fallback.whyUsPoints,
      processSteps: (aboutRaw.processSteps && Array.isArray(aboutRaw.processSteps)) ? aboutRaw.processSteps : fallback.processSteps
    };

    return { ok: true, data: merged };
  },

  /**
   * PORTFOLIO: Public list of visible work items with category filtering and pagination
   */
  async listPortfolio({ category = 'all', page = 1, limit = 12 } = {}) {
    await simulateLatency();
    let stored = db.get(db.KEYS.PORTFOLIO);

    // Initial canonical seeding if empty
    if (!stored || !Array.isArray(stored) || stored.length === 0) {
      stored = [
        {
          id: 'PRJ-01',
          title: 'Contemporary 3-Storey Villa',
          category: 'Exterior Elevations',
          location: 'Gola Gokarnath',
          year: '2026',
          shortDescription: 'Modern 3-storey villa exterior elevation with warm architectural lighting and rooftop terrace.',
          thumbnail: '/assets/images/portfolio/project-01.png',
          fullImage: '/assets/images/portfolio/project-01.png',
          altText: 'Modern 3-storey villa exterior elevation with warm architectural lighting - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 1
        },
        {
          id: 'PRJ-02',
          title: 'Triple-Height Vertical Facade',
          category: 'Exterior Elevations',
          location: 'Lakhimpur Kheri',
          year: '2026',
          shortDescription: 'Vertical 3-floor residential facade with glass slit & linear wood-finish louvers.',
          thumbnail: '/assets/images/portfolio/project-02.png',
          fullImage: '/assets/images/portfolio/project-02.png',
          altText: 'Vertical 3-floor residential facade with glass slit & linear louvers - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 2
        },
        {
          id: 'PRJ-03',
          title: 'Calacatta Gold Suite',
          category: 'Interior Design',
          location: 'Gola Gokarnath',
          year: '2026',
          shortDescription: 'Luxury marble bathroom design with gold trim, walk-in shower and arched LED mirror.',
          thumbnail: '/assets/images/portfolio/project-03.png',
          fullImage: '/assets/images/portfolio/project-03.png',
          altText: 'Luxury marble bathroom design with gold trim and arched LED mirror - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 3
        },
        {
          id: 'PRJ-04',
          title: 'Warm Minimalist Suite',
          category: 'Interior Design',
          location: 'Uttar Pradesh',
          year: '2026',
          shortDescription: 'Master bedroom interior with bay window seating, accent lighting and custom millwork.',
          thumbnail: '/assets/images/portfolio/project-04.png',
          fullImage: '/assets/images/portfolio/project-04.png',
          altText: 'Master bedroom interior with bay window seating and custom millwork - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 4
        },
        {
          id: 'PRJ-05',
          title: 'Corporate Studio Hub',
          category: 'Commercial Spaces',
          location: 'Gola Gokarnath',
          year: '2026',
          shortDescription: 'Modern corporate office workstations with biophilic ceiling trellis and custom acoustic screens.',
          thumbnail: '/assets/images/portfolio/project-05.png',
          fullImage: '/assets/images/portfolio/project-05.png',
          altText: 'Modern corporate office workstations with biophilic ceiling trellis - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 5
        },
        {
          id: 'PRJ-06',
          title: 'Garden Gazebo Lounge',
          category: 'Landscape Architecture',
          location: 'Lakhimpur Kheri',
          year: '2026',
          shortDescription: 'Wooden outdoor pergola lounge with paved landscape lighting and green garden boundary.',
          thumbnail: '/assets/images/portfolio/project-06.png',
          fullImage: '/assets/images/portfolio/project-06.png',
          altText: 'Wooden outdoor pergola lounge with paved landscape lighting - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 6
        },
        {
          id: 'PRJ-07',
          title: 'Vanity & Acoustic Lounge',
          category: 'Interior Design',
          location: 'Gola Gokarnath',
          year: '2025',
          shortDescription: 'Modern bedroom with fluted acoustic paneling, suspended vanity unit and ambient cove lights.',
          thumbnail: '/assets/images/portfolio/project-07.png',
          fullImage: '/assets/images/portfolio/project-07.png',
          altText: 'Modern bedroom with fluted acoustic paneling and vanity mirror - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 7
        },
        {
          id: 'PRJ-08',
          title: 'Bespoke Master Bedroom',
          category: 'Interior Design',
          location: 'Uttar Pradesh',
          year: '2025',
          shortDescription: 'Contemporary bedroom with chevron wood panels, gold orb pendants and tailored storage.',
          thumbnail: '/assets/images/portfolio/project-08.png',
          fullImage: '/assets/images/portfolio/project-08.png',
          altText: 'Contemporary bedroom with chevron wood panels and gold orb pendants - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 8
        },
        {
          id: 'PRJ-09',
          title: 'Grand Classical Villa',
          category: 'Exterior Elevations',
          location: 'Gola Gokarnath',
          year: '2026',
          shortDescription: 'Classical bungalow facade with grand arched entrance, symmetry, and landscaped driveway.',
          thumbnail: '/assets/images/portfolio/project-09.png',
          fullImage: '/assets/images/portfolio/project-09.png',
          altText: 'Classical bungalow facade with grand arched entrance and landscaped driveway - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 9
        },
        {
          id: 'PRJ-10',
          title: 'Luxury Salon & Studio',
          category: 'Commercial Spaces',
          location: 'Gola Gokarnath',
          year: '2025',
          shortDescription: 'Modern beauty salon interior with geometric flooring, backlit mirrors and display showcases.',
          thumbnail: '/assets/images/portfolio/project-10.png',
          fullImage: '/assets/images/portfolio/project-10.png',
          altText: 'Modern beauty salon interior with geometric flooring and illuminated display units - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 10
        },
        {
          id: 'PRJ-11',
          title: 'Rooftop Pergola Deck',
          category: 'Landscape Architecture',
          location: 'Lakhimpur Kheri',
          year: '2025',
          shortDescription: 'Terrace roof garden with timber pergola, integrated bench seating and planters.',
          thumbnail: '/assets/images/portfolio/project-11.png',
          fullImage: '/assets/images/portfolio/project-11.png',
          altText: 'Terrace roof garden with timber pergola and integrated bench seating - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 11
        },
        {
          id: 'PRJ-12',
          title: 'Design Team Workspaces',
          category: 'Commercial Spaces',
          location: 'Gola Gokarnath',
          year: '2026',
          shortDescription: 'Modern collaborative design office with custom shelving, wall graphics and ergonomic stations.',
          thumbnail: '/assets/images/portfolio/project-12.png',
          fullImage: '/assets/images/portfolio/project-12.png',
          altText: 'Modern collaborative design office with custom shelving and ergonomic stations - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 12
        },
        {
          id: 'PRJ-13',
          title: 'Contemporary Duplex',
          category: 'Exterior Elevations',
          location: 'Uttar Pradesh',
          year: '2025',
          shortDescription: 'Urban contemporary 2-storey house facade with warm wooden accents and corner glazing.',
          thumbnail: '/assets/images/portfolio/project-13.png',
          fullImage: '/assets/images/portfolio/project-13.png',
          altText: 'Urban contemporary 2-storey house facade with wooden accents - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 13
        },
        {
          id: 'PRJ-14',
          title: 'Studio Welcome Reception',
          category: 'Commercial Spaces',
          location: 'Gola Gokarnath',
          year: '2026',
          shortDescription: 'Studio reception lounge with fluted glass partition and cobalt blue comfortable client seating.',
          thumbnail: '/assets/images/portfolio/project-14.png',
          fullImage: '/assets/images/portfolio/project-14.png',
          altText: 'Studio reception lounge with fluted glass partition and cobalt blue seating - Shilp Griha Associate',
          showOnHomeSlider: true,
          visible: true,
          order: 14
        }
      ];
      db.set(db.KEYS.PORTFOLIO, stored);
    }

    // Filter strictly visible items
    const visibleItems = stored.filter(item => item && item.visible !== false);

    // Extract dynamic unique categories from visible items
    const categoriesSet = new Set();
    visibleItems.forEach(item => {
      if (item.category && typeof item.category === 'string') {
        categoriesSet.add(item.category.trim());
      }
    });
    const categories = Array.from(categoriesSet);

    // Category filtering
    let filtered = visibleItems;
    if (category && category.toLowerCase() !== 'all') {
      const targetSlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      filtered = visibleItems.filter(item => {
        const itemCat = (item.category || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return itemCat === targetSlug || (item.category || '').toLowerCase() === category.toLowerCase();
      });
    }

    // Sort by order ascending
    filtered.sort((a, b) => (a.order || 999) - (b.order || 999));

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 12);
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = filtered.slice(0, startIndex + limitNum);

    return {
      ok: true,
      data: {
        items: paginated.map(p => ({
          id: p.id,
          title: p.title || 'Architectural Project',
          category: p.category || 'General',
          location: p.location || 'Uttar Pradesh',
          year: p.year || '',
          shortDescription: p.shortDescription || p.description || '',
          thumbnail: p.thumbnail || p.image || '/assets/images/portfolio/project-01.png',
          fullImage: p.fullImage || p.image || p.thumbnail || '/assets/images/portfolio/project-01.png',
          altText: p.altText || `${p.title || 'Project'} - Shilp Griha Associate`,
          isSample: Boolean(p.isSample)
        })),
        categories,
        total: filtered.length,
        displayedCount: paginated.length,
        hasMore: (startIndex + limitNum) < filtered.length,
        page: pageNum,
        limit: limitNum
      }
    };
  },

  /**
   * TESTIMONIALS: Public testimonials retrieval
   * Reads published active testimonials, falling back to sample items marked 'Sample'
   */
  async listPublicTestimonials() {
    await simulateLatency();
    const stored = db.get(db.KEYS.TESTIMONIALS) || [];
    const active = stored.filter(t => t && t.active !== false);

    if (active.length > 0) {
      return {
        ok: true,
        data: active.map(t => ({
          id: t.id,
          name: t.name || 'Anonymous Client',
          role: t.role || 'Client',
          quote: t.quote || '',
          isSample: false
        }))
      };
    }

    // Canonical sample testimonials
    const sampleTestimonials = [
      {
        id: 'TEST-SAMPLE-01',
        name: 'A. Sharma',
        role: 'Residential client',
        quote: 'The planning process felt clear and considered. It was easy to understand how each space would work before moving ahead.',
        isSample: true
      },
      {
        id: 'TEST-SAMPLE-02',
        name: 'R. Mehta',
        role: 'Design client',
        quote: 'The 3D elevation gave us complete clarity on proportions, materials, and natural light before construction started.',
        isSample: true
      },
      {
        id: 'TEST-SAMPLE-03',
        name: 'N. Verma',
        role: 'Planning client',
        quote: 'I appreciated the practical approach to design discussions. The ideas stayed connected to the practical needs of the project.',
        isSample: true
      }
    ];

    return {
      ok: true,
      data: sampleTestimonials
    };
  },

  /**
   * SUBJECTS: Dynamic subject store retrieval
   */
  async listSubjects() {
    await simulateLatency();
    const fetchedNotes = await this.syncNotesFromCloud();
    const notes = (Array.isArray(fetchedNotes) && fetchedNotes.length > 0) ? fetchedNotes : (db.get(db.KEYS.NOTES) || []);
    const publishedNotes = notes.filter(n => n.published !== false && n.status !== 'draft');

    // Retrieve saved subjects from db
    let subjects = db.get(db.KEYS.SUBJECTS) || [];

    // Also auto-discover any subject present in published notes that might not yet be in subjects list
    const knownNames = new Set(subjects.map(s => s.name.toLowerCase().trim()));
    publishedNotes.forEach(n => {
      if (n.subject && n.subject.trim()) {
        const trimmed = n.subject.trim();
        if (!knownNames.has(trimmed.toLowerCase())) {
          knownNames.add(trimmed.toLowerCase());
          const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          subjects.push({
            id: 'SUB_' + Math.random().toString(36).substr(2, 9),
            name: trimmed,
            slug: slug || 'general',
            createdAt: new Date().toISOString()
          });
        }
      }
    });

    // Compute active note counts
    const subjectListWithCounts = subjects.map(s => {
      const sSlug = (s.slug || s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).toLowerCase();
      const count = publishedNotes.filter(n => {
        if (!n.subject) return false;
        const noteSlug = n.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return noteSlug === sSlug || n.subject.toLowerCase().trim() === s.name.toLowerCase().trim();
      }).length;
      return {
        ...s,
        noteCount: count
      };
    });

    // Save back if new discovered
    db.set(db.KEYS.SUBJECTS, subjects);

    return {
      ok: true,
      data: subjectListWithCounts
    };
  },

  /**
   * PUBLIC NOTES: Returns ONLY sanitized metadata.
   * NEVER returns the PDF file or private download/storage reference.
   */
  async listPublicNotes({ subject = '', search = '', sort = 'newest', page = 1, limit = 12 } = {}) {
    await simulateLatency();
    const fetchedNotes = await this.syncNotesFromCloud();
    let notes = (Array.isArray(fetchedNotes) && fetchedNotes.length > 0) ? [...fetchedNotes] : (db.get(db.KEYS.NOTES) || []);
    
    // Strict filter: published only, never drafts or archived
    notes = notes.filter(n => n.published !== false && n.status !== 'draft' && n.status !== 'archived');

    // Subject filtering (by slug or name)
    if (subject && subject !== 'all') {
      const target = subject.toLowerCase().trim();
      notes = notes.filter(n => {
        if (!n.subject) return false;
        const sName = n.subject.toLowerCase().trim();
        const sSlug = sName.replace(/[^a-z0-9]+/g, '-');
        return sSlug === target || sName === target;
      });
    }

    // Keyword search
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      notes = notes.filter(n => 
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.subject && n.subject.toLowerCase().includes(q)) ||
        (n.description && n.description.toLowerCase().includes(q)) ||
        (Array.isArray(n.keyTopics) && n.keyTopics.some(t => t.toLowerCase().includes(q)))
      );
    }

    // Sorting
    if (sort === 'price-asc') {
      notes.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (sort === 'price-desc') {
      notes.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else {
      // Newest first
      notes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    const total = notes.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 12);
    const totalPages = Math.ceil(total / pageSize) || 1;
    const paginated = notes.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    // Strict public projection: returns only public metadata, NEVER includes PDF file, buffer or private storage references
    const publicItems = paginated.map(n => {
      const sName = (n.subject || 'Architecture').trim();
      const sSlug = sName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const thumb = n.coverUrl || n.thumbnailUrl || (n.coverImage ? n.coverImage : null) || '';
      return {
        id: n.id,
        title: n.title || 'Untitled Note',
        subject: sName,
        subjectSlug: sSlug,
        description: n.description || '',
        pages: Number(n.pages) || Number(n.pageCount) || 40,
        price: Number(n.price) || 0,
        previewPages: Number(n.previewPages) || 3,
        thumbnail: thumb,
        thumbnailUrl: thumb,
        updatedAt: n.updatedAt || n.createdAt || new Date().toISOString()
      };
    });

    return {
      ok: true,
      data: {
        items: publicItems,
        total,
        page: pageNum,
        totalPages,
        limit: pageSize
      }
    };
  },

  /**
   * Get single note details
   */
  async getNote(noteId) {
    await simulateLatency();
    await this.syncNotesFromCloud();
    const user = getCurrentSessionUser();
    let notes = db.get(db.KEYS.NOTES) || [];
    let note = notes.find(n => n.id === noteId);

    // If note not in local storage yet, fetch directly from Firestore
    if (!note) {
      try {
        const fbRes = await firebaseDataService.getNote(noteId);
        if (fbRes.ok && fbRes.data) {
          note = fbRes.data;
          notes.unshift(note);
          db.set(db.KEYS.NOTES, notes);
        }
      } catch (e) {
        console.warn('[Firebase] Direct note fetch note:', e);
      }
    }

    if (!note) return { ok: false, error: 'Note not found.' };

    const reviews = db.get(db.KEYS.REVIEWS).filter(r => r.noteId === noteId);
    const avgRating = reviews.length > 0 
      ? parseFloat((reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length).toFixed(1))
      : (note.initialRating || 4.8);

    let isPurchased = false;
    let isWishlisted = false;
    let purchaseRecord = null;

    if (user) {
      const purchases = db.get(db.KEYS.PURCHASES).filter(p => p.userId === user.id);
      purchaseRecord = purchases.find(p => p.noteId === noteId);
      isPurchased = !!purchaseRecord;

      const wishlist = db.get(db.KEYS.WISHLIST).filter(w => w.userId === user.id);
      isWishlisted = wishlist.some(w => w.noteId === noteId);
    }

    // Related notes
    const related = notes
      .filter(n => n.id !== noteId && n.published !== false && n.subject === note.subject)
      .slice(0, 3);

    return {
      ok: true,
      data: {
        ...note,
        rating: avgRating,
        reviewCount: reviews.length || (note.initialReviewCount || 12),
        reviews,
        isPurchased,
        isWishlisted,
        purchaseRecord: purchaseRecord ? { id: purchaseRecord.id, purchasedAt: purchaseRecord.purchasedAt, lastPage: purchaseRecord.lastPage || 1 } : null,
        related
      }
    };
  },

  /**
   * Get note preview (only first N pages)
   */
  async getNotePreview(noteId) {
    await simulateLatency();
    await this.syncNotesFromCloud();
    const notes = db.get(db.KEYS.NOTES) || [];
    let note = notes.find(n => n.id === noteId);

    if (!note) {
      try {
        const fbRes = await firebaseDataService.getNote(noteId);
        if (fbRes.ok && fbRes.data) {
          note = fbRes.data;
        }
      } catch (e) {}
    }

    if (!note) return { ok: false, error: 'Note not found.' };

    const fileId = note.fileId || note.fileBlobId;
    let fileRecord = null;
    // 0. Primary: Server Database Backend PDF Preview
    let serverPreviewUrl = null;
    try {
      const headResp = await fetch(`/api/notes/${note.id}/preview-pdf`, { method: 'HEAD' });
      if (headResp.ok) {
        serverPreviewUrl = `/api/notes/${note.id}/preview-pdf`;
      }
    } catch {}

    // 2. Local IndexedDB cache
    if (!serverPreviewUrl && !fileRecord && fileId) {
      fileRecord = await db.getBlob(fileId);
    }

    // 3. Firestore cloud document fallback
    if (!serverPreviewUrl && !fileRecord && fileId) {
      try {
        const cloudFile = await firebaseDataService.getNoteFile(fileId);
        if (cloudFile && cloudFile.blob) {
          fileRecord = await db.storeBlob(cloudFile.blob, {
            id: fileId,
            name: cloudFile.name || `${note.title}.pdf`,
            type: cloudFile.type || 'application/pdf',
            size: cloudFile.size
          });
        }
      } catch (cloudErr) {
        console.warn('[Firebase] Cloud PDF fetch warning:', cloudErr);
      }
    }

    return {
      ok: true,
      data: {
        noteId: note.id,
        title: note.title,
        subject: note.subject,
        pages: note.pages || 0,
        previewPages: note.previewPages || CONFIG.NOTES_PREVIEW_PAGES || 3,
        hasFile: Boolean(serverPreviewUrl || fileRecord),
        fileUrl: serverPreviewUrl || (fileRecord ? URL.createObjectURL(fileRecord.blob) : null)
      }
    };
  },

  /**
   * Save student reading progress (last page viewed)
   */
  async saveNoteProgress(noteId, lastPage) {
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const purchases = db.get(db.KEYS.PURCHASES);
    const idx = purchases.findIndex(p => p.userId === user.id && p.noteId === noteId);
    if (idx !== -1) {
      purchases[idx].lastPage = Math.max(1, parseInt(lastPage, 10) || 1);
      purchases[idx].lastReadAt = new Date().toISOString();
      db.set(db.KEYS.PURCHASES, purchases);
      return { ok: true, data: { saved: true, lastPage: purchases[idx].lastPage } };
    }
    return { ok: false, error: 'Purchase record not found' };
  },

  /**
   * Create an Order for one or multiple notes
   */
  async createOrder(noteIds) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Please log in to continue with checkout.' };
    if (user.role !== 'student' && user.role !== 'admin') {
      return { ok: false, error: 'This is a student account area. Please use Student Login.' };
    }

    const ids = Array.isArray(noteIds) ? noteIds : [noteIds];
    if (ids.length === 0) return { ok: false, error: 'No items selected for order.' };

    const allNotes = db.get(db.KEYS.NOTES);
    const purchases = db.get(db.KEYS.PURCHASES).filter(p => p.userId === user.id);
    const alreadyPurchasedIds = new Set(purchases.map(p => p.noteId));

    const orderItems = [];
    let totalAmount = 0;

    for (const id of ids) {
      if (alreadyPurchasedIds.has(id)) {
        return { ok: false, error: `You have already purchased the note "${id}". Duplicate purchase blocked.` };
      }
      const note = allNotes.find(n => n.id === id);
      if (!note) return { ok: false, error: `Note "${id}" not found.` };
      
      const price = Number(note.price) || 0;
      totalAmount += price;
      orderItems.push({
        noteId: note.id,
        title: note.title,
        subject: note.subject,
        pages: note.pages,
        price
      });
    }

    const orderId = db.generateId('ORD');
    const order = {
      id: orderId,
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName,
      items: orderItems,
      totalAmount,
      currency: 'INR',
      status: 'created', // 'created' | 'paid' | 'failed' | 'cancelled'
      createdAt: new Date().toISOString()
    };

    const orders = db.get(db.KEYS.ORDERS);
    orders.push(order);
    db.set(db.KEYS.ORDERS, orders);

    return { ok: true, data: order };
  },

  /**
   * Complete Payment (called after payment simulation or real webhook confirmation)
   * The UI NEVER unlocks notes directly; notes unlock ONLY if status === 'success' here.
   */
  async completePayment(orderId, { status = 'success', paymentId = null, error = null } = {}) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const orders = db.get(db.KEYS.ORDERS);
    const orderIdx = orders.findIndex(o => o.id === orderId && o.userId === user.id);
    if (orderIdx === -1) return { ok: false, error: 'Order not found.' };

    const order = orders[orderIdx];
    const generatedPaymentId = paymentId || `DEMO_${db.generateId('PAY')}`;

    // Record Payment
    const payment = {
      id: generatedPaymentId,
      orderId: order.id,
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName,
      amount: order.totalAmount,
      currency: order.currency || 'INR',
      status: status, // 'success' | 'failed' | 'cancelled'
      items: order.items,
      error: error || null,
      provider: CONFIG.PAYMENT_PROVIDER || 'demo',
      createdAt: new Date().toISOString()
    };

    const payments = db.get(db.KEYS.PAYMENTS);
    payments.push(payment);
    db.set(db.KEYS.PAYMENTS, payments);

    // Update order status
    orders[orderIdx].status = status === 'success' ? 'paid' : status;
    orders[orderIdx].paymentId = generatedPaymentId;
    db.set(db.KEYS.ORDERS, orders);

    const purchasesCreated = [];

    // ONLY unlock on verified success:
    if (status === 'success') {
      const purchases = db.get(db.KEYS.PURCHASES);
      const notifications = db.get(db.KEYS.NOTIFICATIONS);
      const cart = db.get(db.KEYS.CART);

      for (const item of order.items) {
        // Prevent duplicate purchase check
        const exists = purchases.some(p => p.userId === user.id && p.noteId === item.noteId);
        if (!exists) {
          const purchaseRecord = {
            id: db.generateId('PUR'),
            userId: user.id,
            noteId: item.noteId,
            noteTitle: item.title,
            orderId: order.id,
            paymentId: generatedPaymentId,
            amount: item.price,
            downloadCount: 0,
            lastPage: 1,
            purchasedAt: new Date().toISOString()
          };
          purchases.push(purchaseRecord);
          purchasesCreated.push(purchaseRecord);
        }
      }

      db.set(db.KEYS.PURCHASES, purchases);

      // Clear purchased items from user's cart
      const purchasedIds = new Set(order.items.map(i => i.noteId));
      const updatedCart = cart.filter(c => !(c.userId === user.id && purchasedIds.has(c.noteId)));
      db.set(db.KEYS.CART, updatedCart);

      // Create Success Notifications
      notifications.push({
        id: db.generateId('NOTIF'),
        userId: user.id,
        title: 'Payment Successful',
        body: `Your payment of ₹${order.totalAmount} for ${order.items.length} study note(s) was processed successfully (ID: ${generatedPaymentId}).`,
        requestId: null,
        orderId: order.id,
        read: false,
        createdAt: new Date().toISOString()
      });

      notifications.push({
        id: db.generateId('NOTIF'),
        userId: user.id,
        title: 'Study Notes Unlocked',
        body: `You can now read, view watermarked pages, and download your newly purchased architectural notes.`,
        requestId: null,
        read: false,
        createdAt: new Date().toISOString()
      });

      db.set(db.KEYS.NOTIFICATIONS, notifications);
    } else if (status === 'failed') {
      const notifications = db.get(db.KEYS.NOTIFICATIONS);
      notifications.push({
        id: db.generateId('NOTIF'),
        userId: user.id,
        title: 'Payment Failed',
        body: `Transaction simulation failed for order ${order.id}. No notes have been unlocked.`,
        requestId: null,
        read: false,
        createdAt: new Date().toISOString()
      });
      db.set(db.KEYS.NOTIFICATIONS, notifications);
    }

    return {
      ok: true,
      data: {
        payment,
        order: orders[orderIdx],
        purchases: purchasesCreated,
        unlocked: status === 'success'
      }
    };
  },

  /**
   * List all student purchases
   */
  async listMyPurchases({ search = '', sort = 'newest', page = 1, limit = 12 } = {}) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const allNotes = db.get(db.KEYS.NOTES);
    let purchases = db.get(db.KEYS.PURCHASES).filter(p => p.userId === user.id);

    let items = purchases.map(p => {
      const note = allNotes.find(n => n.id === p.noteId) || { id: p.noteId, title: p.noteTitle || 'Archived Note', subject: 'Architecture', pages: 0, price: p.amount };
      return {
        ...note,
        purchaseId: p.id,
        purchasedAt: p.purchasedAt,
        amountPaid: p.amount,
        downloadCount: p.downloadCount || 0,
        lastPage: p.lastPage || 1,
        progressPercent: note.pages ? Math.min(100, Math.round(((p.lastPage || 1) / note.pages) * 100)) : 0
      };
    });

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(i => (i.title && i.title.toLowerCase().includes(q)) || (i.subject && i.subject.toLowerCase().includes(q)));
    }

    if (sort === 'oldest') {
      items.sort((a, b) => new Date(a.purchasedAt) - new Date(b.purchasedAt));
    } else if (sort === 'title') {
      items.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      items.sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));
    }

    const total = items.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 12);
    const totalPages = Math.ceil(total / pageSize) || 1;
    const pagedItems = items.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    return {
      ok: true,
      data: {
        items: pagedItems,
        total,
        page: pageNum,
        totalPages
      }
    };
  },

  /**
   * Get purchased note file (Strict ownership verification)
   */
  async getPurchasedNoteFile(noteId) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    // STRICT OWNERSHIP VERIFICATION
    const purchases = db.get(db.KEYS.PURCHASES);
    const purchaseIdx = purchases.findIndex(p => p.userId === user.id && p.noteId === noteId);
    if (purchaseIdx === -1 && user.role !== 'admin') {
      return { ok: false, error: 'Access Denied: You have not purchased this study note.' };
    }

    const notes = db.get(db.KEYS.NOTES);
    const note = notes.find(n => n.id === noteId);
    if (!note) return { ok: false, error: 'Note record not found.' };

    let fileRecord = null;
    const fileId = note.fileId || note.fileBlobId;

    // 0. Primary: Server Database Backend PDF file
    try {
      const token = localStorage.getItem('sga_auth_token') || sessionStorage.getItem('sga_auth_token');
      const serverResp = await fetch(`/api/notes/${noteId}/pdf`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (serverResp.ok) {
        const sBlob = await serverResp.blob();
        fileRecord = {
          id: note.id,
          blob: sBlob,
          name: `${note.title}.pdf`,
          type: 'application/pdf'
        };
      }
    } catch (sErr) {
      console.warn('[Server DB] Purchased note PDF fetch note:', sErr);
    }

    // 2. Local IndexedDB
    if (!fileRecord && fileId) {
      fileRecord = await db.getBlob(fileId);
    }

    // 3. Firestore fallback
    if (!fileRecord && fileId) {
      try {
        const cloudFile = await firebaseDataService.getNoteFile(fileId);
        if (cloudFile && cloudFile.blob) {
          fileRecord = await db.storeBlob(cloudFile.blob, {
            id: fileId,
            name: cloudFile.name || `${note.title}.pdf`,
            type: cloudFile.type || 'application/pdf',
            size: cloudFile.size
          });
        }
      } catch (e) {
        console.warn('[Firebase] Purchased note file cloud fetch note:', e);
      }
    }

    if (!fileRecord) {
      return { ok: false, error: 'The PDF document for this note is currently syncing from cloud storage. Please try again in a moment.' };
    }

    // Increment download count
    if (purchaseIdx !== -1) {
      purchases[purchaseIdx].downloadCount = (purchases[purchaseIdx].downloadCount || 0) + 1;
      db.set(db.KEYS.PURCHASES, purchases);
    }

    return {
      ok: true,
      data: {
        blob: fileRecord.blob,
        filename: `${note.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
        downloadCount: purchaseIdx !== -1 ? purchases[purchaseIdx].downloadCount : 1,
        userWatermark: {
          name: user.fullName,
          email: user.email
        }
      }
    };
  },

  /**
   * List payments history for current student
   */
  async listPayments({ status = 'all', search = '', page = 1, limit = 10 } = {}) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    let payments = db.get(db.KEYS.PAYMENTS).filter(p => p.userId === user.id);

    if (status && status !== 'all') {
      payments = payments.filter(p => p.status === status);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      payments = payments.filter(p => 
        (p.id && p.id.toLowerCase().includes(q)) ||
        (p.orderId && p.orderId.toLowerCase().includes(q)) ||
        (p.items && p.items.some(i => i.title && i.title.toLowerCase().includes(q)))
      );
    }

    payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = payments.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 10);
    const totalPages = Math.ceil(total / pageSize) || 1;
    const paged = payments.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    return {
      ok: true,
      data: {
        items: paged,
        total,
        page: pageNum,
        totalPages
      }
    };
  },

  /**
   * Get invoice for a payment
   */
  async getInvoice(paymentId) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    const payments = db.get(db.KEYS.PAYMENTS);
    const payment = payments.find(p => p.id === paymentId && p.userId === user.id);
    if (!payment) return { ok: false, error: 'Payment invoice not found.' };

    const invoice = {
      invoiceNumber: `INV-${payment.id.replace('DEMO_', '')}`,
      date: payment.createdAt,
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      currency: payment.currency || 'INR',
      amount: payment.amount,
      client: {
        name: user.fullName,
        email: user.email,
        phone: user.phone || '—',
        college: user.college || '—'
      },
      seller: {
        name: 'Shilp Griha Associate (SGA)',
        founder: 'Ar. Vikas Verma, Architect',
        byline: 'NXT Services',
        email: 'ar.vikasverma0401@gmail.com',
        phone: '+91 79854 36965',
        address: 'Laxmi Nagar Colony, Cinema Road, Gola Gokarnath, UP 262802',
        website: `https://${CONFIG.SITE_DOMAIN || 'www.sgaup31.in'}`
      },
      items: payment.items || [],
      notice: 'TEST RECEIPT · Demo Mode (No real currency was exchanged)'
    };

    return { ok: true, data: invoice };
  },

  /**
   * Cart management
   */
  async getCart() {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: true, data: { items: [], subtotal: 0, total: 0 } };

    const cart = db.get(db.KEYS.CART).filter(c => c.userId === user.id);
    const allNotes = db.get(db.KEYS.NOTES);

    const items = [];
    let subtotal = 0;

    for (const c of cart) {
      const note = allNotes.find(n => n.id === c.noteId);
      if (note) {
        items.push({
          cartId: c.id,
          noteId: note.id,
          title: note.title,
          subject: note.subject,
          pages: note.pages,
          thumbnailId: note.thumbnailId,
          price: Number(note.price) || 0,
          addedAt: c.addedAt
        });
        subtotal += Number(note.price) || 0;
      }
    }

    return {
      ok: true,
      data: {
        items,
        subtotal,
        total: subtotal
      }
    };
  },

  async addToCart(noteId) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Please log in to add notes to your cart.' };

    // Check if already purchased
    const purchases = db.get(db.KEYS.PURCHASES).filter(p => p.userId === user.id);
    if (purchases.some(p => p.noteId === noteId)) {
      return { ok: false, error: 'You have already purchased this note. You can open it in My Purchases.' };
    }

    const cart = db.get(db.KEYS.CART);
    const existing = cart.find(c => c.userId === user.id && c.noteId === noteId);
    if (existing) {
      return { ok: false, error: 'Note is already in your cart.' };
    }

    const newItem = {
      id: db.generateId('CART'),
      userId: user.id,
      noteId,
      addedAt: new Date().toISOString()
    };
    cart.push(newItem);
    db.set(db.KEYS.CART, cart);

    return { ok: true, data: { added: true, cartCount: cart.filter(c => c.userId === user.id).length } };
  },

  async removeFromCart(noteId) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    let cart = db.get(db.KEYS.CART);
    cart = cart.filter(c => !(c.userId === user.id && c.noteId === noteId));
    db.set(db.KEYS.CART, cart);

    return { ok: true, data: { removed: true, cartCount: cart.filter(c => c.userId === user.id).length } };
  },

  async clearCart() {
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    let cart = db.get(db.KEYS.CART);
    cart = cart.filter(c => c.userId !== user.id);
    db.set(db.KEYS.CART, cart);

    return { ok: true, data: { cleared: true } };
  },

  /**
   * Wishlist
   */
  async toggleWishlist(noteId) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Please log in to save notes to your wishlist.' };

    let wishlist = db.get(db.KEYS.WISHLIST);
    const idx = wishlist.findIndex(w => w.userId === user.id && w.noteId === noteId);

    if (idx !== -1) {
      wishlist.splice(idx, 1);
      db.set(db.KEYS.WISHLIST, wishlist);
      return { ok: true, data: { isWishlisted: false, count: wishlist.filter(w => w.userId === user.id).length } };
    } else {
      wishlist.push({
        id: db.generateId('WISH'),
        userId: user.id,
        noteId,
        addedAt: new Date().toISOString()
      });
      db.set(db.KEYS.WISHLIST, wishlist);
      return { ok: true, data: { isWishlisted: true, count: wishlist.filter(w => w.userId === user.id).length } };
    }
  },

  async listWishlist() {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: true, data: { items: [] } };

    const wishlist = db.get(db.KEYS.WISHLIST).filter(w => w.userId === user.id);
    const allNotes = db.get(db.KEYS.NOTES);
    const purchases = db.get(db.KEYS.PURCHASES).filter(p => p.userId === user.id);
    const purchasedSet = new Set(purchases.map(p => p.noteId));

    const items = [];
    for (const w of wishlist) {
      const note = allNotes.find(n => n.id === w.noteId);
      if (note) {
        items.push({
          ...note,
          wishlistId: w.id,
          addedAt: w.addedAt,
          isPurchased: purchasedSet.has(note.id)
        });
      }
    }

    return { ok: true, data: { items } };
  },

  /**
   * Review submission (only for verified purchasers)
   */
  async addReview(noteId, rating, text) {
    await simulateLatency();
    const user = getCurrentSessionUser();
    if (!user) return { ok: false, error: 'Unauthenticated' };

    // Verify purchase
    const purchases = db.get(db.KEYS.PURCHASES).filter(p => p.userId === user.id);
    if (!purchases.some(p => p.noteId === noteId) && user.role !== 'admin') {
      return { ok: false, error: 'Only verified purchasers can submit a review for this study note.' };
    }

    const cleanText = (text || '').trim();
    const numRating = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));

    const reviews = db.get(db.KEYS.REVIEWS);
    const existingIdx = reviews.findIndex(r => r.userId === user.id && r.noteId === noteId);

    const reviewObj = {
      id: existingIdx !== -1 ? reviews[existingIdx].id : db.generateId('REV'),
      userId: user.id,
      userName: user.fullName,
      noteId,
      rating: numRating,
      text: cleanText,
      updatedAt: new Date().toISOString()
    };

    if (existingIdx !== -1) {
      reviews[existingIdx] = reviewObj;
    } else {
      reviews.push(reviewObj);
    }

    db.set(db.KEYS.REVIEWS, reviews);
    return { ok: true, data: reviewObj };
  },

  /**
   * Dev Tools Notes Manager CRUD
   */
  async createNote(noteData) {
    await simulateLatency();
    const id = db.generateId('NOTE');
    const newNote = {
      id,
      title: (noteData.title || '').trim(),
      subject: (noteData.subject || 'Architecture').trim(),
      category: (noteData.category || 'Exam Notes').trim(),
      description: (noteData.description || '').trim(),
      price: Math.max(0, Number(noteData.price) || 0),
      pages: Math.max(1, parseInt(noteData.pages, 10) || 1),
      author: (noteData.author || 'SGA Faculty').trim(),
      language: (noteData.language || 'English').trim(),
      published: noteData.published !== false,
      thumbnailId: noteData.thumbnailId || null,
      fileId: noteData.fileId || null,
      initialRating: Number(noteData.initialRating) || 4.8,
      initialReviewCount: Number(noteData.initialReviewCount) || 14,
      tableOfContents: noteData.tableOfContents || ['1. Introduction & Core Concepts', '2. Architectural Standards', '3. Case Studies & Calculations', '4. Studio Revision Questions'],
      includedItems: noteData.includedItems || ['Complete high-resolution PDF', 'Hand-drawn architectural details', 'Exam summary sheet', 'Formula & dimension cheat-sheet'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const notes = db.get(db.KEYS.NOTES);
    notes.push(newNote);
    db.set(db.KEYS.NOTES, notes);

    // Sync to backend database
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNote)
      });
    } catch (e) {
      console.warn('[Server DB] Sync note error:', e);
    }

    return { ok: true, data: newNote };
  },

  async updateNote(noteId, noteData) {
    await simulateLatency();
    const notes = db.get(db.KEYS.NOTES);
    const idx = notes.findIndex(n => n.id === noteId);
    if (idx === -1) return { ok: false, error: 'Note not found' };

    notes[idx] = {
      ...notes[idx],
      ...noteData,
      updatedAt: new Date().toISOString()
    };
    db.set(db.KEYS.NOTES, notes);

    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notes[idx])
      });
    } catch (e) {
      console.warn('[Server DB] Update note error:', e);
    }

    return { ok: true, data: notes[idx] };
  },

  async deleteNote(noteId) {
    await simulateLatency();
    let notes = db.get(db.KEYS.NOTES);
    notes = notes.filter(n => n.id !== noteId);
    db.set(db.KEYS.NOTES, notes);

    try {
      await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('[Server DB] Delete note error:', e);
    }

    return { ok: true, data: { deleted: true } };
  }
};
