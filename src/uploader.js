// The upload engine: a queue with controlled concurrency, Drive resumable
// sessions, adaptive chunk sizes, retry with backoff, offline detection and
// per-file pause/cancel. One instance per signed-in session.

import { tuning } from './config.js';
import { msLeft, requestToken } from './auth.js';
import { DriveError } from './drive.js';
import { muteVideo, abortMute, MuteError } from './mute.js';
import { store, fingerprint } from './store.js';

export const FINAL = new Set(['uploaded', 'failed', 'cancelled', 'skipped']);
const BUSY = new Set(['processing', 'uploading']);

export class Uploader {
  constructor(drive, { email, onUpdate, onDone }) {
    this.drive = drive;
    this.email = email;
    this.onUpdate = onUpdate || (() => {});
    this.onDone = onDone || (() => {});
    this.items = [];
    this.state = 'idle'; // idle | running | paused | offline | needsAuth | blocked | done
    this.banner = null; // offline | offlineManual | onlineManual | paused | auth | quota | permission
    this.autoResume = true;
    this.folder = null;
    this.batchId = null;
    this.active = new Set();
    this.dirCache = new Map();
    this.muteBusy = false;
    this.heldBytes = 0;
    this.netStrikes = 0;
    this.speed = 0;
    this.sentCounter = 0;
    this._lastSample = { t: performance.now(), sent: 0 };
    this._refreshing = null;
    this._softAuthTried = false;
    this._sampler = setInterval(() => this._sample(), 1000);
    this._authTicker = setInterval(() => this._authTick(), 30000);
    this._poll = null;
  }

  destroy() {
    clearInterval(this._sampler);
    clearInterval(this._authTicker);
    clearInterval(this._poll);
    this._abortActive('paused');
    for (const it of this.items) clearTimeout(it.retryTimer);
  }

  // ---------- public API ----------

  start(items, folder, { autoResume }) {
    this.items = items;
    this.folder = folder;
    this.autoResume = autoResume;
    this.batchId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.batchStartedAt = Date.now();
    this.dirCache = new Map([['', Promise.resolve(folder.id)]]);
    this.state = 'running';
    this.banner = null;
    this.speed = 0;
    for (const it of items) {
      it.fp = fingerprint(it, folder.id);
      it.chunk = tuning.chunkStart;
    }
    this._saveManifest();
    this._pump();
    this._checkDone();
    this._emit();
  }

  pause() {
    if (this.state !== 'running' && this.state !== 'offline' && this.state !== 'needsAuth') return;
    this.state = 'paused';
    this.banner = 'paused';
    this._abortActive('paused');
    this._clearRetries();
    this._emit();
  }

  resume() {
    if (!['paused', 'offline', 'blocked', 'needsAuth'].includes(this.state)) return;
    this.state = 'running';
    this.banner = null;
    this.netStrikes = 0;
    clearInterval(this._poll);
    this._poll = null;
    for (const it of this.items) if (it.status === 'paused') it.status = 'waiting';
    this._pump();
    this._emit();
  }

  // Called from a click so Google's window is allowed to open.
  reauthorize() {
    return requestToken({ prompt: '', hint: this.email }).then(() => {
      this._softAuthTried = false;
      if (this.banner === 'auth') this.banner = null;
      if (this.state === 'needsAuth') this.resume();
      this._emit();
    });
  }

  cancelItem(id) {
    const it = this._get(id);
    if (!it || FINAL.has(it.status)) return;
    it.cancelRequested = true;
    clearTimeout(it.retryTimer);
    if (it.status === 'processing') abortMute();
    if (it.controller) {
      it.abortTo = 'cancelled';
      it.controller.abort();
    }
    if (it.sessionUri) this.drive.cancelSession(it.sessionUri);
    store.del(`s:${it.fp}`);
    this._release(it);
    it.status = 'cancelled';
    it.error = null;
    this._checkDone();
    this._emit();
  }

  cancelAll() {
    for (const it of this.items) if (!FINAL.has(it.status)) this.cancelItem(it.id);
    this.banner = null;
    clearInterval(this._poll);
    if (this.state !== 'done' && !this.active.size) this._checkDone(true);
    this._emit();
  }

  retryItem(id, { withSound = false } = {}) {
    const it = this._get(id);
    if (!it || it.status !== 'failed') return;
    if (withSound) {
      it.mute = false;
      this._release(it);
      it.fp = fingerprint(it, this.folder.id);
    }
    it.status = 'waiting';
    it.attempts = 0;
    it.error = null;
    if (this.state === 'done' || this.state === 'blocked') {
      this.state = 'running';
      this.banner = null;
    }
    this._pump();
    this._emit();
  }

