import {
  capturePrefix,
  deleteQueueItem,
  fetchQueue,
  fetchStats,
  getApiKey,
  isOnline,
  lookupPrefix,
  normalizePrefix,
  processQueueItem,
  searchPrefixes,
  setApiKey,
  type PrefixResult,
  type QueueItem,
} from "./api";
import {
  addLocalQueue,
  listLocalQueue,
  loadHistory,
  pushHistory,
  removeLocalQueue,
  type HistoryEntry,
  type LocalQueueItem,
} from "./db";
import { formatCount, formatHerleitung, formatProgress, formatQueriedAt } from "./format";
import { speechSupported, startPrefixListen, type SpeechSession } from "./speech";
import "./main.css";

type PendingItem =
  | { kind: "server"; id: string; prefix: string }
  | { kind: "local"; id: string; prefix: string };

const els = {
  setupModal: document.getElementById("setup-modal")!,
  setupForm: document.getElementById("setup-form") as HTMLFormElement,
  setupKey: document.getElementById("setup-key") as HTMLInputElement,
  app: document.getElementById("app")!,
  form: document.getElementById("lookup-form") as HTMLFormElement,
  input: document.getElementById("prefix-input") as HTMLInputElement,
  searchBtn: document.getElementById("search-btn") as HTMLButtonElement,
  micBtn: document.getElementById("mic-btn") as HTMLButtonElement,
  message: document.getElementById("message")!,
  searchResults: document.getElementById("search-results")!,
  result: document.getElementById("result")!,
  history: document.getElementById("history")!,
  queueModal: document.getElementById("queue-modal")!,
  queueTitle: document.getElementById("queue-title")!,
  queuePrefix: document.getElementById("queue-prefix")!,
  queueLookup: document.getElementById("queue-lookup") as HTMLButtonElement,
  queueDelete: document.getElementById("queue-delete") as HTMLButtonElement,
  queueLater: document.getElementById("queue-later") as HTMLButtonElement,
  toast: document.getElementById("toast")!,
  onlineBadge: document.getElementById("online-badge")!,
  progress: document.getElementById("progress")!,
};

let pendingQueue: PendingItem[] = [];
let queueIndex = 0;
let queueDeferred = false;
let toastTimer: number | undefined;
let listenSession: SpeechSession | null = null;
let focusHandlersRegistered = false;

function canFocusInput(): boolean {
  return !els.app.hidden && els.queueModal.hidden && els.setupModal.hidden;
}

function focusInput(): void {
  if (!canFocusInput()) return;

  const tryFocus = () => {
    if (!canFocusInput()) return;
    els.input.focus({ preventScroll: true });
  };

  tryFocus();
  requestAnimationFrame(() => {
    tryFocus();
    requestAnimationFrame(tryFocus);
  });
  window.setTimeout(tryFocus, 0);
  window.setTimeout(tryFocus, 100);
}

function registerInputFocusHandlers(): void {
  if (focusHandlersRegistered) return;
  focusHandlersRegistered = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      focusInput();
    }
  });

  window.addEventListener("pageshow", () => {
    focusInput();
  });
}

function setListening(active: boolean): void {
  els.micBtn.classList.toggle("listening", active);
  els.micBtn.setAttribute(
    "aria-label",
    active ? "Stop listening" : "Speak prefix",
  );
  els.micBtn.setAttribute("aria-pressed", active ? "true" : "false");
}

function normalizeHeardPrefix(raw: string): string {
  return normalizePrefix(raw).slice(0, 3);
}

async function handleListenResult(session: SpeechSession): Promise<void> {
  try {
    const heard = await session.result;
    const prefix = normalizeHeardPrefix(heard);
    els.input.value = prefix;
    if (!prefix) {
      showToast("No speech heard");
    }
    focusInput();
    els.input.select();
  } catch (error) {
    const prefix = normalizeHeardPrefix(els.input.value);
    if (!prefix) {
      showToast(error instanceof Error ? error.message : "Mic failed");
    }
    focusInput();
    if (prefix) {
      els.input.select();
    }
  } finally {
    listenSession = null;
    setListening(false);
  }
}

function startListenSession(): void {
  const session = startPrefixListen((heard) => {
    els.input.value = normalizeHeardPrefix(heard);
  });
  listenSession = session;
  setListening(true);
  showToast("Say prefix — tap mic when done", 3000);
  void handleListenResult(session);
}

function showMessage(text: string): void {
  els.message.textContent = text;
  els.message.hidden = false;
}

function clearMessage(): void {
  els.message.hidden = true;
  els.message.textContent = "";
}

function hideSearchResults(): void {
  els.searchResults.hidden = true;
  els.searchResults.innerHTML = "";
}

function showToast(message: string, ms = 2200): void {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, ms);
}

function updateOnlineBadge(): void {
  const online = isOnline();
  els.onlineBadge.dataset.state = online ? "online" : "offline";
  els.onlineBadge.setAttribute("aria-label", online ? "Online" : "Offline");
}

