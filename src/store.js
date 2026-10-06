// Small IndexedDB store, on this device only, for resuming after a refresh:
//  - resumable session URIs for unfinished files (Google expires them in ~7 days)
//  - which files already finished, so they are never uploaded twice
//  - a summary of an unfinished batch, to tell the user how to continue
// No file contents are ever stored. Every key is prefixed with the signed-in
// account's Drive ID, so two people sharing a browser never see each other's
// entries. Everything here expires after 7 days.

const DB = 'afyaa-upload';
const TTL = 7 * 24 * 3600 * 1000;
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null); // private mode etc.: resume just isn't available
  }
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const t = db.transaction('kv', mode);
    const store = t.objectStore('kv');
    const r = fn(store);
    t.oncomplete = () => resolve(r?.result);
    t.onerror = t.onabort = () => resolve(undefined);
  });
}

let ns = '';
export function setNamespace(userKey) {
  ns = userKey ? `${userKey}:` : '';
}

export const store = {
  async get(key) {
    if (!ns) return undefined;
    const v = await tx('readonly', (s) => s.get(ns + key));
    if (v && v.at && Date.now() - v.at > TTL) {
      this.del(key);
      return undefined;
    }
    return v?.value;
  },
  set(key, value) {
    if (!ns) return;
    return tx('readwrite', (s) => s.put({ value, at: Date.now() }, ns + key));
  },
  del(key) {
    if (!ns) return;
    return tx('readwrite', (s) => s.delete(ns + key));
  },
  async purgeExpired() {
    const db = await open();
    if (!db) return;
    const t = db.transaction('kv', 'readwrite');
    const req = t.objectStore('kv').openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      if (!c.value?.at || Date.now() - c.value.at > TTL) c.delete();
      c.continue();
    };
  },
  // Removes every entry for the current account (used on disconnect).
  async clearAccount() {
    if (!ns) return;
    const db = await open();
    if (!db) return;
    const prefix = ns;
    const t = db.transaction('kv', 'readwrite');
    const req = t.objectStore('kv').openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      if (String(c.key).startsWith(prefix)) c.delete();
      c.continue();
    };
  },
};

// Identifies "the same file going to the same place" across page reloads.
export function fingerprint(item, folderId) {
  const f = item.file;
  return ['v1', folderId, item.relDir, f.name, f.size, f.lastModified, item.mute ? 'm' : ''].join('|');
}