  retryFailed() {
    for (const it of this.items) if (it.status === 'failed' && !it.error?.needsChoice) this.retryItem(it.id);
  }

  setOnline(online) {
    if (!online) return this._goOffline();
    if (this.state !== 'offline') return;
    clearInterval(this._poll);
    this._poll = null;
    if (this.autoResume) {
      setTimeout(() => this.state === 'offline' && this.resume(), 1200);
    } else {
      this.state = 'paused';
      this.banner = 'onlineManual';
      this._emit();
    }
  }

  stats() {
    let total = 0, uploaded = 0, uploading = 0, waiting = 0, failed = 0, skipped = 0;
    let bytes = 0, done = 0, remaining = 0;
    for (const it of this.items) {
      if (it.status === 'cancelled' || it.status === 'skipped') {
        skipped++;
        continue;
      }
      total++;
      bytes += it.size;
      if (it.status === 'uploaded') {
        uploaded++;
        done += it.size;
        continue;
      }
      const up = it.uploadSize || it.size;
      const frac = it.uploadSize ? Math.min(1, it.sent / it.uploadSize) : 0;
      done += frac * it.size;
      remaining += Math.max(0, up - it.sent);
      if (it.status === 'failed') failed++;
      else if (BUSY.has(it.status)) uploading++;
      else waiting++;
    }
    const progress = bytes ? done / bytes : total ? uploaded / total : 0;
    const eta = this.speed > 1024 && this.state === 'running' ? remaining / this.speed : null;
    return { total, uploaded, uploading, waiting, failed, skipped, bytes, progress, eta, speed: this.speed };
  }

  // ---------- scheduling ----------

  _get(id) {
    return this.items.find((i) => i.id === id);
  }

  _weight(it) {
    return (it.uploadSize || it.size) <= tuning.multipartMax ? 0.5 : 1;
  }

  _needsMute(it) {
    return it.mute && it.kind === 'video' && !it.blob;
  }

  _pump() {
    if (this.state !== 'running') return;
    let used = 0;
    for (const it of this.active) used += this._weight(it);
    for (const it of this.items) {
      if (it.status !== 'waiting') continue;
      const w = this._weight(it);
      if (used + w > tuning.concurrency) {
        if (w === 0.5) break;
        continue;
      }
      if (this._needsMute(it)) {
        const tooMuch = this.heldBytes > 0 && this.heldBytes + it.size > tuning.muteMemoryBudget;
        if (this.muteBusy || tooMuch) continue;
        this.muteBusy = true;
      }
      used += w;
      this._run(it);
    }
  }

  async _run(it) {
    this.active.add(it);
    it.controller = new AbortController();
    it.abortTo = null;
    it.error = null;
    const signal = it.controller.signal;
    try {
      const parentId = await this._resolveDir(it.relDir);

      if (this._needsMute(it)) {
        it.status = 'processing';
        it.muteProgress = 0;
        this._emit();
        try {
          const out = await muteVideo(it.file, {
            onProgress: (p) => {
              it.muteProgress = p;
              this._emit();
            },
          });
          if (it.cancelRequested) return;
          it.blob = out;
          it.muted = true;
          this.heldBytes += out.size;
        } finally {
          this.muteBusy = false;
        }
        if (this.state !== 'running') {
          it.status = this.state === 'paused' ? 'paused' : 'waiting';
          return;
        }
      }

      const src = it.blob || it.file;
      it.uploadSize = src.size;
      it.sent = 0;
      it.status = 'uploading';
      this._emit();
      await this._ensureAuth();

      const meta = { name: it.file.name, parents: [parentId], mimeType: it.file.type || undefined, existingId: it.existingId };
      const onProgress = (n) => this._progress(it, n);
      let file;
      if (src.size <= tuning.multipartMax) {
        file = await this.drive.multipart(meta, src, { onProgress, signal });
      } else {
        file = await this._resumable(it, src, meta, signal);
      }

      it.status = 'uploaded';
      it.driveId = file?.id;
      this._progress(it, it.uploadSize);
      this.netStrikes = 0;
      store.del(`s:${it.fp}`);
      if (it.driveId) store.set(`c:${it.fp}`, it.driveId);
      this._release(it);
    } catch (e) {
      this._fail(it, e);
    } finally {
      this.active.delete(it);
      it.controller = null;
      this._saveManifest();
      this._pump();
      this._checkDone();
      this._emit();
    }
  }

