/**
 * Shared IndexedDB bootstrap (v5: "projects" + "templates" + "music" +
 * "logos" + "drafts" stores). Single opener for the whole app — store
 * modules can never race each other's DB versions, and existing data
 * survives the upgrade.
 */

const DB_NAME = "frame-db";
const DB_VERSION = 5;

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("templates")) {
        db.createObjectStore("templates", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("music")) {
        db.createObjectStore("music", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("logos")) {
        db.createObjectStore("logos", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open storage."));
  });
}

/** Run one request against one store; resolves when the transaction commits. */
export function runTx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = () => {
          db.close();
          reject(req.error ?? new Error("Storage request failed."));
        };
        t.onabort = () => {
          db.close();
          reject(req.error ?? new Error("Storage request aborted."));
        };
      }),
  );
}
