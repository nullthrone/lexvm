/**
 * Tiny key-value storage: IndexedDB, falling back to localStorage, falling
 * back to memory. Every call is wrapped in try/catch and never throws, so the
 * app keeps working with storage disabled (private mode, file://, quotas).
 */

export type StoreName = "saves" | "packs";
export type StorageKind = "indexeddb" | "localstorage" | "memory";

interface Backend {
  kind: StorageKind;
  get(store: StoreName, key: string): Promise<unknown>;
  set(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  keys(store: StoreName): Promise<string[]>;
}

const DB_NAME = "lexvm";
const DB_VERSION = 1;
const STORES: readonly StoreName[] = ["saves", "packs"];

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDatabase(timeoutMs = 4000): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("IndexedDB open timed out")), timeoutMs);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const store of STORES) {
          if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
        }
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        resolve(req.result);
      };
      req.onerror = () => {
        clearTimeout(timer);
        reject(req.error);
      };
      req.onblocked = () => {
        clearTimeout(timer);
        reject(new Error("IndexedDB blocked"));
      };
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

async function indexedDbBackend(): Promise<Backend> {
  const db = await openDatabase();
  const tx = (store: StoreName, mode: IDBTransactionMode) => db.transaction(store, mode).objectStore(store);
  const done = (store: IDBObjectStore) =>
    new Promise<void>((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.transaction.onabort = () => reject(store.transaction.error);
    });
  return {
    kind: "indexeddb",
    get: (store, key) => request(tx(store, "readonly").get(key)),
    async set(store, key, value) {
      const os = tx(store, "readwrite");
      os.put(value, key);
      await done(os);
    },
    async delete(store, key) {
      const os = tx(store, "readwrite");
      os.delete(key);
      await done(os);
    },
    async keys(store) {
      const keys = await request(tx(store, "readonly").getAllKeys());
      return keys.filter((k): k is string => typeof k === "string");
    },
  };
}

function localStorageBackend(): Backend {
  const ls = window.localStorage;
  const probe = "lexvm:probe";
  ls.setItem(probe, "1");
  ls.removeItem(probe);
  const prefix = (store: StoreName) => `lexvm:${store}:`;
  return {
    kind: "localstorage",
    async get(store, key) {
      const raw = ls.getItem(prefix(store) + key);
      return raw === null ? undefined : JSON.parse(raw);
    },
    async set(store, key, value) {
      ls.setItem(prefix(store) + key, JSON.stringify(value));
    },
    async delete(store, key) {
      ls.removeItem(prefix(store) + key);
    },
    async keys(store) {
      const out: string[] = [];
      for (let i = 0; i < ls.length; i += 1) {
        const k = ls.key(i);
        if (k?.startsWith(prefix(store))) out.push(k.slice(prefix(store).length));
      }
      return out;
    },
  };
}

function memoryBackend(): Backend {
  const data = new Map<string, unknown>();
  const k = (store: StoreName, key: string) => `${store}\u0000${key}`;
  return {
    kind: "memory",
    get: async (store, key) => structuredClone(data.get(k(store, key))),
    async set(store, key, value) {
      data.set(k(store, key), structuredClone(value));
    },
    async delete(store, key) {
      data.delete(k(store, key));
    },
    async keys(store) {
      const prefix = `${store}\u0000`;
      return [...data.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
    },
  };
}

let backendPromise: Promise<Backend> | null = null;

function backend(): Promise<Backend> {
  backendPromise ??= (async () => {
    try {
      if (typeof indexedDB !== "undefined") return await indexedDbBackend();
    } catch (error) {
      console.warn("LexVM: IndexedDB unavailable, falling back to localStorage", error);
    }
    try {
      return localStorageBackend();
    } catch (error) {
      console.warn("LexVM: localStorage unavailable, saves will not persist", error);
    }
    return memoryBackend();
  })();
  return backendPromise;
}

export async function storageKind(): Promise<StorageKind> {
  return (await backend()).kind;
}

export async function kvGet(store: StoreName, key: string): Promise<unknown> {
  try {
    return await (await backend()).get(store, key);
  } catch (error) {
    console.warn("LexVM: storage read failed", error);
    return undefined;
  }
}

/** Returns false if the value could not be stored. */
export async function kvSet(store: StoreName, key: string, value: unknown): Promise<boolean> {
  try {
    await (await backend()).set(store, key, value);
    return true;
  } catch (error) {
    console.warn("LexVM: storage write failed", error);
    return false;
  }
}

export async function kvDelete(store: StoreName, key: string): Promise<boolean> {
  try {
    await (await backend()).delete(store, key);
    return true;
  } catch (error) {
    console.warn("LexVM: storage delete failed", error);
    return false;
  }
}

export async function kvKeys(store: StoreName): Promise<string[]> {
  try {
    return await (await backend()).keys(store);
  } catch (error) {
    console.warn("LexVM: storage listing failed", error);
    return [];
  }
}

/** localStorage access for small preferences. Never throws. */
export const prefs = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage disabled: preferences simply do not persist.
    }
  },
};
