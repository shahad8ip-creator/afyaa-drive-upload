import { config, isDemo, tuning } from './config.js';
import { t, getLang, setLang, applyDocumentLang, fmtBytes, fmtNum, fmtDuration, fmtDate } from './i18n.js';
import { preloadAuth, requestToken, signInWithRedirect, completeRedirect, trySilentSignIn, hasToken, signOutLocal, revokeAccess, msLeft } from './auth.js';
import { realDrive, FOLDER_MIME } from './drive.js';
import { mockDrive, sim } from './mock.js';
import { preloadPicker, pickFolder } from './picker.js';
import { preloadMuter } from './mute.js';
import { FAST_MUTE_EXT } from './fastmute.js';
import { store, setNamespace, fingerprint } from './store.js';
import { Uploader, FINAL } from './uploader.js';
import { createHistory } from './history.js';

const $ = (id) => document.getElementById(id);
const drive = isDemo ? mockDrive : realDrive;

const S = {
  user: null,
  userKey: '',
  folder: null,
  items: [],
  filter: 'all',
  uploader: null,
  history: null,
  preparing: false,
  wakeLock: null,
  lastErrors: [],
};
let nextId = 1;

// ------------------------------------------------------------------ i18n

function applyI18n() {
  applyDocumentLang();
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-lang-toggle]')) {
    el.textContent = t('langSwitch');
    el.setAttribute('aria-label', t('langSwitchLabel'));
    el.lang = getLang() === 'ar' ? 'en' : 'ar';
  }
  $('drop-title').textContent = isTouch() ? t('dropTitleTouch') : t('dropTitle');
  renderLandingButton();
  if (S.user) {
    renderUser();
    renderFolder();
    renderSelection();
    rowCache.clear();
    $('file-list').replaceChildren();
    lastVisibleKey = '';
    renderNow();
    if (location.hash === '#history') renderHistory();
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-lang-toggle]')) {
    setLang(getLang() === 'ar' ? 'en' : 'ar');
    applyI18n();
  }
});

const isTouch = () => matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ landing / sign-in

function lastHint() {
  try {
    return localStorage.getItem('hint') || '';
  } catch {
    return '';
  }
}

function renderLandingButton() {
  const hint = lastHint();
  if (isDemo) {
    $('signin-label').textContent = t('tryDemo');
    $('demo-notice').hidden = false;
    $('btn-other-account').hidden = true;
  } else if (hint) {
    $('signin-label').textContent = t('continueAs', { email: hint });
    $('btn-other-account').hidden = false;
  } else {
    $('signin-label').textContent = t('signIn');
    $('btn-other-account').hidden = true;
  }
}

function showSignInError(code) {
  const el = $('signin-error');
  if (!code || code === 'superseded') return (el.hidden = true);
  el.textContent =
    code === 'popup_failed_to_open'
      ? t('popupBlocked')
      : code === 'scope'
        ? t('scopeMissing')
        : code === 'inapp'
          ? t('inAppBrowser')
          : t('signInFailed');
  el.hidden = false;
}

// Google refuses to sign in inside the built-in browsers of social apps
// (Instagram, Facebook, Snapchat, TikTok…), so say so before the user tries.
const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|Snapchat|TikTok|musical_ly|BytedanceWebview|Line\/|Twitter/i.test(navigator.userAgent);

function signIn(prompt) {
  showSignInError(null);
  if (isDemo || config.signInMode === 'popup') {
    // Pop-up mode: requestToken must run synchronously inside the click.
    const hint = prompt === 'select_account' ? '' : lastHint();
    requestToken({ prompt: prompt ?? (hint ? '' : 'select_account'), hint })
      .then(enterApp)
      .catch((e) => showSignInError(e?.code || 'unknown'));
    return;
  }
  // Full-page redirect to Google; Google brings the user straight back here
  // and boot() opens the upload dashboard.
  const hint = prompt === 'select_account' ? '' : lastHint();
  $('btn-signin').disabled = true;
  $('signin-label').textContent = t('signingIn');
  signInWithRedirect({ prompt: prompt ?? (hint ? '' : 'select_account'), hint });
}

$('btn-signin').addEventListener('click', () => signIn());
$('btn-other-account').addEventListener('click', () => signIn('select_account'));

// Coming back to a page restored from the back/forward cache (e.g. the user
// pressed Back on Google's page) must not leave the button stuck.
addEventListener('pageshow', (e) => {
  if (e.persisted && !S.user) {
    $('btn-signin').disabled = false;
    renderLandingButton();
  }
});

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function enterApp() {
  let user;
  try {
    user = await drive.about();
  } catch (e) {
    // A saved token that Google no longer accepts: just show the sign-in page.
    signOutLocal();
    showLanding(e?.kind === 'auth' ? null : 'unknown');
    return;
  }
  S.user = user;
  // Every locally-saved key is scoped to this account, hashed.
  S.userKey = await sha(`afyaa:${user.permissionId || user.emailAddress}`);
  setNamespace(S.userKey);
  try {
    localStorage.setItem('hint', user.emailAddress);
  } catch {}
  S.history = createHistory(drive);
  S.uploader = new Uploader(drive, { email: user.emailAddress, onUpdate: markDirty, onDone: onBatchDone });
  if (!isDemo) preloadPicker().catch(() => {});

  $('boot').hidden = true;
  $('landing').hidden = true;
  $('app').hidden = false;
  $('sim-offline-wrap').hidden = !isDemo;
  renderUser();
  route();
  await restoreFolder();
  showResumeNotice();
  checkPickerReload();
  renderSelection();
  renderNow();
}

function renderUser() {
  const u = S.user;
  const first = (u.displayName || u.emailAddress).split(' ')[0];
  $('welcome').textContent = t('welcome', { name: first });
  $('signed-in-as').textContent = t('signedInAs', { email: u.emailAddress });
  $('menu-name').textContent = u.displayName || '';
  $('menu-email').textContent = u.emailAddress;
  const av = $('avatar');
  if (u.photoLink) {
    av.style.backgroundImage = `url("${encodeURI(u.photoLink)}")`;
    av.textContent = '';
  } else {
    av.style.backgroundImage = '';
    av.textContent = (u.displayName || u.emailAddress || '?').trim().charAt(0).toUpperCase();
  }
}

// ------------------------------------------------------------------ account menu

