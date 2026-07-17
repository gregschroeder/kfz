import { openDB, type DBSchema } from "idb";
import type { PrefixResult } from "./api";

export type LocalQueueItem = {
  id: string;
  prefix: string;
  createdAt: string;
};

interface KfzDb extends DBSchema {
  localQueue: {
    key: string;
    value: LocalQueueItem;
    indexes: { byCreatedAt: string; byPrefix: string };
  };
}

const DB_NAME = "kfz";
const DB_VERSION = 1;

export async function getDb() {
  return openDB<KfzDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("localQueue")) {
        const store = db.createObjectStore("localQueue", { keyPath: "id" });
        store.createIndex("byCreatedAt", "createdAt");
        store.createIndex("byPrefix", "prefix");
      }
    },
  });
}

export async function listLocalQueue(): Promise<LocalQueueItem[]> {
  const db = await getDb();
  const items = await db.getAll("localQueue");
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addLocalQueue(prefix: string): Promise<LocalQueueItem | null> {
  const code = prefix.toUpperCase();
  const db = await getDb();
  const tx = db.transaction("localQueue", "readonly");
  const existing = await tx.store.index("byPrefix").getAll(code);
  if (existing.length > 0) return null;

  const item: LocalQueueItem = {
    id: crypto.randomUUID(),
    prefix: code,
    createdAt: new Date().toISOString(),
  };
  await db.put("localQueue", item);
  return item;
}

export async function removeLocalQueue(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("localQueue", id);
}

export async function clearLocalQueue(): Promise<void> {
  const db = await getDb();
  await db.clear("localQueue");
}

const HISTORY_KEY = "kfz.history";
const HISTORY_LIMIT = 20;

export type HistoryEntry = PrefixResult & { savedAt: string };

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushHistory(result: PrefixResult): HistoryEntry[] {
  const entry: HistoryEntry = { ...result, savedAt: new Date().toISOString() };
  const next = [entry, ...loadHistory().filter((h) => h.code !== result.code)].slice(
    0,
    HISTORY_LIMIT,
  );
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}