function renderProgress(found: number, total: number): void {
  els.progress.textContent = formatProgress(found, total);
}

async function refreshProgress(): Promise<void> {
  if (!isOnline()) {
    els.progress.textContent = "—";
    return;
  }
  try {
    const stats = await fetchStats();
    renderProgress(stats.found, stats.total);
  } catch {
    els.progress.textContent = "—";
  }
}

function formatHistoryMeta(entry: HistoryEntry): string {
  const parts = [`${formatHerleitung(entry.ursprung)} · ${entry.count}×`];
  const previous = formatQueriedAt(entry.previous_queried_at);
  if (previous) {
    parts.push(`zuvor ${previous}`);
  }
  return parts.join(" · ");
}

function renderResult(result: PrefixResult): void {
  clearMessage();
  hideSearchResults();
  els.result.hidden = false;

  const queried = formatQueriedAt(result.queried_at);
  const countLine = queried
    ? `[${formatCount(result.count)}] · ${escapeHtml(queried)}`
    : `[${formatCount(result.count)}]`;

  els.result.innerHTML = `
    <p class="result-count">${countLine}</p>
    <p class="result-code">${escapeHtml(result.code)}: ${escapeHtml(formatHerleitung(result.ursprung))}</p>
    <p class="result-line">${escapeHtml(result.landkreis)}</p>
    <p class="result-line">${escapeHtml(result.bundesland)}</p>
  `;
}

function renderHistory(entries: HistoryEntry[]): void {
  if (entries.length === 0) {
    els.history.innerHTML = `<p class="muted">Recent lookups appear here.</p>`;
    return;
  }
  els.history.innerHTML = `
    <h2 class="section-title">Recent</h2>
    <ul class="history-list">
      ${entries
        .map(
          (h) => `
        <li>
          <button type="button" class="history-item" data-prefix="${escapeHtml(h.code)}">
            <span class="history-code">${escapeHtml(h.code)}</span>
            <span class="history-meta">${escapeHtml(formatHistoryMeta(h))}</span>
          </button>
        </li>`,
        )
        .join("")}
    </ul>
  `;

  els.history.querySelectorAll<HTMLButtonElement>(".history-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prefix = btn.dataset.prefix ?? "";
      els.input.value = prefix;
      void submitLookup(prefix);
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderSearchResults(items: PrefixResult[], query: string): void {
  if (items.length === 0) {
    hideSearchResults();
    showMessage(`No prefixes starting with “${query}”`);
    return;
  }

  clearMessage();
  els.searchResults.hidden = false;
  els.searchResults.innerHTML = `
    <h2 class="section-title">${items.length} match${items.length === 1 ? "" : "es"} for “${escapeHtml(query)}”</h2>
    <ul class="history-list">
      ${items
        .map(
          (item) => `
        <li>
          <button type="button" class="history-item search-item" data-prefix="${escapeHtml(item.code)}">
            <span class="search-item-line"><span class="search-prefix">${escapeHtml(item.code)}</span>: ${escapeHtml(formatHerleitung(item.ursprung))} · ${escapeHtml(item.landkreis)} · ${escapeHtml(item.bundesland)}</span>
          </button>
        </li>`,
        )
        .join("")}
    </ul>
  `;

  els.searchResults.querySelectorAll<HTMLButtonElement>(".search-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      els.input.value = btn.dataset.prefix ?? "";
      hideSearchResults();
      focusInput();
    });
  });
}

async function runSearch(): Promise<void> {
  const query = normalizePrefix(els.input.value);
  if (!query) {
    showMessage("Enter letters to search");
    hideSearchResults();
    focusInput();
    return;
  }

  els.input.value = query;

  if (!isOnline()) {
    showMessage("Search requires an internet connection");
    hideSearchResults();
    els.input.value = "";
    focusInput();
    return;
  }

  try {
    const items = await searchPrefixes(query);
    renderSearchResults(items, query);
  } catch (error) {
    hideSearchResults();
    showMessage(error instanceof Error ? error.message : "Search failed");
  }

  els.input.value = "";
  focusInput();
}

async function submitLookup(rawPrefix: string): Promise<void> {
  const prefix = normalizePrefix(rawPrefix);
  if (!prefix) return;

  els.input.value = prefix;
  hideSearchResults();

  if (!isOnline()) {
    const added = await addLocalQueue(prefix);
    if (added) {
      clearMessage();
      showToast(`Saved ${prefix}`);
      els.input.value = "";
    } else {
      showMessage(`${prefix} already queued`);
    }
    focusInput();
    return;
  }

  try {
    const result = await lookupPrefix(prefix);
    renderResult(result);
    renderHistory(pushHistory(result));
    void refreshProgress();
    els.input.value = "";
    focusInput();
  } catch (error) {
    els.result.hidden = true;
    const msg = error instanceof Error ? error.message : "Lookup failed";
    showMessage(msg.includes("unknown prefix") ? `${prefix} not found` : msg);
    focusInput();
  }
}