const menu = $('account-menu');
$('btn-account').addEventListener('click', (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
  $('btn-account').setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('click', (e) => {
  if (!menu.hidden && !menu.contains(e.target)) {
    menu.hidden = true;
    $('btn-account').setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menu.hidden) {
    menu.hidden = true;
    $('btn-account').focus();
  }
});

function uploadsActive() {
  return S.uploader && ['running', 'paused', 'offline', 'needsAuth', 'blocked'].includes(S.uploader.state);
}

async function leaveApp() {
  S.uploader?.destroy();
  S.uploader = null;
  S.user = null;
  S.items = [];
  S.folder = null;
  setNamespace('');
  releaseWakeLock();
  rowCache.clear();
  $('file-list').replaceChildren();
  lastVisibleKey = '';
  $('app').hidden = true;
  showLanding();
}

function showLanding(errorCode) {
  $('boot').hidden = true;
  $('landing').hidden = false;
  $('btn-signin').disabled = false;
  renderLandingButton();
  showSignInError(errorCode || (inAppBrowser && !isDemo ? 'inapp' : null));
}

$('btn-signout').addEventListener('click', async () => {
  menu.hidden = true;
  if (uploadsActive() && !(await confirmDialog(t('leaveWarning'), t('signOut'), t('keepUploading')))) return;
  signOutLocal();
  try {
    localStorage.removeItem('hint'); // don't suggest this account to the next person on a shared device
  } catch {}
  leaveApp();
});

$('btn-disconnect').addEventListener('click', async () => {
  menu.hidden = true;
  if (!(await confirmDialog(t('disconnectConfirm'), t('disconnect'), t('cancel')))) return;
  await store.clearAccount();
  try {
    localStorage.removeItem(`folder:${S.userKey}`);
    localStorage.removeItem('hint');
  } catch {}
  await revokeAccess();
  leaveApp();
});

// ------------------------------------------------------------------ routing

function route() {
  const view = location.hash === '#history' ? 'history' : 'upload';
  $('view-upload').hidden = view !== 'upload';
  $('view-history').hidden = view !== 'history';
  for (const a of document.querySelectorAll('[data-tab]')) {
    if (a.dataset.tab === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (view === 'history' && S.user) renderHistory(true);
}
addEventListener('hashchange', () => S.user && route());

// ------------------------------------------------------------------ destination folder

function folderKey() {
  return `folder:${S.userKey}`;
}

async function restoreFolder() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(folderKey()) || 'null');
  } catch {}
  if (!saved?.id) return renderFolder();
  if (saved.id === 'root') return setFolder({ id: 'root', name: t('myDrive') });
  try {
    const f = await drive.getFolder(saved.id);
    if (f.trashed || f.capabilities?.canAddChildren === false) throw new Error('unusable');
    setFolder({ id: f.id, name: f.name });
  } catch (e) {
    // A flaky connection is not a reason to forget the user's folder; it is
    // checked again before uploading starts.
    if (e?.kind === 'network' || e?.kind === 'server' || e?.kind === 'rate') return setFolder(saved);
    try {
      localStorage.removeItem(folderKey());
    } catch {}
    renderFolder();
  }
}

function setFolder(folder) {
  S.folder = folder;
  try {
    localStorage.setItem(folderKey(), JSON.stringify(folder));
  } catch {}
  $('dest-error').hidden = true;
  renderFolder();
  renderStartButton();
}

function renderFolder() {
  const f = S.folder;
  $('dest-empty').hidden = !!f;
  $('dest-chosen').hidden = !f;
  $('btn-pick').textContent = f ? t('changeFolder') : t('selectFolder');
  $('btn-pick').classList.toggle('btn-primary', !f);
  $('btn-pick').classList.toggle('btn-quiet', !!f);
  $('btn-mydrive').hidden = f?.id === 'root';
  $('step-dest').classList.toggle('is-done', !!f);
  if (f) {
    const name = f.id === 'root' ? t('myDrive') : f.name;
    $('dest-name').textContent = name;
    const url = drive.folderUrl(f.id);
    if (url && url !== '#') $('dest-name').href = url;
    else $('dest-name').removeAttribute('href');
  }
}

function folderError(key) {
  $('dest-error').textContent = t(key);
  $('dest-error').hidden = false;
}

async function chooseFolder() {
  let picked;
  if (isDemo) picked = await demoFolderDialog();
  else {
    try {
      picked = await pickFolder({ lang: getLang(), title: t('pickerTitle') });
    } catch {
      return folderError('err_generic');
    }
  }
  if (!picked) return null;
  try {
    const f = await drive.getFolder(picked.id);
    if (f.capabilities?.canAddChildren === false) {
      folderError('folderNoPermission');
      return null;
    }
    const folder = { id: f.id, name: f.name };
    setFolder(folder);
    return folder;
  } catch (e) {
    folderError(e?.kind === 'notFound' ? 'folderGone' : 'folderNoPermission');
    return null;
  }
}

$('btn-pick').addEventListener('click', chooseFolder);
$('btn-mydrive').addEventListener('click', () => setFolder({ id: 'root', name: t('myDrive') }));

$('btn-newfolder').addEventListener('click', () => {
  const dlg = $('dlg-newfolder');
  const parentName = S.folder ? (S.folder.id === 'root' ? t('myDrive') : S.folder.name) : t('myDrive');
  $('newfolder-where').textContent = t('newFolderIn', { folder: parentName });
  $('newfolder-name').value = '';
  dlg.showModal();
  $('newfolder-name').focus();
});

$('dlg-newfolder').addEventListener('close', async () => {
  const dlg = $('dlg-newfolder');
  const name = $('newfolder-name').value.trim();
  if (dlg.returnValue !== 'ok' || !name) return;
  try {
    const f = await drive.createFolder(name, S.folder?.id || 'root');
    setFolder({ id: f.id, name: f.name || name });
  } catch (e) {
    folderError(e?.kind === 'permission' ? 'folderNoPermission' : 'err_generic');
  }
});

// Demo stand-in for Google Picker.
function demoFolderDialog() {
  const dlg = $('dlg-folders');
  const items = mockDrive._all();
  let current = { id: 'root', name: t('myDrive') };
  const trail = [];
  const folderSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/></svg>';
  function draw() {
    $('folders-path').textContent = [t('myDrive'), ...trail.map((f) => f.name)].join(' / ');
    $('folders-ok').textContent = `${t('continue')} — ${current.name}`;
    const list = $('folders-list');
    list.replaceChildren();
    if (trail.length) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '↩ ..';
      b.onclick = () => {
        trail.pop();
        current = trail.at(-1) || { id: 'root', name: t('myDrive') };
        draw();
      };
      li.append(b);
      list.append(li);
    }
    for (const f of items.values()) {
      if (f.parent !== current.id || f.mimeType !== FOLDER_MIME) continue;
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = folderSvg;
      b.append(document.createTextNode(f.name));
      b.onclick = () => {
        current = { id: f.id, name: f.name };
        trail.push(current);
        draw();
      };
      li.append(b);
      list.append(li);
    }
  }
  draw();
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' ? current : null), { once: true });
  });
}

