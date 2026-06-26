// Per-install encryption for the cached unlock password.
//
// Replaces the former hardcoded `SECRET_PASSPHRASE`. A non-extractable
// AES-GCM key is generated once per browser profile and stored in IndexedDB;
// its raw bytes never leave the WebCrypto layer (`extractable: false`), so even
// code running inside the extension cannot read the key — only ask it to
// encrypt/decrypt. The popup encrypts the password before putting it in
// `chrome.storage.session`, and the service worker decrypts it with the same
// key: both run on the extension origin and therefore share one IndexedDB.
//
// This is defence-in-depth, not a vault: the value it protects (the unlock
// password) still only lives in memory-only, trusted-context-only session
// storage, and is intentionally re-derivable per install rather than baked
// into source. A leaked ciphertext is now useless without the per-profile key.

const DB_NAME = 'neoline-secure';
const STORE_NAME = 'session-keys';
const KEY_ID = 'session-secret-key';
const IV_LENGTH = 12; // AES-GCM standard nonce length (bytes)

// Cache the key promise per JS context so we hit IndexedDB at most once.
let cachedKeyPromise: Promise<CryptoKey> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getOrCreateKey(): Promise<CryptoKey> {
  if (cachedKeyPromise) {
    return cachedKeyPromise;
  }
  cachedKeyPromise = (async () => {
    const db = await openDb();
    try {
      const existing = await idbGet(db, KEY_ID);
      if (existing) {
        return existing;
      }
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // non-extractable: raw key bytes are never exposed to JS
        ['encrypt', 'decrypt']
      );
      await idbPut(db, KEY_ID, key);
      return key;
    } finally {
      db.close();
    }
  })();
  // Don't cache a rejection forever — allow a later retry to regenerate.
  cachedKeyPromise.catch(() => {
    cachedKeyPromise = null;
  });
  return cachedKeyPromise;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Encrypt a value for storage in chrome.storage.session. Output is
// base64(iv || ciphertext). Empty input is returned unchanged so callers can
// keep using "" to mean "no password".
export async function encryptSessionSecret(plaintext: string): Promise<string> {
  if (!plaintext) {
    return plaintext;
  }
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);
  return bytesToBase64(combined);
}

// Decrypt a value produced by encryptSessionSecret. Returns "" on any failure
// (missing/empty value, ciphertext from a previous scheme, or a different
// profile's key) so the caller simply treats it as "not logged in".
export async function decryptSessionSecret(ciphertext: string): Promise<string> {
  if (!ciphertext) {
    return '';
  }
  try {
    const key = await getOrCreateKey();
    const data = base64ToBytes(ciphertext);
    const iv = data.slice(0, IV_LENGTH);
    const body = data.slice(IV_LENGTH);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body);
    return new TextDecoder().decode(plaintext);
  } catch {
    return '';
  }
}
