// Google Identity Services (official OAuth 2.0 token flow for browsers).
// The user signs in on Google's own page; this app never sees a password.
// The short-lived access token lives only in memory — never in localStorage,
// cookies or any server — and disappears when the tab closes.

import { config, isDemo } from './config.js';

let token = null;
let expiresAt = 0;
let client = null;
let pending = null;
let gisReady = null;

const SCOPE_LIST = config.scopes.split(' ');

export function getToken() {
  return token;
}

export function hasToken() {
  return !!token && Date.now() < expiresAt;
}

export function msLeft() {
  return token ? expiresAt - Date.now() : 0;
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

// Preload GIS so the sign-in click can open Google's window synchronously
// (browsers only allow pop-ups opened directly from a user gesture).
export function preloadAuth() {
  if (isDemo) return Promise.resolve();
  if (!gisReady) {
    gisReady = loadScript('https://accounts.google.com/gsi/client').then(() => {
      client = google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: config.scopes,
        include_granted_scopes: false,
        callback: (resp) => settle(resp),
        error_callback: (err) => settle({ error: err?.type || 'unknown' }),
      });
    });
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
  token = resp.access_token;
  expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
  p.resolve(token);
}

/**
 * Must be called synchronously from a click/tap handler.
 * prompt: '' re-uses an existing grant (no consent screen when possible),
 * 'select_account' lets the user choose a different Google account.
 */
export function requestToken({ prompt = '', hint } = {}) {
  if (isDemo) {
    token = 'demo-token';
    expiresAt = Date.now() + 3600 * 1000;
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
}

// Fully removes this app's grant from the user's Google account.
export function revokeAccess() {
  return new Promise((resolve) => {
    if (isDemo || !token || !window.google?.accounts?.oauth2) {
      signOutLocal();
      return resolve();
    }
    google.accounts.oauth2.revoke(token, () => {
      signOutLocal();
      resolve();
    });
  });
}