// ------------------------------------------------------------------ file selection

const VIDEO_EXT = new Set(['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', '3gp', '3g2', 'mts', 'm2ts', 'ts', 'wmv', 'flv', 'mpg', 'mpeg', 'hevc', 'ogv']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'svg', 'raw', 'dng', 'cr2', 'nef', 'arw']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'amr', 'wma']);
const ARCHIVE_EXT = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz']);
const IGNORE = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

function kindOf(file) {
  const type = file.type || '';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (type.startsWith('video/') || VIDEO_EXT.has(ext)) return 'video';
  if (type.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image';
  if (type.startsWith('audio/') || AUDIO_EXT.has(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'pages'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv', 'ods', 'numbers'].includes(ext)) return 'sheet';
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return 'slides';
  if (ARCHIVE_EXT.has(ext) || /zip|compressed|archive/.test(type)) return 'archive';
  return 'other';
}

function selectionLocked() {
  return S.preparing || (S.uploader && S.uploader.state !== 'idle' && S.uploader.state !== 'done');
}

function addFiles(entries) {
  if (selectionLocked()) return;
  if (S.uploader?.state === 'done') resetBatch();
  const seen = new Set(S.items.map((i) => `${i.relDir}/${i.file.name}/${i.size}/${i.file.lastModified}`));
  for (const { file, relDir } of entries) {
    if (IGNORE.has(file.name.toLowerCase()) || file.name.startsWith('._')) continue;
    const key = `${relDir}/${file.name}/${file.size}/${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    S.items.push({
      id: nextId++,
      file,
      relDir,
      size: file.size,
      kind: kindOf(file),
      status: 'waiting',
      sent: 0,
      uploadSize: 0,
      attempts: 0,
    });
  }
  renderSelection();
  renderNow();
}

function relDirOf(path) {
  const parts = (path || '').split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

// iPhone/iPad hand the page temporary copies of the chosen photos and videos
// that belong to the <input>. Clearing input.value (the usual trick to allow
// picking the same files again) can throw those copies away, and with several
// files iOS may also deliver them a moment after the event. So: never clear
// the input; swap in a fresh one for the next pick and keep the used one
// (detached, files intact) until the batch is cleared. Listen to both
// "change" and "input", and re-check briefly if the list arrives empty.
const usedInputs = [];
const takenInputs = new WeakSet();
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const PICKING = 'afyaa:picking';

function markPicking(on) {
  try {
    if (on) sessionStorage.setItem(PICKING, String(Date.now()));
    else sessionStorage.removeItem(PICKING);
  } catch {}
}

function takeFiles(input, attempt = 0) {
  if (takenInputs.has(input)) return;
  const files = [...(input.files || [])];
  if (!files.length) {
    const waits = [300, 800, 1500, 3000];
    if (attempt < waits.length) return setTimeout(() => takeFiles(input, attempt + 1), waits[attempt]);
    markPicking(false);
    return showSelectionNote('noFilesReceived');
  }
  takenInputs.add(input);
  markPicking(false);
  const folder = input.id === 'folder-input';
  addFiles(files.map((file) => ({ file, relDir: folder ? relDirOf(file.webkitRelativePath) : '' })));
  // A new element with the same attributes (cloneNode would copy the files too).
  const fresh = document.createElement('input');
  for (const a of input.attributes) fresh.setAttribute(a.name, a.value);
  input.replaceWith(fresh);
  usedInputs.push(input);
}

for (const ev of ['change', 'input']) {
  document.addEventListener(ev, (e) => {
    if (e.target?.matches?.('#file-input, #folder-input')) takeFiles(e.target);
  });
}
// The picker was closed without choosing anything.
document.addEventListener('cancel', (e) => e.target?.matches?.('#file-input, #folder-input') && markPicking(false), true);
document.addEventListener('click', (e) => {
  if (e.target.closest?.('label[for="file-input"], label[for="folder-input"]')) markPicking(true);
});

function showSelectionNote(key) {
  $('selection-bar').hidden = false;
  $('selection-summary').textContent = t(key);
}

// On iPhone, preparing many or large videos can use so much memory that iOS
// reloads the page and the selection is lost. Tell the user what happened
// instead of silently showing an empty list.
function checkPickerReload() {
  let at = 0;
  try {
    at = Number(sessionStorage.getItem(PICKING)) || 0;
  } catch {}
  markPicking(false);
  if (!isIOS || !at || Date.now() - at > 10 * 60000) return;
  $('resume-text').textContent = t('pickerReloaded');
  $('resume-notice').hidden = false;
  $('btn-resume-select').hidden = true;
}

const dz = $('dropzone');
const dirSupported =
  'webkitdirectory' in document.createElement('input') &&
  !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) &&
  !(navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
$('btn-choose-folder').hidden = !dirSupported;
// iPhone/iPad: picking from the Photos library makes iOS prepare (and often
// convert) a copy of each video before the page gets it, which is slow for
// big videos. Picking via "Choose File" (the Files app) skips that step.
$('ios-tip').hidden = !isIOS;

// The "Choose files" / "Choose a folder" buttons are <label for=…> elements,
// so the browser opens its own file picker natively (Finder, File Explorer,
// iOS/Android pickers) without depending on a scripted click. A click on the
// rest of the drop zone opens the same picker.
function openPicker(input) {
  if (selectionLocked()) return;
  markPicking(true);
  try {
    if (input.showPicker) return input.showPicker();
  } catch {}
  input.click();
}
dz.addEventListener('click', (e) => {
  if (e.target.closest('label, input')) return; // the label already opens the picker
  openPicker($('file-input'));
});
dz.addEventListener('keydown', (e) => {
  if (e.target === dz && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    openPicker($('file-input'));
  }
});
for (const label of document.querySelectorAll('label.btn[for]')) {
  label.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker($(label.htmlFor));
    }
  });
}
for (const ev of ['dragenter', 'dragover']) {
  dz.addEventListener(ev, (e) => {
    e.preventDefault();
    if (!selectionLocked()) dz.classList.add('is-over');
  });
}
dz.addEventListener('dragleave', (e) => {
  if (!dz.contains(e.relatedTarget)) dz.classList.remove('is-over');
});
dz.addEventListener('drop', async (e) => {
  e.preventDefault();
  dz.classList.remove('is-over');
  if (selectionLocked()) return;
  const dtItems = [...(e.dataTransfer.items || [])];
  const entries = dtItems.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return addFiles([...e.dataTransfer.files].map((file) => ({ file, relDir: '' })));
  const out = [];
  let count = 0;
  // Only file references are collected here; no file contents are read.
  const walk = async (entry, dir) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej)).catch(() => null);
      if (file) out.push({ file, relDir: dir });
      if (++count % 200 === 0) $('selection-summary').textContent = t('readingFolder', { count: fmtNum(count) });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const sub = dir ? `${dir}/${entry.name}` : entry.name;
      for (;;) {
        const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
        if (!batch.length) break;
        await Promise.all(batch.map((child) => walk(child, sub)));
      }
    }
  };
  $('selection-bar').hidden = false;
  for (const entry of entries) await walk(entry, '');
  addFiles(out);
});
// Keep a stray drop outside the zone from navigating away from the page.
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => e.preventDefault());

// Centre button of the phone navigation bar: jump to the upload view and pick files.
// It is a <label for="file-input">, so the picker opens natively.
$('btn-bn-add').addEventListener('click', (e) => {
  if (location.hash === '#history') location.hash = '#upload';
  if (selectionLocked()) {
    e.preventDefault();
    $('queue').scrollIntoView({ block: 'start' });
  }
});

$('btn-clear').addEventListener('click', () => {
  if (selectionLocked()) return;
  resetBatch();
});

function resetBatch() {
  S.items = [];
  usedInputs.length = 0;
  if (S.uploader) {
    S.uploader.items = [];
    S.uploader.state = 'idle';
    S.uploader.banner = null;
  }
  rowCache.clear();
  $('file-list').replaceChildren();
  lastVisibleKey = '';
  listLimit = LIST_PAGE;
  S.filter = 'all';
  renderSelection();
  renderNow();
}

function renderSelection() {
  const n = S.items.length;
  const bytes = S.items.reduce((a, i) => a + i.size, 0);
  $('selection-bar').hidden = !n;
  $('selection-summary').textContent =
    n === 1 ? t('selectedOne', { size: fmtBytes(bytes) }) : t('selectedSummary', { count: fmtNum(n), size: fmtBytes(bytes) });
  $('step-files').classList.toggle('is-done', n > 0);
  const videos = S.items.filter((i) => i.kind === 'video').length;
  // The ~30 MB FFmpeg engine is only fetched once muting is on AND there is a
  // video that the instant MP4/MOV method can't handle.
  if ($('opt-mute').checked && S.items.some((i) => i.kind === 'video' && !FAST_MUTE_EXT.test(i.file.name))) preloadMuter();
  $('mute-count').hidden = !($('opt-mute').checked && videos);
  $('mute-count').textContent = t('optMuteVideos', { count: fmtNum(videos) });
  renderStartButton();
}

$('opt-mute').addEventListener('change', () => renderSelection());

// ------------------------------------------------------------------ start / preflight

function renderStartButton() {
  const b = $('btn-start');
  const locked = selectionLocked();
  b.hidden = !!locked && !S.preparing;
  if (S.preparing) {
    b.disabled = true;
    b.textContent = S.preparing === true ? t('preparing') : S.preparing;
  } else if (!S.folder) {
    b.disabled = true;
    b.textContent = t('startNeedFolder');
  } else if (!S.items.length || S.uploader?.state === 'done') {
    b.disabled = true;
    b.textContent = t('startNeedFiles');
  } else {
    b.disabled = false;
    b.textContent = t('start');
  }
  $('view-upload').querySelector('.setup').classList.toggle('locked', !!locked);
}

$('btn-start').addEventListener('click', async () => {
  if (!S.folder || !S.items.length || selectionLocked()) return;
  // Renew the Google token now, while we still have the click gesture, so a
  // long upload doesn't stall waiting for one later.
  let tokenRenewal = null;
  if (!isDemo && msLeft() < 20 * 60000) tokenRenewal = requestToken({ prompt: '', hint: S.user.emailAddress }).catch(() => null);

  S.preparing = true;
  renderStartButton();
  try {
    await tokenRenewal;
    const ok = await preflight();
    if (!ok) return;
    requestWakeLock();
    S.uploader.start(S.items, S.folder, { autoResume: $('opt-resume').checked });
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  } finally {
    S.preparing = false;
    renderStartButton();
    renderNow();
  }
});

async function preflight() {
  // 1) Is the folder still there and writable?
  if (S.folder.id !== 'root') {
    try {
      const f = await drive.getFolder(S.folder.id);
      if (f.trashed) return folderError('folderGone'), false;
      if (f.capabilities?.canAddChildren === false) return folderError('folderNoPermission'), false;
    } catch (e) {
      folderError(e?.kind === 'notFound' ? 'folderGone' : e?.kind === 'network' ? 'err_network' : 'folderNoPermission');
      return false;
    }
  }

  // 2) Mute decisions — never silently send a video elsewhere for processing.
  const mute = $('opt-mute').checked;
  for (const it of S.items) it.mute = mute && it.kind === 'video';
  // MP4/MOV are muted without loading them into memory, so no size limit.
  const tooBig = S.items.filter((i) => i.mute && i.size > tuning.muteMaxBytes && !FAST_MUTE_EXT.test(i.file.name));
  if (tooBig.length) {
    const choice = await bigVideoDialog(tooBig);
    if (choice === 'cancel') return false;
    for (const it of tooBig) {
      if (choice === 'sound') it.mute = false;
      else {
        it.status = 'skipped';
        it.error = { key: 'err_muteTooBig' };
      }
    }
  }

  // 3) Same-name files already in the destination, and files this device
  //    already finished uploading (after a refresh or a dropped connection).
  S.preparing = t('checkingDest');
  renderStartButton();
  const listings = new Map();
  const listDir = async (relDir) => {
    if (listings.has(relDir)) return listings.get(relDir);
    const p = (async () => {
      let id = S.folder.id;
      for (const part of relDir.split('/').filter(Boolean)) {
        const found = await drive.listChildren(id, { foldersOnly: true, name: part });
        if (!found[0]) return [];
        id = found[0].id;
      }
      return (await drive.listChildren(id)).filter((f) => f.mimeType !== FOLDER_MIME);
    })();
    listings.set(relDir, p);
    return p;
  };
  const dups = [];
  try {
    const check = async (it) => {
      if (it.status !== 'waiting') return;
      const existing = await listDir(it.relDir);
      if (!existing.length) return;
      const doneId = await store.get(`c:${fingerprint(it, S.folder.id)}`);
      if (doneId && existing.some((f) => f.id === doneId)) {
        it.status = 'uploaded';
        it.driveId = doneId;
        it.note = 'alreadyUploaded';
        it.uploadSize = it.sent = it.size;
        return;
      }
      const match = existing.find((f) => f.name === it.file.name);
      if (match) {
        it.dupMatch = match;
        dups.push(it);
      }
    };
    for (let i = 0; i < S.items.length; i += 100) await Promise.all(S.items.slice(i, i + 100).map(check));
    dups.sort((a, b) => a.id - b.id);
  } catch (e) {
    S.lastErrors.unshift(`preflight: ${e?.message || e}`);
    // Couldn't check (e.g. flaky network): upload as new copies, never overwrite.
  }
  if (dups.length) {
    const ok = await duplicateDialog(dups);
    if (!ok) {
      for (const it of S.items) if (it.note === 'alreadyUploaded' || it.status === 'skipped') Object.assign(it, { status: 'waiting', note: null, error: null, sent: 0, uploadSize: 0 });
      return false;
    }
  }
  return true;
}

function bigVideoDialog(list) {
  const dlg = $('dlg-big');
  $('big-body').textContent = t('bigBody', { count: fmtNum(list.length) });
  const ul = $('big-list');
  ul.replaceChildren(
    ...list.slice(0, 50).map((i) => {
      const li = document.createElement('li');
      li.textContent = `${i.file.name} — ${fmtBytes(i.size)}`;
      return li;
    }),
  );
  dlg.returnValue = 'cancel';
  dlg.showModal();
  return new Promise((res) => dlg.addEventListener('close', () => res(dlg.returnValue || 'cancel'), { once: true }));
}

function duplicateDialog(dups) {
  const dlg = $('dlg-dup');
  $('dup-intro').textContent = dups.length === 1 ? t('dupIntro') : t('dupIntroMany', { count: fmtNum(dups.length) });
  dlg.querySelector('.dup-all').hidden = dups.length < 2;
  const list = $('dup-list');
  list.replaceChildren();
  const canReplace = (it) =>
    it.dupMatch.capabilities?.canEdit !== false && !String(it.dupMatch.mimeType || '').startsWith('application/vnd.google-apps');
  for (const it of dups) {
    const li = document.createElement('li');
    li.className = 'dup-row';
    const name = document.createElement('p');
    name.className = 'dup-name';
    name.textContent = it.relDir ? `${it.relDir}/${it.file.name}` : it.file.name;
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const [val, key] of [['new', 'dupNew'], ['replace', 'dupReplace'], ['skip', 'dupSkip']]) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `dup-${it.id}`;
      input.value = val;
      input.checked = val === 'new';
      if (val === 'replace' && !canReplace(it)) input.disabled = true;
      const span = document.createElement('span');
      span.textContent = val === 'replace' && input.disabled ? t('dupNoReplace') : t(key);
      label.append(input, span);
      seg.append(label);
    }
    li.append(name, seg);
    list.append(li);
  }
  for (const b of dlg.querySelectorAll('[data-dup-all]')) {
    b.onclick = () => {
      for (const it of dups) {
        const input = dlg.querySelector(`input[name="dup-${it.id}"][value="${b.dataset.dupAll}"]`);
        if (input && !input.disabled) input.checked = true;
      }
    };
  }
  dlg.returnValue = 'cancel';
  dlg.showModal();
  return new Promise((res) => {
    dlg.addEventListener(
      'close',
      async () => {
        if (dlg.returnValue !== 'ok') return res(false);
        const replacing = dups.filter((it) => dlg.querySelector(`input[name="dup-${it.id}"]:checked`)?.value === 'replace');
        // Replacing is the one action that touches an existing Drive file, so
        // it gets its own explicit confirmation.
        if (replacing.length && !(await confirmDialog(`${t('dupReplaceNote')}`, t('dupReplace'), t('cancel')))) return res(false);
        for (const it of dups) {
          const v = dlg.querySelector(`input[name="dup-${it.id}"]:checked`)?.value || 'new';
          if (v === 'skip') it.status = 'skipped';
          if (v === 'replace') it.existingId = it.dupMatch.id;
        }
        res(true);
      },
      { once: true },
    );
  });
}

// ------------------------------------------------------------------ queue controls

$('btn-pause').addEventListener('click', () => {
  const u = S.uploader;
  if (['paused', 'blocked'].includes(u.state)) u.resume();
  else u.pause();
});
$('btn-cancel-all').addEventListener('click', async () => {
  if (await confirmDialog(t('cancelAllConfirm'), t('cancelAllYes'), t('keepUploading'))) S.uploader.cancelAll();
});
const retryAll = () => {
  requestWakeLock();
  S.uploader.retryFailed();
};
$('btn-retry-failed').addEventListener('click', retryAll);
$('btn-retry-failed-2').addEventListener('click', retryAll);
$('btn-more').addEventListener('click', () => {
  resetBatch();
  $('step-files').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('banner-btn').addEventListener('click', async () => {
  const u = S.uploader;
  if (u.banner === 'auth') {
    u.reauthorize().catch((e) => S.lastErrors.unshift(`auth: ${e?.code || e}`));
  } else if (u.banner === 'permission') {
    const folder = await chooseFolder();
    if (folder) {
      u.folder = folder;
      u.dirCache = new Map([['', Promise.resolve(folder.id)]]);
      for (const it of u.items) if (!FINAL.has(it.status) || it.status === 'failed') it.fp = fingerprint(it, folder.id);
      u.resume();
      u.retryFailed();
    }
  } else {
    u.resume();
  }
});

$('file-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = Number(btn.closest('.row').dataset.id);
  const u = S.uploader;
  switch (btn.dataset.act) {
    case 'remove':
      S.items = S.items.filter((i) => i.id !== id);
      rowCache.delete(id);
      renderSelection();
      break;
    case 'cancel':
      u.cancelItem(id);
      break;
    case 'retry':
      u.retryItem(id);
      break;
    case 'sound':
      u.retryItem(id, { withSound: true });
      break;
  }
  renderNow();
});

$('filters').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-filter]');
  if (!chip) return;
  S.filter = chip.dataset.filter;
  listLimit = LIST_PAGE;
  renderNow();
});

$('sim-offline').addEventListener('change', (e) => {
  sim.offline = e.target.checked;
  S.uploader?.setOnline(!sim.offline);
});

addEventListener('online', () => S.uploader?.setOnline(true));
addEventListener('offline', () => S.uploader?.setOnline(false));

addEventListener('beforeunload', (e) => {
  if (uploadsActive() && S.uploader.state !== 'blocked') {
    e.preventDefault();
    e.returnValue = t('leaveWarning');
  }
});

// Phones stop network activity when the screen sleeps; keep it awake while uploading.
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !S.wakeLock) {
      S.wakeLock = await navigator.wakeLock.request('screen');
      S.wakeLock.addEventListener('release', () => (S.wakeLock = null));
    }
  } catch {}
}
function releaseWakeLock() {
  S.wakeLock?.release().catch(() => {});
  S.wakeLock = null;
}
// Leaving Safari (or locking the phone) pauses the page; on return, pick up
// exactly where uploads stopped instead of waiting for retry timers.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    return;
  }
  if (S.uploader?.state === 'running') requestWakeLock();
  S.uploader?.wake({ wasHidden: hiddenAt && Date.now() - hiddenAt > 3000 });
  hiddenAt = 0;
});
addEventListener('pageshow', (e) => {
  if (e.persisted) S.uploader?.wake({ wasHidden: true });
});

function onBatchDone(summary) {
  releaseWakeLock();
  if (summary.files > 0) S.history?.save(summary);
  markDirty();
}

function showResumeNotice() {
  store.get('batch').then((b) => {
    if (!b || !b.left) return;
    $('resume-text').textContent = t('resumeNotice', { folder: b.folderName, left: fmtNum(b.left), total: fmtNum(b.total) });
    $('resume-notice').hidden = false;
    $('btn-resume-select').hidden = false;
    // Same options as last time, so re-selected files resume where they stopped.
    if (b.mute != null) $('opt-mute').checked = !!b.mute;
    if (b.autoResume != null) $('opt-resume').checked = !!b.autoResume;
    renderSelection();
  });
}
$('btn-resume-select').addEventListener('click', () => ($('resume-notice').hidden = true));
$('btn-dismiss-resume').addEventListener('click', () => {
  $('resume-notice').hidden = true;
  store.del('batch');
});

// ------------------------------------------------------------------ rendering

let dirty = false;
let lastRender = 0;
let renderTimer = null;

function markDirty() {
  if (dirty) return;
  dirty = true;
  const wait = Math.max(0, 200 - (performance.now() - lastRender));
  renderTimer = setTimeout(() => requestAnimationFrame(renderNow), wait);
}

function renderNow() {
  clearTimeout(renderTimer);
  dirty = false;
  lastRender = performance.now();
  if (!S.user) return;
  const u = S.uploader;
  const started = u && u.state !== 'idle';
  const items = started ? u.items : S.items;
  const hasQueue = items.length > 0;
  $('queue').hidden = !hasQueue;
  $('view-upload').classList.toggle('has-queue', hasQueue);
  $('view-upload').classList.toggle('is-started', !!started);
  renderStartButton();
  if (!hasQueue) return;

  const s = started ? u.stats() : previewStats(items);
  const pct = Math.floor(s.progress * 100);
  // Reveal the coloured logo from the bottom: 50% progress = bottom half in colour.
  $('meter-color').style.clipPath = `inset(${(1 - s.progress) * 100}% 0 0 0)`;
  $('pct-num').textContent = fmtNum(pct);
  $('overall-fill').style.width = `${s.progress * 100}%`;
  $('overall-bar').setAttribute('aria-valuenow', String(pct));
  $('overall-bar').setAttribute('aria-label', t('overall'));

  $('s-total').textContent = fmtNum(s.total);
  $('s-uploaded').textContent = fmtNum(s.uploaded);
  $('s-uploading').textContent = fmtNum(s.uploading);
  $('s-waiting').textContent = fmtNum(s.waiting);
  $('s-failed').textContent = fmtNum(s.failed);
  $('s-failed').classList.toggle('has', s.failed > 0);
  $('s-size').textContent = fmtBytes(s.bytes);

  const folderName = (u?.folder || S.folder)?.id === 'root' ? t('myDrive') : (u?.folder || S.folder)?.name;
  $('uploading-to').textContent = started && u.state !== 'done' && folderName ? t('uploadingTo', { folder: folderName }) : '';
  $('files-count').textContent = started ? t('filesUploaded', { done: fmtNum(s.uploaded), total: fmtNum(s.total) }) : '';
  let eta = '';
  if (started && u.state === 'running') {
    eta = s.eta != null ? `${t('eta', { time: fmtDuration(s.eta) })} · ${t('speed', { speed: fmtBytes(s.speed) })}` : t('etaCalculating');
  }
  $('eta').textContent = eta;

  renderBanner(u, started);

  const done = started && u.state === 'done';
  $('controls').hidden = !started || done;
  $('btn-pause').textContent = ['paused', 'blocked'].includes(u?.state) ? t('resume') : t('pause');
  $('btn-pause').classList.toggle('btn-primary', ['paused', 'blocked'].includes(u?.state));
  $('btn-pause').classList.toggle('btn-quiet', !['paused', 'blocked'].includes(u?.state));
  $('btn-retry-failed').hidden = !(s.failed > 0) || done;
  $('done').hidden = !done;
  if (done) {
    $('done-body').textContent = t('doneBody', { ok: fmtNum(s.uploaded), total: fmtNum(s.total), folder: folderName });
    $('done-failed').hidden = !s.failed;
    $('done-failed').textContent = t('doneWithFailures', { failed: fmtNum(s.failed) });
    $('btn-retry-failed-2').hidden = !s.failed;
    const url = drive.folderUrl(u.folder.id);
    $('done-open').hidden = !url || url === '#';
    if (url) $('done-open').href = url;
  }

  renderList(items, started);
  if (!$('debug').hidden && $('debug').open) renderDebug(u, s);
}

function previewStats(items) {
  const bytes = items.reduce((a, i) => a + i.size, 0);
  return { total: items.length, uploaded: 0, uploading: 0, waiting: items.length, failed: 0, bytes, progress: 0, eta: null, speed: 0 };
}

function renderBanner(u, started) {
  const b = $('banner');
  const key = started ? u.banner : null;
  if (!key) return (b.hidden = true);
  const map = {
    offline: ['bannerOffline', '', ''],
    offlineManual: ['bannerOfflineManual', '', 'resume'],
    onlineManual: ['bannerOnlineManual', 'is-info', 'resume'],
    paused: ['bannerPaused', 'is-info', ''],
    auth: ['bannerAuth', '', 'bannerAuthBtn'],
    quota: ['bannerQuota', 'is-error', ''],
    permission: ['bannerPermission', 'is-error', 'changeFolder'],
  };
  const [text, cls, btn] = map[key];
  b.hidden = false;
  b.className = `banner ${cls}`;
  $('banner-text').textContent = t(text);
  $('banner-btn').hidden = !btn;
  if (btn) $('banner-btn').textContent = t(btn);
}

const ICONS = {
  video: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h9A1.5 1.5 0 0 1 16 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 16.5Z"/><path d="m16 10.5 4-2.5v8l-4-2.5"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4.5-4.5 3 3L15 13l4 4"/>',
  audio: '<path d="M9 17V6l10-2v11"/><circle cx="6.5" cy="17" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>',
  pdf: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5M9 14h6M9 17h4"/>',
  doc: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5M9 12h6M9 15h6M9 18h4"/>',
  sheet: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>',
  slides: '<rect x="3.5" y="5" width="17" height="11" rx="1.5"/><path d="M12 16v4M8.5 20h7"/>',
  archive: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v2m0 2v2m0 2v2m-1.5 0h3v3h-3Z"/>',
  other: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/>',
};
const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const RETRY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';

const rowCache = new Map(); // id -> { el, sig }
let lastVisibleKey = '';
// Only a page of rows is in the DOM at a time, so thousands of files don't
// slow the page (or the uploads) down. "Show more" adds another page.
const LIST_PAGE = 200;
let listLimit = LIST_PAGE;

function matchFilter(it, f) {
  if (f === 'all') return true;
  if (f === 'done') return it.status === 'uploaded';
  if (f === 'failed') return it.status === 'failed';
  return !FINAL.has(it.status);
}

function renderList(items, started) {
  const counts = { all: items.length, active: 0, done: 0, failed: 0 };
  for (const it of items) {
    if (it.status === 'uploaded') counts.done++;
    else if (it.status === 'failed') counts.failed++;
    else if (!FINAL.has(it.status)) counts.active++;
  }
  for (const chip of document.querySelectorAll('#filters [data-filter]')) {
    const f = chip.dataset.filter;
    chip.setAttribute('aria-selected', String(f === S.filter));
    chip.querySelector('[data-count]').textContent = fmtNum(counts[f]);
    chip.hidden = !started && f !== 'all';
  }
  const filtered = items.filter((i) => matchFilter(i, S.filter));
  const visible = filtered.slice(0, listLimit);
  const key = visible.map((i) => i.id).join(',');
  const list = $('file-list');
  if (key !== lastVisibleKey) {
    lastVisibleKey = key;
    list.replaceChildren(...visible.map((it) => rowFor(it).el));
  }
  for (const it of visible) updateRow(rowFor(it), it, started);
  $('list-empty').hidden = filtered.length > 0;
  $('list-more').hidden = filtered.length <= listLimit;
  $('list-more-text').textContent = t('moreRows', { shown: fmtNum(visible.length), total: fmtNum(filtered.length) });
}

function rowFor(it) {
  let r = rowCache.get(it.id);
  if (r) return r;
  const el = document.createElement('li');
  el.className = 'row';
  el.dataset.id = it.id;
  el.innerHTML = `
    <span class="kind" data-k="${it.kind}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[it.kind]}</svg></span>
    <div class="row-main">
      <p class="row-name"></p>
      <p class="row-meta"><span class="status"></span><span class="meta-info"></span><span class="tag" hidden></span><span class="pct"></span></p>
      <div class="row-bar"><span></span></div>
      <div class="row-err" hidden></div>
    </div>
    <div class="row-actions"></div>`;
  const display = it.relDir ? `${it.relDir}/${it.file.name}` : it.file.name;
  el.querySelector('.row-name').textContent = display;
  el.querySelector('.row-name').title = display;
  r = { el, sig: '' };
  rowCache.set(it.id, r);
  return r;
}

function updateRow(r, it, started) {
  const isProc = it.status === 'processing';
  const frac = isProc ? it.muteProgress || 0 : it.uploadSize ? it.sent / it.uploadSize : 0;
  const pct = Math.floor(Math.min(1, frac) * 100);
  const showSpeed = it.status === 'uploading' && it.speed > 1024;
  const speedText = showSpeed ? t('speed', { speed: fmtBytes(it.speed) }) : '';
  const sig = `${it.status}|${pct}|${speedText}|${it.error?.key || ''}|${it.muted ? 1 : 0}|${started ? 1 : 0}|${it.note || ''}|${it.mute ? 1 : 0}`;
  if (sig === r.sig) return;
  r.sig = sig;
  const el = r.el;
  el.dataset.s = it.status;
  const st = el.querySelector('.status');
  st.dataset.s = it.status;
  st.textContent = isProc ? t('processingMute') : it.note === 'alreadyUploaded' ? t('alreadyUploaded') : t(`st_${it.status}`);
  el.querySelector('.meta-info').textContent = `${t(`k_${it.kind}`)} · ${fmtBytes(it.size)}`;
  const tag = el.querySelector('.tag');
  tag.hidden = !(it.muted || (it.mute && !FINAL.has(it.status)));
  tag.textContent = t('mutedTag');
  const pctText = ['uploading', 'processing', 'paused', 'retrying'].includes(it.status) && pct > 0 ? `${fmtNum(pct)}%` : '';
  el.querySelector('.pct').textContent = speedText ? `${pctText || `${fmtNum(0)}%`} — ${speedText}` : pctText;
  el.querySelector('.row-bar > span').style.width = `${pct}%`;

  const err = el.querySelector('.row-err');
  if (it.error && ['failed', 'retrying', 'skipped'].includes(it.status)) {
    err.hidden = false;
    err.replaceChildren();
    const msg = document.createElement('p');
    msg.textContent = t(it.error.key);
    err.append(msg);
    if (it.error.needsChoice) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-small btn-quiet inline-action';
      b.dataset.act = 'sound';
      b.textContent = t('uploadWithSound');
      err.append(b);
    }
    if (it.error.detail) {
      const d = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = t('technicalDetails');
      const pre = document.createElement('pre');
      pre.textContent = it.error.detail;
      d.append(sum, pre);
      err.append(d);
    }
  } else {
    err.hidden = true;
  }

  const actions = el.querySelector('.row-actions');
  const name = it.file.name;
  if (!started) {
    actions.innerHTML = `<button type="button" class="icon-btn" data-act="remove">${X_SVG}</button>`;
    actions.firstChild.setAttribute('aria-label', t('cancelFile', { name }));
  } else if (it.status === 'uploaded') {
    actions.innerHTML = `<span class="done-mark">${CHECK_SVG}</span>`;
    actions.firstChild.setAttribute('aria-label', t('st_uploaded'));
  } else if (it.status === 'failed') {
    actions.innerHTML = `${it.error?.needsChoice ? '' : `<button type="button" class="icon-btn" data-act="retry">${RETRY_SVG}</button>`}<button type="button" class="icon-btn" data-act="cancel">${X_SVG}</button>`;
    actions.querySelector('[data-act="retry"]')?.setAttribute('aria-label', t('retryFile', { name }));
    actions.querySelector('[data-act="cancel"]').setAttribute('aria-label', t('cancelFile', { name }));
  } else if (FINAL.has(it.status)) {
    actions.replaceChildren();
  } else {
    actions.innerHTML = `<button type="button" class="icon-btn" data-act="cancel">${X_SVG}</button>`;
    actions.firstChild.setAttribute('aria-label', t('cancelFile', { name }));
  }
}

$('debug').addEventListener('toggle', () => renderNow());
function renderDebug(u, s) {
  if (!u) return;
  const lines = [
    `mode: ${isDemo ? 'demo' : 'google'}  state: ${u.state}  banner: ${u.banner || '-'}`,
    `parallel slots: ${u.slots} (${tuning.concurrencyMin}–${tuning.concurrencyMax})  active: ${u.active.size}  chunk start: ${fmtBytes(tuning.chunkStart)}`,
    `speed: ${fmtBytes(s.speed || 0)}/s  muted in memory: ${fmtBytes(u.heldBytes)}`,
    `token valid for: ${Math.round(msLeft() / 60000)} min  online: ${navigator.onLine}`,
    ...u.items.filter((i) => i.error?.detail).slice(0, 8).map((i) => `#${i.id} ${i.status}: ${i.error.detail.split('\n')[0]}`),
    ...S.lastErrors.slice(0, 5),
  ];
  $('debug-text').textContent = lines.join('\n');
}

// ------------------------------------------------------------------ history

async function renderHistory(reload = false) {
  const status = $('history-status');
  const list = $('history-list');
  if (reload || !S.history.records) {
    status.textContent = t('historyLoading');
    list.replaceChildren();
    try {
      await S.history.load();
    } catch {
      status.textContent = t('historyFailed');
      return;
    }
  }
  const recs = S.history.records || [];
  status.textContent = recs.length ? '' : t('historyEmpty');
  $('btn-clear-history').hidden = !recs.length;
  list.replaceChildren(
    ...recs.map((r) => {
      const li = document.createElement('li');
      li.className = 'h-item';
      const top = document.createElement('div');
      top.className = 'h-top';
      const url = drive.folderUrl(r.folderId);
      const folder = document.createElement(url && url !== '#' ? 'a' : 'span');
      folder.className = 'h-folder';
      folder.textContent = r.folderId === 'root' ? t('myDrive') : r.folderName;
      if (folder.tagName === 'A') {
        folder.href = url;
        folder.target = '_blank';
        folder.rel = 'noopener noreferrer';
      }
      const date = document.createElement('span');
      date.className = 'h-date';
      date.textContent = fmtDate(r.date);
      top.append(folder, date);
      const nums = document.createElement('div');
      nums.className = 'h-nums';
      const add = (label, val, cls) => {
        const s = document.createElement('span');
        if (cls) s.className = cls;
        const b = document.createElement('b');
        b.textContent = val;
        s.append(`${label}: `, b);
        nums.append(s);
      };
      add(t('hFiles'), fmtNum(r.files));
      add(t('hSize'), fmtBytes(r.bytes));
      add(t('hOk'), fmtNum(r.uploaded));
      if (r.failed) add(t('hFailed'), fmtNum(r.failed), 'bad');
      if (r.muted) {
        const m = document.createElement('span');
        m.textContent = t('hMuted', { count: fmtNum(r.muted) });
        nums.append(m);
      }
      li.append(top, nums);
      return li;
    }),
  );
}

$('btn-clear-history').addEventListener('click', async () => {
  if (!(await confirmDialog(t('clearHistoryConfirm'), t('clearHistory'), t('cancel')))) return;
  await S.history.clear();
  renderHistory();
});

// ------------------------------------------------------------------ dialogs

function confirmDialog(text, yes, no) {
  const dlg = $('dlg-confirm');
  $('confirm-text').textContent = text;
  $('confirm-yes').textContent = yes || t('yes');
  $('confirm-no').textContent = no || t('cancel');
  dlg.returnValue = 'no';
  dlg.showModal();
  $('confirm-no').focus();
  return new Promise((res) => dlg.addEventListener('close', () => res(dlg.returnValue === 'yes'), { once: true }));
}

// ------------------------------------------------------------------ boot

$('list-more-btn').addEventListener('click', () => {
  listLimit += LIST_PAGE;
  renderNow();
});

function boot() {
  applyI18n();
  store.purgeExpired();
  // GIS is only needed later, to renew the token without leaving the page.
  preloadAuth().catch(() => {});
  const back = completeRedirect();
  if (back?.error) return showLanding(back.error === 'access_denied' ? 'unknown' : back.error);
  // Just returned from Google, or signed in earlier on this browser:
  // go straight to the upload dashboard without asking again.
  if (hasToken()) return enterApp();
  // Signed in before but the 1-hour token expired (e.g. Safari was closed):
  // renew it silently with a quick redirect, no button to press.
  if (!back?.silentFailed && !inAppBrowser && trySilentSignIn(lastHint())) return;
  showLanding();
}
boot();
