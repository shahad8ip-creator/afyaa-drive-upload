// Google Drive REST v3, called straight from the browser. File bytes travel
// Browser → googleapis.com only; there is no intermediate server.

import { getToken } from './auth.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
const COMMON = 'supportsAllDrives=true';

export class DriveError extends Error {
  constructor(kind, status, reason, detail) {
    super(`${kind}${status ? ` (HTTP ${status})` : ''}${reason ? `: ${reason}` : ''}`);
    this.kind = kind; // network | auth | rate | quota | permission | notFound | server | client | aborted
    this.status = status;
    this.reason = reason;
    this.detail = detail;
  }
}

function classify(status, body) {
  let reason = '';
  let message = '';
  try {
    const j = typeof body === 'string' ? JSON.parse(body) : body;
    reason = j?.error?.errors?.[0]?.reason || j?.error?.status || '';
    message = j?.error?.message || '';
  } catch {}
  const detail = message || (typeof body === 'string' ? body.slice(0, 300) : '');
  if (status === 0) return new DriveError('network', 0, '', 'Network request failed');
  if (status === 401) return new DriveError('auth', status, reason, detail);
  if (status === 429) return new DriveError('rate', status, reason, detail);
  if (status === 403) {
    if (/rateLimit|userRateLimit|sharingRateLimit/i.test(reason)) return new DriveError('rate', status, reason, detail);
    if (/storageQuota|quotaExceeded/i.test(reason)) return new DriveError('quota', status, reason, detail);
    return new DriveError('permission', status, reason, detail);
  }
  if (status === 404) return new DriveError('notFound', status, reason, detail);
  if (status >= 500) return new DriveError('server', status, reason, detail);
  return new DriveError('client', status, reason, detail);
}

// XHR (not fetch) because only XHR reports upload progress in every browser.
function request(method, url, { headers = {}, body = null, onProgress, signal, auth = true, responseType = 'text' } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DriveError('aborted'));
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.responseType = responseType;
    if (auth) xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      resolve(xhr);
    };
    xhr.onerror = xhr.ontimeout = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new DriveError('network', 0));
    };
    xhr.onabort = () => reject(new DriveError('aborted'));
    xhr.send(body);
  });
}

async function json(method, url, opts = {}) {
  const xhr = await request(method, url, opts);
  if (xhr.status >= 200 && xhr.status < 300) return xhr.responseText ? JSON.parse(xhr.responseText) : {};
  throw classify(xhr.status, xhr.responseText);
}

