export type PrefixResult = {
  code: string;
  ursprung: string;
  landkreis: string;
  bundesland: string;
  count: number;
  queried_at: string | null;
  previous_queried_at?: string | null;
};

export type BundeslandStats = {
  bundesland: string;
  total: number;
  count: number;
  percent: number;
};

export type StatsResult = {
  found: number;
  total: number;
  bundeslaender: BundeslandStats[];
};

export type QueueItem = {
  id: string;
  prefix: string;
  source: "watch" | "phone";
  status: string;
  created_at: string;
};

const STORAGE_KEY = "kfz.apiKey";

export function getFunctionsUrl(): string {
  return (
    import.meta.env.VITE_FUNCTIONS_URL ??
    "https://wchzccrcqlxgsftjbpgn.supabase.co/functions/v1"
  );
}

export function getApiKey(): string | null {
  const fromEnv = import.meta.env.VITE_KFZ_API_KEY;
  if (fromEnv) return fromEnv;
  return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function isOnline(): boolean {
  return navigator.onLine;
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const key = getApiKey();
  if (!key) {
    throw new Error("API key not configured");
  }

  const headers = new Headers(init.headers);
  headers.set("x-kfz-key", key);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${getFunctionsUrl()}/${path}`, {
    ...init,
    headers,
  });

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: string }).error)
        : res.statusText;
    throw new Error(msg || `Request failed (${res.status})`);
  }

  return payload as T;
}

export async function fetchPrefixesByBundesland(
  bundesland: string,
): Promise<PrefixResult[]> {
  const data = await apiFetch<{ items: PrefixResult[] }>(
    `kfz-bundesland?bl=${encodeURIComponent(bundesland)}`,
  );
  return data.items ?? [];
}

export async function fetchStats(): Promise<StatsResult> {
  return apiFetch<StatsResult>("kfz-stats");
}

export async function searchPrefixes(query: string): Promise<PrefixResult[]> {
  const q = normalizePrefix(query);
  if (!q) return [];
  const data = await apiFetch<{ items: PrefixResult[] }>(
    `kfz-search?q=${encodeURIComponent(q)}`,
  );
  return data.items ?? [];
}

export async function lookupPrefix(prefix: string): Promise<PrefixResult> {
  const data = await apiFetch<{ result: PrefixResult }>("kfz-lookup", {
    method: "POST",
    body: JSON.stringify({ prefix: normalizePrefix(prefix) }),
  });
  return data.result;
}

export async function capturePrefix(prefix: string): Promise<void> {
  await apiFetch("kfz-capture", {
    method: "POST",
    body: JSON.stringify({
      prefix: normalizePrefix(prefix),
      source: "phone",
    }),
  });
}

export async function fetchQueue(): Promise<QueueItem[]> {
  const data = await apiFetch<{ items: QueueItem[] }>("kfz-queue");
  return data.items ?? [];
}

export async function processQueueItem(queueId: string): Promise<PrefixResult> {
  const data = await apiFetch<{ result: PrefixResult }>("kfz-process", {
    method: "POST",
    body: JSON.stringify({ queue_id: queueId }),
  });
  return data.result;
}

export async function deleteQueueItem(queueId: string): Promise<void> {
  await apiFetch("kfz-delete", {
    method: "POST",
    body: JSON.stringify({ queue_id: queueId }),
  });
}

export function normalizePrefix(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}
