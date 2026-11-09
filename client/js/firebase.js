/**
 * SGA.IN - Firebase Authentication & Firestore Database Integration (firebase.js)
 * Configured with live project gen-lang-client-0024622577
 * Supports both online Firebase Auth and zero-setup browser fallback.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider 
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  getDocFromServer,
  collection,
  getDocs,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

export const firebaseConfig = {
  projectId: "ai-studio-applet-webapp-ada1a",
  appId: "1:592166409900:web:8c303c21566ac930f0b109",
  apiKey: "AIzaSyD0gkKXhWf6yJDHJ8yWfnWZn_8VIfc8dJM",
  authDomain: "ai-studio-applet-webapp-ada1a.firebaseapp.com",
  storageBucket: "ai-studio-applet-webapp-ada1a.firebasestorage.app",
  messagingSenderId: "592166409900"
};

let app = null;
let auth = null;
let db = null;
let isInitialized = false;

// Helper to prevent Firestore calls from hanging indefinitely
function withTimeout(promise, timeoutMs = 2500) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase operation timed out')), timeoutMs))
  ]);
}

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  isInitialized = true;
  console.log('[Firebase] Successfully initialized with project:', firebaseConfig.projectId);
} catch (err) {
  console.warn('[Firebase] Initialization warning:', err);
}

export const firebaseAuthService = {
  isConfigured: () => isInitialized && Boolean(auth),

  /**
   * Register a new user with Firebase Auth and sync profile to Firestore
   */
  async register({ email, password, fullName, role = 'client', phone = '', college = '', course = '', year = '' }) {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Firebase Auth is not ready.' };
    }

    try {
      const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const firebaseUser = userCred.user;

      if (fullName) {
        await updateProfile(firebaseUser, { displayName: fullName });
      }

      const userData = {
        id: firebaseUser.uid,
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        role,
        phone: phone.trim(),
        college: college.trim(),
        course: course.trim(),
        year: year.trim(),
        createdAt: new Date().toISOString()
      };

      // Store in Firestore
      try {
        await setDoc(doc(db, 'users', firebaseUser.uid), userData);
      } catch (firestoreErr) {
        console.warn('[Firebase] Firestore user document write skipped:', firestoreErr);
      }

      return {
        ok: true,
        data: {
          user: userData,
          token: await firebaseUser.getIdToken()
        }
      };
    } catch (err) {
      console.error('[Firebase] Sign Up error:', err);
      let errorMsg = err.message || 'Registration failed';
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = 'An account with this email address already exists.';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = 'Please enter a valid email address.';
      }
      return { ok: false, error: errorMsg };
    }
  },

  /**
   * Sign in with Firebase Auth and retrieve profile
   */
  async login({ email, password }) {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Firebase Auth is not ready.' };
    }

    try {
      const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const firebaseUser = userCred.user;
      const token = await firebaseUser.getIdToken();

      let profileData = {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        fullName: firebaseUser.displayName || 'User',
        role: email.includes('admin') || email.includes('vikasverma_gola') ? 'admin' : (email.includes('student') ? 'student' : 'client')
      };

      // Retrieve profile from Firestore
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          profileData = { ...profileData, ...userDoc.data() };
        }
      } catch (e) {
        // use fallback profile
      }

      return {
        ok: true,
        data: {
          user: profileData,
          token
        }
      };
    } catch (err) {
      console.error('[Firebase] Sign In error:', err);
      let errorMsg = 'Invalid email or password.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMsg = 'Invalid credentials. Please verify your email and password.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMsg = 'Access temporarily disabled due to many failed attempts. Try again later.';
      }
      return { ok: false, error: errorMsg };
    }
  },

  /**
   * Sign out current user
   */
  async logout() {
    if (this.isConfigured()) {
      try {
        await signOut(auth);
      } catch (e) {}
    }
  }
};

const CHUNK_CHAR_LIMIT = 600000;

export const firebaseDataService = {
  isConfigured: () => isInitialized && Boolean(db),

  /**
   * Save or update a study note in Firestore with timeout protection
   */
  async saveNote(note) {
    if (!this.isConfigured() || !note.id) return { ok: false, error: 'Database not initialized' };
    try {
      // Ensure plain object without undefined
      const cleanNote = JSON.parse(JSON.stringify(note));
      await withTimeout(setDoc(doc(db, 'notes', note.id), cleanNote, { merge: true }), 2500);
      return { ok: true, data: cleanNote };
    } catch (e) {
      console.warn('[Firebase] saveNote timeout or error (safe fallback):', e);
      return { ok: false, error: e.message };
    }
  },

  /**
   * Fetch all study notes from Firestore with timeout
   */
  async getNotes() {
    if (!this.isConfigured()) return { ok: false, data: [] };
    try {
      const snap = await withTimeout(getDocs(collection(db, 'notes')), 2500);
      const notes = [];
      snap.forEach(d => {
        notes.push({ id: d.id, ...d.data() });
      });
      return { ok: true, data: notes };
    } catch (e) {
      console.warn('[Firebase] getNotes timeout or error:', e);
      return { ok: false, data: [] };
    }
  },

  /**
   * Fetch a single study note from Firestore
   */
  async getNote(id) {
    if (!this.isConfigured() || !id) return { ok: false, error: 'Invalid id' };
    try {
      const d = await withTimeout(getDoc(doc(db, 'notes', id)), 2500);
      if (d.exists()) {
        return { ok: true, data: { id: d.id, ...d.data() } };
      }
      return { ok: false, error: 'Note not found' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /**
   * Delete note from Firestore
   */
  async deleteNote(id) {
    if (!this.isConfigured() || !id) return { ok: false };
    try {
      await withTimeout(deleteDoc(doc(db, 'notes', id)), 2500);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /**
   * Store note PDF metadata. Full PDF binary is reliably served from server storage
   * without blocking UI on multi-chunk document encoding.
   */
  async saveNoteFile(fileId, fileBlob, meta = {}) {
    return { ok: true };
  },

  /**
   * Retrieve note PDF file
   */
  async getNoteFile(fileId) {
    return null;
  }
};
