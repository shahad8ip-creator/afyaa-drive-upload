// Google OAuth 2.0 for a browser-only app (no backend, no client secret).
//
// Sign-in uses a full-page redirect to Google and back. Unlike a pop-up, a
// redirect works the same on desktop, iPhone/iPad Safari, Android Chrome and
// installed web apps: Google always returns the user to this exact page
// (origin + path, computed at runtime, so development and production each use
// their own address) and the app opens the upload dashboard straight away.
//
// In-session renewals (tokens last ~1 hour) use Google Identity Services in a
// small pop-up instead, because a redirect would reload the page and lose the
// files the user selected. Uploads already in progress don't need renewing:
// a resumable upload session authorises itself (see drive.js).
//
// The short-lived access token is kept in sessionStorage: it survives a page
// refresh or a visit to the privacy page in the same tab, and is erased when
// the tab is closed. It never goes to localStorage, cookies or any server.

import { config, isDemo } from './config.js';

const KEY = 'afyaa:auth';
const FLOW = 'afyaa:oauth-flow';
const SCOPE_LIST = config.scopes.split(' ');

let token = null;
let expiresAt = 0;
let client = null;
let pending = null;
let gisReady = null;

function readSession(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function writeSession(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function setToken(value, expiresInSec) {
  token = value;
  expiresAt = Date.now() + (Number(expiresInSec) || 3600) * 1000;
  writeSession(KEY, { token, expiresAt });
}

// Restore a token saved earlier in this tab (page refresh, back from the
// privacy page). Expired or nearly-expired tokens are discarded.
(() => {
  const saved = readSession(KEY);
  if (saved?.token && saved.expiresAt - Date.now() > 2 * 60000) {
    token = saved.token;
    expiresAt = saved.expiresAt;
  } else if (saved) writeSession(KEY, null);
})();

export function getToken() {
  return token;
}

export function hasToken() {
  return !!token && Date.now() < expiresAt;
}

export function msLeft() {
  return token ? expiresAt - Date.now() : 0;
}

// The address Google sends the user back to. It must be listed under
// "Authorised redirect URIs" in Google Cloud Console (see README).
export function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

function randomState() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sends the user to Google's sign-in page. Google returns them to this page
 * with the token in the URL fragment, which completeRedirect() picks up.
 * prompt: '' re-uses an existing grant, 'select_account' lets the user choose
 * a different Google account.
 */
export function signInWithRedirect({ prompt = '', hint } = {}) {
  if (isDemo) return requestToken();
  const state = randomState();
  const route = location.hash && !/access_token|error=/.test(location.hash) ? location.hash : '';
  writeSession(FLOW, { state, route, at: Date.now() });
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: config.scopes,
    include_granted_scopes: 'true',
    state,
  });
  if (prompt) params.set('prompt', prompt);
  if (hint) params.set('login_hint', hint);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  return new Promise(() => {}); // the page is navigating away
}

/**
 * Call once at start-up. If this page load is Google returning from sign-in,
 * stores the token, removes it from the address bar and history, and reports
 * the result: { ok: true } | { error: code } | null (not a sign-in return).
 */
export function completeRedirect() {
  const hash = location.hash.slice(1);
  if (!/(^|&)(access_token|error)=/.test(hash)) return null;
  const p = new URLSearchParams(hash);
  const flow = readSession(FLOW);
  writeSession(FLOW, null);
  // Clean the URL first so the token never stays in the address bar or history.
  history.replaceState(null, '', location.pathname + location.search + (flow?.route || ''));

  // The state must match the one this tab created, so a token planted by
  // another site can't sign the user into someone else's account.
  if (!flow || p.get('state') !== flow.state) return { error: 'state' };
  if (p.get('error')) return { error: p.get('error') === 'access_denied' ? 'access_denied' : 'unknown' };
  const granted = (p.get('scope') || '').split(' ');
  if (!SCOPE_LIST.every((s) => granted.includes(s))) return { error: 'scope' };
  setToken(p.get('access_token'), p.get('expires_in'));
  return { ok: true };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// Preloads GIS so a "Continue" click during uploads can open Google's window
// synchronously (browsers only allow pop-ups opened directly from a tap/click).
export function preloadAuth() {
  if (isDemo) return Promise.resolve();
  if (!gisReady) {
    gisReady = loadScript('https://accounts.google.com/gsi/client').then(() => {
      client = google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: config.scopes,
        include_granted_scopes: true,
        callback: (resp) => settle(resp),
        error_callback: (err) => settle({ error: err?.type || 'unknown' }),
      });
    });
    gisReady.catch(() => (gisReady = null));
  }
  return gisReady;
}

function settle(resp) {
  const p = pending;
  pending = null;
  if (!p) return;
  clearTimeout(p.timer);
  if (resp.error) return p.reject(Object.assign(new Error(resp.error), { code: resp.error }));
  if (!google.accounts.oauth2.hasGrantedAllScopes(resp, ...SCOPE_LIST)) {
    return p.reject(Object.assign(new Error('scope'), { code: 'scope' }));
  }
  setToken(resp.access_token, resp.expires_in);
  p.resolve(token);
}

/**
 * Renews the token without leaving the page (pop-up). Must be called
 * synchronously from a click/tap handler.
 */
export function requestToken({ prompt = '', hint } = {}) {
  if (isDemo) {
    setToken('demo-token', 3600);
    return Promise.resolve(token);
  }
  if (!client) return Promise.reject(Object.assign(new Error('not_ready'), { code: 'not_ready' }));
  if (pending) pending.reject(Object.assign(new Error('superseded'), { code: 'superseded' }));
  return new Promise((resolve, reject) => {
    pending = {
      resolve,
      reject,
      // If the user abandons Google's window without an event, don't hang forever.
      timer: setTimeout(() => settle({ error: 'timeout' }), 5 * 60 * 1000),
    };
    client.requestAccessToken({ prompt, login_hint: hint || undefined });
  });
}

export function signOutLocal() {
  token = null;
  expiresAt = 0;
  writeSession(KEY, null);
}

// Fully removes this app's grant from the user's Google account.
export function revokeAccess() {
  return new Promise((resolve) => {
    if (isDemo || !token) {
      signOutLocal();
      return resolve();
    }
    if (!window.google?.accounts?.oauth2) {
      const body = new URLSearchParams({ token });
      signOutLocal();
      return fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body }).catch(() => {}).then(() => resolve());
    }
    google.accounts.oauth2.revoke(token, () => {
      signOutLocal();
      resolve();
    });
  });
}