function buildPending(server: QueueItem[], local: LocalQueueItem[]): PendingItem[] {
  const seen = new Set<string>();
  const items: PendingItem[] = [];

  for (const item of server) {
    const prefix = normalizePrefix(item.prefix);
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    items.push({ kind: "server", id: item.id, prefix });
  }

  for (const item of local) {
    const prefix = normalizePrefix(item.prefix);
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    items.push({ kind: "local", id: item.id, prefix });
  }

  return items;
}

async function refreshPendingQueue(): Promise<PendingItem[]> {
  const local = await listLocalQueue();
  if (!isOnline()) {
    pendingQueue = buildPending([], local);
    return pendingQueue;
  }

  try {
    const server = await fetchQueue();
    pendingQueue = buildPending(server, local);
  } catch {
    pendingQueue = buildPending([], local);
  }
  return pendingQueue;
}

function showQueuePrompt(): void {
  if (queueDeferred || queueIndex >= pendingQueue.length) {
    els.queueModal.hidden = true;
    focusInput();
    return;
  }

  const item = pendingQueue[queueIndex]!;
  els.queueModal.hidden = false;
  els.queueTitle.textContent = `Queued ${queueIndex + 1}/${pendingQueue.length}`;
  els.queuePrefix.textContent = item.prefix;
}

async function processCurrentQueueItem(): Promise<void> {
  const item = pendingQueue[queueIndex];
  if (!item) {
    els.queueModal.hidden = true;
    return;
  }

  try {
    let result: PrefixResult;
    if (item.kind === "server") {
      result = await processQueueItem(item.id);
    } else {
      result = await lookupPrefix(item.prefix);
      await removeLocalQueue(item.id);
    }
    renderResult(result);
    renderHistory(pushHistory(result));
    void refreshProgress();
    queueIndex += 1;
    showQueuePrompt();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Could not process";
    showMessage(msg.includes("unknown prefix") ? `${item.prefix} not found` : msg);
  }
}

async function deleteCurrentQueueItem(): Promise<void> {
  const item = pendingQueue[queueIndex];
  if (!item) return;

  try {
    if (item.kind === "server") {
      await deleteQueueItem(item.id);
    } else {
      await removeLocalQueue(item.id);
    }
    pendingQueue.splice(queueIndex, 1);
    showQueuePrompt();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not delete");
  }
}

function deferQueue(): void {
  queueDeferred = true;
  els.queueModal.hidden = true;
  focusInput();
}

async function maybeProcessQueue(): Promise<void> {
  queueIndex = 0;
  queueDeferred = false;
  await refreshPendingQueue();
  if (pendingQueue.length > 0) {
    showQueuePrompt();
  }
}

async function syncLocalQueueOnline(): Promise<void> {
  if (!isOnline()) return;
  const local = await listLocalQueue();
  for (const item of local) {
    try {
      await capturePrefix(item.prefix);
      await removeLocalQueue(item.id);
    } catch {
      /* keep local copy if upload fails */
    }
  }
}

function ensureSetup(): boolean {
  const key = getApiKey();
  const fromEnv = Boolean(import.meta.env.VITE_KFZ_API_KEY);
  if (key || fromEnv) {
    els.setupModal.hidden = true;
    els.app.hidden = false;
    return true;
  }
  els.setupModal.hidden = false;
  els.app.hidden = true;
  return false;
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js");
}

async function init(): Promise<void> {
  registerServiceWorker();
  registerInputFocusHandlers();
  updateOnlineBadge();
  renderHistory(loadHistory());

  if (!speechSupported()) {
    els.micBtn.disabled = true;
    els.micBtn.title = "Speech not supported in this browser";
  }

  els.setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const key = els.setupKey.value.trim();
    if (!key) return;
    setApiKey(key);
    ensureSetup();
    void bootstrap();
  });

  if (!ensureSetup()) return;

  await bootstrap();
}

async function bootstrap(): Promise<void> {
  void refreshProgress();
  await syncLocalQueueOnline();
  await maybeProcessQueue();

  focusInput();

  window.addEventListener("online", () => {
    updateOnlineBadge();
    void refreshProgress();
    void (async () => {
      await syncLocalQueueOnline();
      await maybeProcessQueue();
    })();
  });
  window.addEventListener("offline", updateOnlineBadge);

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitLookup(els.input.value);
  });

  els.input.addEventListener("input", () => {
    els.input.value = normalizePrefix(els.input.value).slice(0, 3);
    clearMessage();
    hideSearchResults();
  });

  els.searchBtn.addEventListener("click", () => {
    void runSearch();
  });

  els.micBtn.addEventListener("click", () => {
    if (listenSession) {
      listenSession.stop();
      return;
    }
    startListenSession();
  });

  els.queueLookup.addEventListener("click", () => {
    void processCurrentQueueItem();
  });
  els.queueDelete.addEventListener("click", () => {
    void deleteCurrentQueueItem();
  });
  els.queueLater.addEventListener("click", deferQueue);

  focusInput();
}

void init();