const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export const realDrive = {
  async about() {
    const r = await json('GET', `${API}/about?fields=user(displayName,emailAddress,photoLink,permissionId)`);
    return r.user;
  },

  async getFolder(id) {
    return json(
      'GET',
      `${API}/files/${encodeURIComponent(id)}?${COMMON}&fields=id,name,mimeType,trashed,webViewLink,capabilities(canAddChildren)`,
    );
  },

  // Lists children. Under drive.file this returns only items this app created
  // or the user picked — which is exactly what duplicate checks need.
  async listChildren(folderId, { foldersOnly = false, name } = {}) {
    const clauses = [`'${q(folderId)}' in parents`, 'trashed = false'];
    if (foldersOnly) clauses.push(`mimeType = '${FOLDER_MIME}'`);
    if (name) clauses.push(`name = '${q(name)}'`);
    const out = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: clauses.join(' and '),
        fields: 'nextPageToken,files(id,name,mimeType,size,capabilities(canEdit))',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const r = await json('GET', `${API}/files?${params}`);
      out.push(...r.files);
      pageToken = r.nextPageToken || '';
    } while (pageToken);
    return out;
  },

  async createFolder(name, parentId) {
    return json('POST', `${API}/files?${COMMON}&fields=id,name,webViewLink`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
  },

  // One-request upload for small files.
  async multipart({ name, parents, mimeType, existingId }, blob, { onProgress, signal } = {}) {
    const boundary = `afyaa${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
    const meta = existingId ? {} : { name, parents };
    if (mimeType) meta.mimeType = mimeType;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ]);
    const url = existingId
      ? `${UPLOAD}/files/${encodeURIComponent(existingId)}?uploadType=multipart&${COMMON}&fields=id`
      : `${UPLOAD}/files?uploadType=multipart&${COMMON}&fields=id`;
    const scale = blob.size / body.size;
    return json(existingId ? 'PATCH' : 'POST', url, {
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
      signal,
      onProgress: onProgress && ((n) => onProgress(Math.min(blob.size, n * scale))),
    });
  },

  // Opens a resumable session and returns its URI. The URI stays valid for
  // about a week, which is what lets an interrupted upload continue.
  async startResumable({ name, parents, mimeType, size, existingId }) {
    const meta = existingId ? {} : { name, parents };
    if (mimeType) meta.mimeType = mimeType;
    const url = existingId
      ? `${UPLOAD}/files/${encodeURIComponent(existingId)}?uploadType=resumable&${COMMON}&fields=id`
      : `${UPLOAD}/files?uploadType=resumable&${COMMON}&fields=id`;
    const headers = { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size) };
    if (mimeType) headers['X-Upload-Content-Type'] = mimeType;
    const xhr = await request(existingId ? 'PATCH' : 'POST', url, { headers, body: JSON.stringify(meta) });
    if (xhr.status !== 200) throw classify(xhr.status, xhr.responseText);
    const loc = xhr.getResponseHeader('Location');
    if (!loc) throw new DriveError('server', xhr.status, 'noLocation', 'Upload session URI missing');
    return loc;
  },

  // Sends bytes [start, end) of the blob. Resolves with the next offset the
  // server expects, or with the created file when the upload is complete.
  async putChunk(sessionUri, blob, start, end, { onProgress, signal } = {}) {
    const total = blob.size;
    const xhr = await request('PUT', sessionUri, {
      headers: { 'Content-Range': `bytes ${start}-${end - 1}/${total}` },
      body: blob.slice(start, end),
      onProgress,
      signal,
    });
    return parseSessionResponse(xhr);
  },

  // Asks the server how many bytes it already has, so only the missing part
  // is sent again after a failure.
  async queryOffset(sessionUri, total, { signal } = {}) {
    const xhr = await request('PUT', sessionUri, { headers: { 'Content-Range': `bytes */${total}` }, signal });
    return parseSessionResponse(xhr);
  },

  async cancelSession(sessionUri) {
    try {
      await request('DELETE', sessionUri);
    } catch {}
  },

  async readAppData(name) {
    const params = new URLSearchParams({ spaces: 'appDataFolder', q: `name = '${q(name)}'`, fields: 'files(id)' });
    const r = await json('GET', `${API}/files?${params}`);
    const id = r.files?.[0]?.id;
    if (!id) return { id: null, data: null };
    const xhr = await request('GET', `${API}/files/${id}?alt=media`);
    if (xhr.status !== 200) throw classify(xhr.status, xhr.responseText);
    try {
      return { id, data: JSON.parse(xhr.responseText) };
    } catch {
      return { id, data: null };
    }
  },

  async writeAppData(name, id, data) {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    if (id) return this.multipart({ existingId: id, mimeType: 'application/json' }, blob);
    return this.multipart({ name, parents: ['appDataFolder'], mimeType: 'application/json' }, blob);
  },

  folderUrl(id) {
    return id === 'root' ? 'https://drive.google.com/drive/my-drive' : `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
  },
};

function parseSessionResponse(xhr) {
  if (xhr.status === 200 || xhr.status === 201) {
    let file = {};
    try {
      file = JSON.parse(xhr.responseText);
    } catch {}
    return { done: true, file };
  }
  if (xhr.status === 308) {
    const range = xhr.getResponseHeader('Range'); // "bytes=0-12345"
    const m = range && /bytes=\d+-(\d+)/.exec(range);
    return { done: false, nextOffset: m ? Number(m[1]) + 1 : 0 };
  }
  throw classify(xhr.status, xhr.responseText);
}
