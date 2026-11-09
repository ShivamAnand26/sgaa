/**
 * SGA.IN Client Portal - Cryptography Layer (crypto.js)
 * Real password hashing using Web Crypto API (PBKDF2, SHA-256, 150,000 iterations).
 * Protects client credentials with salt and strong key derivation.
 */

const ITERATIONS = 150000;
const HASH_ALG = 'SHA-256';

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

export const cryptoService = {
  /**
   * Generates a random 16-byte cryptographically secure salt
   */
  generateSalt() {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    return bufferToHex(saltBytes.buffer);
  },

  /**
   * Generates a random 32-byte hex session token
   */
  generateSessionToken() {
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    return bufferToHex(tokenBytes.buffer);
  },

  /**
   * Generates a 6-digit numeric verification/reset code
   */
  generate6DigitCode() {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    // 100000 to 999999
    return String(100000 + (array[0] % 900000));
  },

  /**
   * Hashes a password with PBKDF2 and a random salt
   */
  async hashPassword(password, saltHex) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const saltBuffer = hexToBuffer(saltHex);

    const derivedKey = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: ITERATIONS,
        hash: HASH_ALG
      },
      keyMaterial,
      256 // 32 bytes
    );

    return bufferToHex(derivedKey);
  },

  /**
   * Verifies an input password against stored hash and salt
   */
  async verifyPassword(password, saltHex, storedHashHex) {
    const computedHash = await this.hashPassword(password, saltHex);
    // Constant-time-like comparison
    if (computedHash.length !== storedHashHex.length) return false;
    let result = 0;
    for (let i = 0; i < computedHash.length; i++) {
      result |= computedHash.charCodeAt(i) ^ storedHashHex.charCodeAt(i);
    }
    return result === 0;
  },

  /**
   * Fast hash for short codes (reset codes)
   */
  async hashCode(code, saltHex) {
    const enc = new TextEncoder();
    const data = enc.encode(`${saltHex}:${code}`);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return bufferToHex(hash);
  }
};
