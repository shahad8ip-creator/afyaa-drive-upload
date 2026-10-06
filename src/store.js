// IndexedDB store, on this device only, for resuming after a refresh:
//  - resumable session URIs for unfinished files (Google expires them in ~7 days)
//  - which files already finished, so they are never uploaded twice
//  - the unfinished batch (folder, options, file list)
//  - on phones/tablets, a temporary copy of each file that hasn't finished
//    uploading ("files" store). iOS often closes Safari pages in the
//    background, and a reloaded page loses access to the files the user
//    picked; the copy lets the upload carry on without picking them again.
//    Each copy is deleted as soon as that file is uploaded, cancelled or the
//    batch ends, and on sign-out/disconnect.
// Every key is prefixed with the signed-in account's Drive ID, so two people
// sharing a browser never see each other's entries. Everything here expires
// after 7 days.

const DB = 'afyaa-upload';
const TTL = 7 * 24 * 3600 * 1000;
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null); // private mode etc.: resume just isn't available
  }
  return dbp;
}

async function tx(mode, fn, name = 'kv') {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    let t;
    try {
      t = db.transaction(name, mode);
    } catch {
      return resolve(undefined);
    }
    const store = t.objectStore(name);
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
    await sweep((key, value) => !value?.at || Date.now() - value.at > TTL);
  },
  // Removes every entry for the current account (used on disconnect).
  async clearAccount() {
    if (!ns) return;
    const prefix = ns;
    await sweep((key) => String(key).startsWith(prefix));
  },

  // ---- temporary file copies (phones/tablets) ----
  // Resolves true once the copy is safely on disk, false if it couldn't be
  // stored (no space, private mode…).
  async putFile(key, file) {
    if (!ns) return false;
    const db = await open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const t = db.transaction('files', 'readwrite');
        t.objectStore('files').put({ blob: file, name: file.name, type: file.type, lastModified: file.lastModified, at: Date.now() }, ns + key);
        t.oncomplete = () => resolve(true);
        t.onerror = t.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  },
  async getFile(key) {
    if (!ns) return null;
    const v = await tx('readonly', (st) => st.get(ns + key), 'files');
    if (!v?.blob) return null;
    // A lazy File view of the stored copy: nothing is read into memory.
    return new File([v.blob], v.name, { type: v.type || v.blob.type, lastModified: v.lastModified || Date.now() });
  },
  delFile(key) {
    if (!ns) return;
    return tx('readwrite', (st) => st.delete(ns + key), 'files');
  },
  async clearFiles() {
    if (!ns) return;
    const prefix = ns;
    await sweep((key) => String(key).startsWith(prefix), ['files']);
  },
};

async function sweep(shouldDelete, names = ['kv', 'files']) {
  const db = await open();
  if (!db) return;
  for (const name of names) {
    await new Promise((resolve) => {
      let t;
      try {
        t = db.transaction(name, 'readwrite');
      } catch {
        return resolve();
      }
      const req = t.objectStore(name).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        if (shouldDelete(c.key, c.value)) c.delete();
        c.continue();
      };
      t.oncomplete = t.onerror = t.onabort = () => resolve();
    });
  }
}

// Identifies "the same file going to the same place" across page reloads.
// The modification date is left out on purpose: iPhone/iPad stamp a new one
// each time a video is picked from Photos, which would stop a re-selected
// file from resuming. Name + size + folder is specific enough.
export function fingerprint(item, folderId) {
  const f = item.file;
  return ['v2', folderId, item.relDir, f.name, f.size, item.mute ? 'm' : ''].join('|');
}
