// Google Picker: Google's own Drive browser (folders, subfolders, search,
// shared drives). Picking a folder grants this app access to that folder
// only, which is what lets the app run on the narrow drive.file scope instead
// of reading the user's whole Drive.

import { config } from './config.js';
import { getToken } from './auth.js';

let ready = null;

export function preloadPicker() {
  if (!ready) {
    ready = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://apis.google.com/js/api.js';
      s.async = true;
      s.onload = () => window.gapi.load('picker', { callback: resolve, onerror: reject });
      s.onerror = reject;
      document.head.appendChild(s);
    });
    ready.catch(() => (ready = null));
  }
  return ready;
}

export async function pickFolder({ lang, title }) {
  await preloadPicker();
  const P = window.google.picker;
  return new Promise((resolve) => {
    const folderMime = 'application/vnd.google-apps.folder';
    const mine = new P.DocsView(P.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(folderMime)
      .setOwnedByMe(true);
    const shared = new P.DocsView(P.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(folderMime)
      .setOwnedByMe(false);
    const drives = new P.DocsView(P.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(folderMime)
      .setEnableDrives(true);

    const picker = new P.PickerBuilder()
      .setTitle(title)
      .setLocale(lang)
      .setAppId(config.appId)
      .setDeveloperKey(config.apiKey)
      .setOAuthToken(getToken())
      .setOrigin(location.origin)
      .addView(mine)
      .addView(shared)
      .addView(drives)
      .enableFeature(P.Feature.SUPPORT_DRIVES)
      .setSize(Math.min(1051, innerWidth - 16), Math.min(650, innerHeight - 16))
      .setCallback((data) => {
        const action = data[P.Response.ACTION];
        if (action === P.Action.PICKED) {
          const doc = data[P.Response.DOCUMENTS][0];
          resolve({ id: doc[P.Document.ID], name: doc[P.Document.NAME] });
        } else if (action === P.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
