// Deployment configuration. Values come from Vite env vars (see .env.example)
// so nothing secret lives in the repository. None of these are secrets in the
// cryptographic sense: an OAuth *client ID* and a browser API key are public by
// design and are locked down in Google Cloud Console (authorised origins + API
// key HTTP-referrer restrictions). There is no client secret in this app.

const env = import.meta.env;

export const config = {
  clientId: env.VITE_GOOGLE_CLIENT_ID || '',
  apiKey: env.VITE_GOOGLE_API_KEY || '',
  // Google Cloud *project number* — required by the Picker so that a folder the
  // user picks is granted to this app under the narrow drive.file scope.
  appId: env.VITE_GOOGLE_APP_ID || '',

  // Minimum scopes:
  //  drive.file    – only files/folders this app creates or the user picks.
  //  drive.appdata – a hidden, per-user app folder for the upload history.
  // No access to the rest of the user's Drive, no Gmail, no profile scopes.
  scopes: [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.appdata',
  ].join(' '),
};

export const isDemo =
  !config.clientId ||
  (new URLSearchParams(location.search).has('demo') &&
    ['localhost', '127.0.0.1'].includes(location.hostname));

const coarse = matchMedia('(pointer: coarse)').matches;
const conn = navigator.connection || {};
const slowNet = conn.saveData || ['slow-2g', '2g', '3g'].includes(conn.effectiveType);

export const tuning = {
  // Parallel upload slots. Small files count as half a slot.
  concurrency: slowNet ? 2 : coarse ? 3 : 4,
  // Files up to this size go up in one multipart request (1 round-trip).
  multipartMax: 5 * 1024 * 1024,
  // Resumable chunk sizes must be multiples of 256 KiB. Chunks grow on fast
  // links and shrink on slow ones between these bounds.
  chunkStart: (coarse ? 8 : 16) * 1024 * 1024,
  chunkMin: 4 * 1024 * 1024,
  chunkMax: 128 * 1024 * 1024,
  // Largest video we try to mute inside the browser. Muting keeps the result in
  // memory until it is uploaded, so phones get a lower ceiling.
  muteMaxBytes: (coarse ? 450 : 1536) * 1024 * 1024,
  // Combined size of muted videos allowed to wait in memory at once.
  muteMemoryBudget: (coarse ? 500 : 2048) * 1024 * 1024,
  maxNetworkRetries: 12,
  maxServerRetries: 8,
};
