/**
 * SGA.IN Client Portal - Tiny Database Layer (db.js)
 * Manages localStorage for structured documents and IndexedDB for binary Blobs.
 */

import { CONFIG } from './config.js';

const DB_KEYS = {
  USERS: 'sga_users',
  REQUESTS: 'sga_requests',
  NOTIFICATIONS: 'sga_notifications',
  SESSIONS: 'sga_sessions',
  NOTES: 'sga_notes',
  PURCHASES: 'sga_purchases',
  ORDERS: 'sga_orders',
  PAYMENTS: 'sga_payments',
  WISHLIST: 'sga_wishlist',
  REVIEWS: 'sga_reviews',
  CART: 'sga_cart',
  COUPONS: 'sga_coupons',
  REFUNDS: 'sga_refunds',
  PROPOSALS: 'sga_proposals',
  CONTACT_MESSAGES: 'sga_contact_messages',
  ANNOUNCEMENTS: 'sga_announcements',
  TESTIMONIALS: 'sga_testimonials',
  SITE_CONTENT: 'sga_site_content',
  SUBJECTS: 'sga_subjects',
  PORTFOLIO: 'sga_portfolio',
  ACTIVITY_LOG: 'sga_activity_log',
  NOTE_VERSIONS: 'sga_note_versions',
  ADMIN_SETTINGS: 'sga_admin_settings',
  SCHEMA_VERSION: 'sga_schema_version'
};

const IDB_NAME = 'sga_files_db';
const IDB_VERSION = 1;
const IDB_STORE = 'files';

let idbPromise = null;

function openIndexedDB() {
  if (idbPromise) return idbPromise;

  idbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB is not supported in this browser; falling back to memory/dataURL.');
      return resolve(null);
    }
    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error('IndexedDB open error:', request.error);
      resolve(null);
    };
  });

  return idbPromise;
}

