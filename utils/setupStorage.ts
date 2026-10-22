// Keeps the setup in progress (including the uploaded files) in this browser's IndexedDB, so a refresh of the
// setup page does not lose it. Everything fails silently: without storage the setup simply isn't restored.
const DB_NAME = "prosim-setup";
const STORE = "setup";
const KEY = "current";

export type StoredSetup = {
    data: unknown;
    csvData: unknown;
};

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available"));
        return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> => {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const request = action(db.transaction(STORE, mode).objectStore(STORE));
            request.onsuccess = () => resolve(request.result as T);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
};

export const saveSetup = (setup: StoredSetup) => run<void>("readwrite", store => store.put(setup, KEY));

export const loadSetup = () => run<StoredSetup | undefined>("readonly", store => store.get(KEY));

export const clearSetup = () => run<void>("readwrite", store => store.delete(KEY));