  async _resumable(it, src, meta, signal) {
    const total = src.size;
    const resumable = !it.muted; // muted output is regenerated, so its session can't outlive the page
    if (!it.sessionUri && resumable) {
      const saved = await store.get(`s:${it.fp}`);
      if (saved?.uri && saved.total === total) it.sessionUri = saved.uri;
    }
    if (it.sessionUri) {
      try {
        const r = await this.drive.queryOffset(it.sessionUri, total, { signal });
        if (r.done) return r.file;
        it.offset = r.nextOffset;
        this._progress(it, it.offset);
      } catch (e) {
        if (e.kind !== 'notFound' && e.kind !== 'client') throw e;
        it.sessionUri = null; // expired or invalid: start a fresh session
      }
    }
    if (!it.sessionUri) {
      it.sessionUri = await this.drive.startResumable({ ...meta, size: total });
      it.offset = 0;
      if (resumable) store.set(`s:${it.fp}`, { uri: it.sessionUri, total });
    }
    for (;;) {
      await this._ensureAuth();
      const start = it.offset;
      const end = Math.min(total, start + it.chunk);
      const t0 = performance.now();
      const r = await this.drive.putChunk(it.sessionUri, src, start, end, {
        signal,
        onProgress: (n) => this._progress(it, start + n),
      });
      // Bigger chunks on fast links (fewer round-trips), smaller on slow ones
      // (less to resend after a drop).
      const secs = (performance.now() - t0) / 1000;
      if (secs < 5 && it.chunk < tuning.chunkMax) it.chunk *= 2;
      else if (secs > 30 && it.chunk > tuning.chunkMin) it.chunk /= 2;
      it.attempts = 0;
      this.netStrikes = 0;
      if (r.done) return r.file;
      it.offset = r.nextOffset;
      this._progress(it, it.offset);
    }
  }

  _progress(it, n) {
    const delta = n - (it.sent || 0);
    if (delta > 0) this.sentCounter += delta;
    it.sent = n;
    this._emit();
  }

  _resolveDir(relDir) {
    if (this.dirCache.has(relDir)) return this.dirCache.get(relDir);
    const parts = relDir.split('/');
    const name = parts.pop();
    const parentRel = parts.join('/');
    const p = this._resolveDir(parentRel).then(async (parentId) => {
      const existing = await this.drive.listChildren(parentId, { foldersOnly: true, name });
      if (existing[0]) return existing[0].id;
      const created = await this.drive.createFolder(name, parentId);
      return created.id;
    });
    p.catch(() => this.dirCache.delete(relDir));
    this.dirCache.set(relDir, p);
    return p;
  }

  // ---------- failures ----------

  _fail(it, e) {
    if (it.cancelRequested) {
      it.status = 'cancelled';
      return;
    }
    if (e?.kind === 'aborted') {
      it.status = it.abortTo || 'paused';
      return;
    }
    const detail = e instanceof DriveError ? `${e.message}${e.detail ? `\n${e.detail}` : ''}` : String(e?.message || e);
    if (e instanceof MuteError) {
      it.status = 'failed';
      it.error = { key: 'err_muteFailed', detail, needsChoice: true };
      return;
    }
    switch (e?.kind) {
      case 'network':
        if (!navigator.onLine || ++this.netStrikes >= 3) {
          it.status = 'waiting';
          this._goOffline();
        } else {
          this._retryLater(it, tuning.maxNetworkRetries, 'err_network', detail);
        }
        return;
      case 'auth':
        it.status = 'waiting';
        this._needAuth();
        return;
      case 'rate':
      case 'server':
        this._retryLater(it, tuning.maxServerRetries, 'err_retrying', detail);
        return;
      case 'notFound':
        if (it.sessionUri) {
          it.sessionUri = null;
          it.offset = 0;
          store.del(`s:${it.fp}`);
          this._retryLater(it, tuning.maxServerRetries, 'err_retrying', detail);
        } else {
          it.status = 'failed';
          it.error = { key: 'err_folderGone', detail };
          this._block('permission');
        }
        return;
      case 'quota':
        it.status = 'failed';
        it.error = { key: 'err_quota', detail };
        this._block('quota');
        return;
      case 'permission':
        it.status = 'failed';
        it.error = { key: 'err_permission', detail };
        this._block('permission');
        return;
      default:
        it.status = 'failed';
        it.error = { key: e?.name === 'NotReadableError' ? 'err_readFile' : 'err_generic', detail };
    }
  }

