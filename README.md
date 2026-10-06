# Drive File Upload Initiative
**مبادرة رفع ملفات درايف مقدمة من جمعية أفياء النسائية بمنطقة عسير**

A free web app that uploads large numbers of photos, videos and other files **directly from the user's device to their own Google Drive**. Users can also choose to remove the sound from videos before uploading. That processing happens on the device too.

---

## Architecture

```
 User's browser ──(Google OAuth, token in memory)──▶ accounts.google.com
       │
       ├──(optional) FFmpeg.wasm on the device: remove audio, copy video stream
       │
       └──(resumable chunked HTTPS uploads)──────────▶ www.googleapis.com (user's own Drive)
```

- **No backend.** The site is a set of static files (HTML/JS/CSS + the FFmpeg WebAssembly engine). It can be hosted for free on Cloudflare Pages, Netlify, Firebase Hosting or GitHub Pages.
- **No server receives, stores or forwards any file, token or user data.** File bytes go from the browser to Google only.
- **Google Drive is the only storage.** Uploaded files belong to the user's Drive. They stay there if this website ever goes offline, and the app never deletes them.
- **User isolation is built into the design.** There is no shared database, so no request can ever return another user's data. Each browser holds only its own short-lived Google token. Upload history is stored in the user's own Drive (`appDataFolder`, a hidden folder that only this app can read in that user's account).

### Minimum permissions
| Scope | Why |
|---|---|
| `drive.file` | Lets the app work only on files it creates and folders the user picks. It **cannot see the rest of the user's Drive.** |
| `drive.appdata` | A hidden, app-only folder that holds the user's private upload history. |

Both scopes are in Google's "recommended / non-sensitive" category, so the app needs no paid security assessment. The app does not ask for Gmail, contacts or profile scopes. It reads the user's name and email from Drive's `about` endpoint.

Folders are browsed with the official **Google Picker**, which supports My Drive, folders shared with the user, shared drives, subfolders and search. Picking a folder grants the app access to that folder only.

### Upload engine (`src/uploader.js`)
- Files of 5 MB or less are sent with a single multipart request. Larger files use **Drive resumable sessions**.
- **Chunked uploads.** Chunks start at 16 MB on desktop and 8 MB on mobile, then adapt between 4 MB and 128 MB to the measured speed.
- **Controlled concurrency.** Desktop runs 4 slots, mobile 3, and slow or data-saver connections 2. Small files count as half a slot.
- **Only the missing part is re-sent.** After any failure the app asks Drive how many bytes it already has (`Content-Range: bytes */N`) and continues from that point.
- **Retries with exponential backoff and jitter** for network, rate-limit (403/429) and 5xx errors. Permission and quota errors stop the queue and show a clear message instead of retrying forever.
- **Offline handling.** Uploads pause when the connection drops. The app probes until Drive answers again, then resumes automatically (or waits for the user, depending on the setting). A dropped connection never marks files as failed.
- **Surviving a page refresh.** Resumable session URIs and "already finished" markers are kept in IndexedDB, scoped to the account and expiring after 7 days. If the user selects the same files again, finished files are skipped and partial files continue where they stopped. File contents are never stored.
- **Token renewal.** Google tokens last about 1 hour. The app renews the token when the user clicks Start and again quietly before it expires. If the browser needs a tap to renew, uploads pause with a "Continue" button rather than failing.
- **Wake Lock** keeps phone screens awake during uploads. The browser warns before the user leaves the page mid-upload.
- **Duplicate names.** The user chooses *new copy*, *replace* or *skip* for each file. Replace uploads a **new revision** of the existing file, and Drive keeps the previous version in its version history. Replace asks for a second confirmation and is only offered for files the app is allowed to edit.

### Video muting (`src/mute.js`)
- Uses FFmpeg compiled to WebAssembly, **served from this site's own origin** (no CDN).
- Runs `-map 0:v -c copy -an`: the video stream is **copied bit for bit**. Nothing is re-encoded, so resolution, frame rate and quality stay exactly as they were. Only the audio track is dropped.
- The input is read lazily from disk (WORKERFS). Only the muted output is held in memory until it is uploaded.
- **Limits.** Videos over 1.5 GB on desktop or 450 MB on phones are too big to process in browser memory. For those, the user is asked to *upload them with sound* or *skip them*. A video is never sent to an outside service for processing.
- If a format can't be stream-copied, that file shows "We couldn't remove the sound" with an *Upload with sound* option.

---

## Setup (about 15 minutes)

### 1. Google Cloud project
1. Open <https://console.cloud.google.com/>, create a project, and note its **Project number** (shown on the dashboard).
2. **APIs & Services → Library**: enable **Google Drive API** and **Google Picker API**.
3. **OAuth consent screen** (Google Auth Platform):
   - User type: **External**.
   - App name: *Drive File Upload Initiative*. Add the logo, support email, and links to your privacy policy and home page.
   - Scopes: add `.../auth/drive.file` and `.../auth/drive.appdata` only.
   - While the app is in **Testing** status, only listed test users can sign in. **Publish** it for everyone. Because both scopes are non-sensitive, verification is light (brand verification only).
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorised JavaScript origins: `https://your-domain.example` (plus `http://localhost:5173` for development).
   - No redirect URIs are needed, and the app does not use a client secret.
5. **Credentials → Create credentials → API key** (used by the Picker):
   - Restrict it to **HTTP referrers**: `https://your-domain.example/*` (and `http://localhost:5173/*`).
   - API restrictions: **Google Picker API** only.

### 2. Configure and build
```bash
npm install
```
```bash
cp .env.example .env.local
```
Fill in `.env.local`:
```
VITE_GOOGLE_CLIENT_ID=1234567890-xxxx.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIza...
VITE_GOOGLE_APP_ID=1234567890      # the project NUMBER
```
```bash
npm run dev
```
```bash
npm run build
```
`npm run build` writes the deployable site to `dist/`.

With no client ID configured, the app runs in **demo mode**. Sign-in and Drive are simulated, including random server errors and a "simulate connection loss" switch under *Advanced*, so the full interface can be tried without a Google account.

### 3. Deploy (free)
Deploy the `dist/` folder to any static host with HTTPS:
- **Cloudflare Pages** or **Netlify**: build command `npm run build`, output `dist`. The security headers in `public/_headers` (CSP, HSTS, COOP, nosniff, Permissions-Policy) are applied automatically.
- **Firebase Hosting / others**: copy the headers from `public/_headers` into that host's config.

Add the final domain to the OAuth client's authorised origins and to the API key's referrer list.

---

## Security checklist
- Official Google OAuth (Google Identity Services). The app never asks for or sees a password.
- The access token is kept **in memory only**: no localStorage, no cookies, no server. It is gone when the tab closes.
- **Sign out** discards the token and the remembered email. **Disconnect** also revokes the app's grant in the Google account and clears this device's resume data.
- Strict Content-Security-Policy. Scripts load only from this site and Google. `frame-ancestors 'none'`.
- No analytics, no third-party trackers, and no logging of file names anywhere outside the user's own screen.
- File names shown in the UI are inserted as text, never as HTML.
- Nothing is permanent on the hosting server, which serves static files only. Muted videos exist only in the browser's memory until they are uploaded, then they are released.

## Project layout
```
index.html          markup for landing, dashboard, history and dialogs
src/config.js       env config, scopes, performance tuning
src/auth.js         Google Identity Services token flow (memory-only token)
src/drive.js        Drive REST: resumable/multipart uploads, folders, appData
src/uploader.js     queue, concurrency, retries, offline, pause/cancel
src/mute.js         on-device audio removal with FFmpeg.wasm
src/picker.js       Google Picker folder selection
src/history.js      per-user history in Drive appDataFolder
src/store.js        per-account IndexedDB resume records (7-day expiry)
src/mock.js         demo-mode Drive simulator
src/i18n.js         Arabic (default) and English strings
src/styles.css      Afyaa palette, mobile-first layout
public/_headers     security headers for the static host
```

## Testing

**Already verified (demo mode, Chrome, mobile and desktop sizes):**
- Mixed batches of images, videos, PDFs and presentations.
- Concurrent upload slots and chunked uploads.
- Simulated server errors with automatic retry.
- Simulated connection loss: uploads pause, show the message, resume on their own and finish with nothing uploaded twice.
- The duplicate-name dialog.
- The "couldn't mute → upload with sound" path.
- Upload history, and switching between Arabic and English.
- On-device muting on a real H.264/AAC video: the output has the identical video stream (same codec, resolution, frame rate and bitrate) and no audio track.
- The production build loads the FFmpeg worker correctly.

**To do with real Google credentials before launch:**
- [ ] Two different Google accounts in two browsers at the same time, each with its own folder. Confirm neither can see the other's folders, history or progress.
- [ ] Hundreds of photos in one batch, and several multi-GB videos.
- [ ] Turn Wi-Fi off mid-upload, then back on, and confirm uploads resume.
- [ ] Refresh mid-upload, re-select the same files, and confirm finished files are skipped and partial ones continue.
- [ ] Duplicate names: new copy, replace (check Drive's version history) and skip.
- [ ] A folder you can only view (shared as Viewer) shows the permission message.
- [ ] A shared drive folder.
- [ ] Safari on iPhone, Chrome on Android, Safari/Chrome/Edge on macOS and Windows.
- [ ] Mute .mp4, .mov (iPhone) and .webm videos and check the results in Drive.
- [ ] A session longer than 1 hour (token renewal).

## Known platform limits
- **iPhone/iPad.** iOS may convert videos to a more compatible format when they are picked from Photos (*Settings → Photos → Transfer to Mac or PC*, or "Most Compatible" in the picker). Choosing a whole folder is not available on iOS or Android browsers. Uploads stop if the user switches apps for a long time, because iOS suspends background tabs. Wake Lock helps while the page stays open.
- **Duplicate detection** uses the `drive.file` scope, so it can see files this app uploaded plus the folders the user picked. It cannot see files that were put in the folder by other means. This is the trade-off for not asking to read the whole Drive. Duplicates are never overwritten without the user's explicit choice in any case.
