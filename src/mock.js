// Demo-mode stand-in for Google Drive, used only when no OAuth client is
// configured. It mirrors the realDrive interface so the whole upload engine
// (chunking, retries, offline recovery, duplicates) can be exercised without
// a Google account. No bytes leave the browser in demo mode.

import { DriveError, FOLDER_MIME } from './drive.js';

const BANDWIDTH = 12 * 1024 * 1024; // simulated uplink, bytes/s shared by all transfers
const FAIL_RATE = 0.03;

let seq = 100;
const items = new Map(); // id -> { id, name, mimeType, parent }
const sessions = new Map();
let active = 0;
export const sim = { offline: false };

function add(name, parent, mimeType = 'application/octet-stream') {
  const id = `f${seq++}`;
  items.set(id, { id, name, mimeType, parent });
  return id;
}
const events = add('صور الفعاليات', 'root', FOLDER_MIME);
add('اليوم الوطني ١٤٤٨', events, FOLDER_MIME);
add('ملتقى أفياء', events, FOLDER_MIME);
add('IMG_0001.jpg', events, 'image/jpeg');
add('Reports 2026', 'root', FOLDER_MIME);

const wait = (ms, signal) =>
  new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      rej(new DriveError('aborted'));
    });
  });

function guard() {
  if (sim.offline) throw new DriveError('network', 0);
}

async function transfer(bytes, { onProgress, signal }) {
  active++;
  try {
    let sent = 0;
    while (sent < bytes) {
      await wait(120, signal);
      guard();
      sent = Math.min(bytes, sent + (BANDWIDTH / Math.max(1, active)) * 0.12);
      onProgress?.(sent);
    }
    if (Math.random() < FAIL_RATE) throw new DriveError('server', 503, 'backendError', 'Simulated server hiccup');
  } finally {
    active--;
  }
}

export const mockDrive = {
  async about() {
    await wait(300);
    return { displayName: 'نورة', emailAddress: 'demo.user@example.com', photoLink: '', permissionId: 'demo-user' };
  },
  async getFolder(id) {
    await wait(150);
    guard();
    if (id === 'root') return { id: 'root', name: 'My Drive', capabilities: { canAddChildren: true } };
    const f = items.get(id);
    if (!f) throw new DriveError('notFound', 404);
    return { ...f, capabilities: { canAddChildren: true } };
  },
  async listChildren(folderId, { foldersOnly, name } = {}) {
    await wait(200);
    guard();
    return [...items.values()].filter(
      (f) =>
        f.parent === folderId &&
        (!foldersOnly || f.mimeType === FOLDER_MIME) &&
        (!name || f.name === name),
    ).map((f) => ({ ...f, capabilities: { canEdit: true } }));
  },
  async createFolder(name, parentId) {
    await wait(250);
    guard();
    const id = add(name, parentId, FOLDER_MIME);
    return { id, name };
  },
  async multipart({ name, parents, mimeType, existingId }, blob, opts = {}) {
    guard();
    await transfer(blob.size, opts);
    if (existingId) return { id: existingId };
    return { id: add(name, parents[0], mimeType) };
  },
  async startResumable(meta) {
    await wait(180);
    guard();
    const uri = `demo://session/${seq++}`;
    sessions.set(uri, { ...meta, received: 0 });
    return uri;
  },
  async putChunk(uri, blob, start, end, opts = {}) {
    guard();
    const s = sessions.get(uri);
    if (!s) throw new DriveError('notFound', 404);
    await transfer(end - start, opts);
    s.received = end;
    if (end >= blob.size) {
      sessions.delete(uri);
      return { done: true, file: { id: s.existingId || add(s.name, s.parents[0], s.mimeType) } };
    }
    return { done: false, nextOffset: end };
  },
  async queryOffset(uri) {
    await wait(120);
    guard();
    const s = sessions.get(uri);
    if (!s) throw new DriveError('notFound', 404);
    return { done: false, nextOffset: s.received };
  },
  async cancelSession(uri) {
    sessions.delete(uri);
  },
  async ping() {
    await wait(100);
    guard();
    return true;
  },
  async readAppData(name) {
    await wait(200);
    try {
      return { id: 'local', data: JSON.parse(localStorage.getItem(`demo:${name}`) || 'null') };
    } catch {
      return { id: null, data: null };
    }
  },
  async writeAppData(name, _id, data) {
    localStorage.setItem(`demo:${name}`, JSON.stringify(data));
    return { id: 'local' };
  },
  folderUrl() {
    return '#';
  },
  // Used by the demo folder chooser in place of Google Picker.
  _all() {
    return items;
  },
};