  _retryLater(it, max, key, detail) {
    it.attempts = (it.attempts || 0) + 1;
    if (it.attempts > max) {
      it.status = 'failed';
      it.error = { key: 'err_generic', detail };
      return;
    }
    it.status = 'retrying';
    it.error = { key, detail };
    const delay = Math.min(60000, 1000 * 2 ** (it.attempts - 1)) * (0.75 + Math.random() * 0.5);
    clearTimeout(it.retryTimer);
    it.retryTimer = setTimeout(() => {
      if (it.status === 'retrying') {
        it.status = 'waiting';
        this._pump();
        this._emit();
      }
    }, delay);
  }

  _clearRetries() {
    for (const it of this.items) {
      if (it.status === 'retrying') {
        clearTimeout(it.retryTimer);
        it.status = 'waiting';
      }
    }
  }

  _abortActive(to) {
    for (const it of this.active) {
      if (it.status === 'uploading' && it.controller) {
        it.abortTo = to;
        it.controller.abort();
      }
    }
  }

  _goOffline() {
    if (this.state !== 'running') return;
    this.state = 'offline';
    this.banner = this.autoResume ? 'offline' : 'offlineManual';
    this._abortActive('waiting');
    this._clearRetries();
    // navigator.onLine can claim "online" on a dead Wi-Fi; probe until Drive answers.
    clearInterval(this._poll);
    this._poll = setInterval(async () => {
      if (!navigator.onLine) return;
      try {
        await this.drive.getFolder(this.folder.id);
        this.setOnline(true);
      } catch {}
    }, 5000);
    this._emit();
  }

  _needAuth() {
    if (this.state !== 'running') return;
    this.state = 'needsAuth';
    this.banner = 'auth';
    this._abortActive('waiting');
    this._emit();
  }

  _block(reason) {
    this.state = 'blocked';
    this.banner = reason;
    this._abortActive('waiting');
    this._clearRetries();
  }

  // ---------- auth upkeep ----------

  async _ensureAuth() {
    if (msLeft() > 60000) return;
    if (!this._refreshing) {
      this._refreshing = requestToken({ prompt: '', hint: this.email }).finally(() => {
        this._refreshing = null;
      });
    }
    try {
      await this._refreshing;
    } catch {
      throw new DriveError('auth', 401, 'tokenExpired');
    }
  }

  // Tokens last ~1 hour. Try to renew quietly a few minutes early; if the
  // browser needs a tap for that, show a gentle prompt while uploads go on.
  _authTick() {
    if (this.state !== 'running' || this._softAuthTried) return;
    if (msLeft() < 6 * 60000) {
      this._softAuthTried = true;
      requestToken({ prompt: '', hint: this.email })
        .then(() => (this._softAuthTried = false))
        .catch(() => {
          if (this.state === 'running') {
            this.banner = 'auth';
            this._emit();
          }
        });
    }
  }

  // ---------- bookkeeping ----------

  _release(it) {
    if (it.blob) {
      this.heldBytes = Math.max(0, this.heldBytes - it.blob.size);
      it.blob = null;
    }
  }

  _sample() {
    const now = performance.now();
    const dt = (now - this._lastSample.t) / 1000;
    const inst = (this.sentCounter - this._lastSample.sent) / dt;
    this._lastSample = { t: now, sent: this.sentCounter };
    if (this.state !== 'running') return;
    this.speed = this.speed ? this.speed * 0.8 + inst * 0.2 : inst;
    this._emit();
  }

  _checkDone(force = false) {
    if (!force && (this.active.size || this.items.some((i) => !FINAL.has(i.status)))) return;
    if (this.state === 'done' && !force) return;
    this.state = 'done';
    this.banner = null;
    store.del('batch');
    this.onDone(this._summary());
  }

  _summary() {
    const s = this.stats();
    return {
      id: this.batchId,
      date: this.batchStartedAt,
      folderId: this.folder.id,
      folderName: this.folder.name,
      files: s.total,
      bytes: s.bytes,
      uploaded: s.uploaded,
      failed: s.failed,
      skipped: s.skipped,
      muted: this.items.filter((i) => i.muted && i.status === 'uploaded').length,
    };
  }

  _saveManifest() {
    if (this.state === 'done' || !this.folder) return;
    const left = this.items.filter((i) => !FINAL.has(i.status)).length;
    store.set('batch', { folderName: this.folder.name, folderId: this.folder.id, total: this.items.length, left });
  }

  _emit() {
    this.onUpdate();
  }
}