export const db = {
  KEYS: DB_KEYS,

  /**
   * Initialize and run one-time schema migrations
   */
  init() {
    const currentVersion = parseInt(localStorage.getItem(DB_KEYS.SCHEMA_VERSION) || '0', 10);
    if (currentVersion < CONFIG.DB_VERSION) {
      if (!localStorage.getItem(DB_KEYS.USERS)) localStorage.setItem(DB_KEYS.USERS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.REQUESTS)) localStorage.setItem(DB_KEYS.REQUESTS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.NOTIFICATIONS)) localStorage.setItem(DB_KEYS.NOTIFICATIONS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.SESSIONS)) localStorage.setItem(DB_KEYS.SESSIONS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.NOTES)) localStorage.setItem(DB_KEYS.NOTES, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.PURCHASES)) localStorage.setItem(DB_KEYS.PURCHASES, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.ORDERS)) localStorage.setItem(DB_KEYS.ORDERS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.PAYMENTS)) localStorage.setItem(DB_KEYS.PAYMENTS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.WISHLIST)) localStorage.setItem(DB_KEYS.WISHLIST, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.REVIEWS)) localStorage.setItem(DB_KEYS.REVIEWS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.CART)) localStorage.setItem(DB_KEYS.CART, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.COUPONS)) localStorage.setItem(DB_KEYS.COUPONS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.REFUNDS)) localStorage.setItem(DB_KEYS.REFUNDS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.PROPOSALS)) localStorage.setItem(DB_KEYS.PROPOSALS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.CONTACT_MESSAGES)) localStorage.setItem(DB_KEYS.CONTACT_MESSAGES, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.ANNOUNCEMENTS)) localStorage.setItem(DB_KEYS.ANNOUNCEMENTS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.TESTIMONIALS)) localStorage.setItem(DB_KEYS.TESTIMONIALS, JSON.stringify([]));
      const defaultSiteContent = {
        businessName: 'Shilp Griha Associate',
        shortName: 'SGA',
        founderName: 'Ar. Vikas Verma',
        founderRole: 'Architect, Founder',
        tagline: 'नक्शा सही, निर्माण सही',
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

      if (!localStorage.getItem(DB_KEYS.SITE_CONTENT)) {
        localStorage.setItem(DB_KEYS.SITE_CONTENT, JSON.stringify(defaultSiteContent));
      }
      if (!localStorage.getItem(DB_KEYS.ACTIVITY_LOG)) localStorage.setItem(DB_KEYS.ACTIVITY_LOG, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.NOTE_VERSIONS)) localStorage.setItem(DB_KEYS.NOTE_VERSIONS, JSON.stringify([]));
      if (!localStorage.getItem(DB_KEYS.ADMIN_SETTINGS)) {
        localStorage.setItem(DB_KEYS.ADMIN_SETTINGS, JSON.stringify({
          businessName: 'Shilp Griha Associate',
          gstNumber: '09XXXXX0000X1Z5',
          gstRatePercent: 18,
          invoicePrefix: 'INV-2026-',
          proposalPrefix: 'PROP-2026-',
          receiptPrefix: 'RCT-2026-',
          contactEmail: 'ar.vikasverma0401@gmail.com',
          supportPhone: '+91 79854 36965',
          address: 'Laxmi Nagar Colony, Cinema Road, Gola Gokarnath, Lakhimpur Kheri, UP 262802',
          currency: 'INR',
          currencySymbol: '₹'
        }));
      }
      localStorage.setItem(DB_KEYS.SCHEMA_VERSION, String(CONFIG.DB_VERSION));
    }
    openIndexedDB();
  },

  /**
   * Get an entire collection from localStorage
   */
  get(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error(`Error reading ${key} from storage:`, err);
      return [];
    }
  },

  /**
   * Set an entire collection in localStorage
   */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        throw new Error('Local browser storage is full. Please remove some draft files or clear cached data in Dev Tools.');
      }
      throw err;
    }
  },

  /**
   * Update a collection by running an updater function
   */
  update(key, updaterFn) {
    const items = this.get(key);
    const updated = updaterFn(items);
    this.set(key, updated);
    return updated;
  },

  /**
   * Remove an entire key
   */
  remove(key) {
    localStorage.removeItem(key);
  },

  /**
   * Generate clean architectural unique IDs (e.g. SGA-2026-0001, USR-..., NOTIF-...)
   */
  generateId(prefix = 'ID') {
    const year = new Date().getFullYear();
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `${prefix}-${year}-${randomHex}`;
  },

  /**
   * IndexedDB: Store a file Blob with metadata
   */
  async storeBlob(blob, metadata = {}) {
    const dbInstance = await openIndexedDB();
    const id = this.generateId('FILE');
    const record = {
      id,
      blob,
      name: metadata.name || 'unnamed_file',
      type: metadata.type || blob.type || 'application/octet-stream',
      size: metadata.size || blob.size || 0,
      category: metadata.category || 'general',
      uploadedAt: new Date().toISOString()
    };

    if (!dbInstance) {
      // In-memory fallback
      window.__sga_file_cache = window.__sga_file_cache || {};
      window.__sga_file_cache[id] = record;
      return record;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = dbInstance.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  /**
   * IndexedDB: Retrieve a file record
   */
  async getBlob(id) {
    const dbInstance = await openIndexedDB();
    if (!dbInstance) {
      return (window.__sga_file_cache && window.__sga_file_cache[id]) || null;
    }

    return new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  },

  /**
   * IndexedDB: Delete a file record
   */
  async deleteBlob(id) {
    const dbInstance = await openIndexedDB();
    if (!dbInstance) {
      if (window.__sga_file_cache) delete window.__sga_file_cache[id];
      return true;
    }

    return new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  },

  /**
   * IndexedDB: Clear all stored files
   */
  async clearAllBlobs() {
    const dbInstance = await openIndexedDB();
    if (!dbInstance) {
      window.__sga_file_cache = {};
      return true;
    }

    return new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  }
};

// Initialize schema on load
db.init();
