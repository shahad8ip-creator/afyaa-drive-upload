// Upload history lives in the user's own Drive "appDataFolder": a hidden
// folder that only this app can read, inside that user's account. There is no
// shared database, so one user's history can't be reached by anyone else.

const NAME = 'upload-history.json';
const MAX = 300;

export function createHistory(drive) {
  let fileId = null;
  let records = null;
  let writing = Promise.resolve();

  async function load() {
    const { id, data } = await drive.readAppData(NAME);
    fileId = id;
    records = Array.isArray(data?.records) ? data.records : [];
    return records;
  }

  function save(record) {
    writing = writing
      .then(async () => {
        if (!records) await load();
        records = [record, ...records.filter((r) => r.id !== record.id)].slice(0, MAX);
        const r = await drive.writeAppData(NAME, fileId, { version: 1, records });
        fileId = fileId || r?.id || null;
      })
      .catch(() => {});
    return writing;
  }

  function clear() {
    writing = writing
      .then(async () => {
        records = [];
        if (!fileId) await load().catch(() => {});
        const r = await drive.writeAppData(NAME, fileId, { version: 1, records: [] });
        fileId = fileId || r?.id || null;
      })
      .catch(() => {});
    return writing;
  }

  return { load, save, clear, get records() { return records; } };
}
