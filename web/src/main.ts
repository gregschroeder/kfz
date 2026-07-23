import {
  capturePrefix,
  deleteQueueItem,
  fetchPrefixesByBundesland,
  fetchQueue,
  fetchStats,
  getApiKey,
  isOnline,
  lookupPrefix,
  normalizePrefix,
  processQueueItem,
  searchPrefixes,
  setApiKey,
  verifyApiKey,
  type PrefixResult,
  type QueueItem,
  type StatsResult,
  type BundeslandStats,
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
import { formatCount, formatHerleitung, formatPercent, formatProgress, displayQueriedAt } from "./format";
import { speechSupported, startPrefixListen, type SpeechSession } from "./speech";
import { celebrateDiscovery } from "./celebrate";
import "./main.css";

const STATS_ICON_CHART = `<svg class="icon-svg stats-icon-chart" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="13" width="4" height="7" rx="1" fill="currentColor" /><rect x="10" y="9" width="4" height="11" rx="1" fill="currentColor" /><rect x="16" y="5" width="4" height="15" rx="1" fill="currentColor" /></svg>`;

const STATS_ICON_CLOSE = `<svg class="icon-svg stats-icon-close" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" /></svg>`;

const STATS_PREFIX_COLGROUP = `<colgroup><col class="col-prefix" /><col class="col-ursprung" /><col class="col-landkreis" /><col class="col-count" /></colgroup>`;

const STATS_OVERVIEW_COLGROUP = `<colgroup><col class="col-bundesland" /><col class="col-total" /><col class="col-count" /><col class="col-percent" /></colgroup>`;

const STATS_OVERVIEW_HEAD = `
  <tr>
    <th scope="col">Bundesland</th>
    <th scope="col">Total</th>
    <th scope="col">Count</th>
    <th scope="col">Percent</th>
  </tr>`;

const STATS_PREFIX_HEAD = `
  <tr>
    <th scope="col">Kennzeichen</th>
    <th scope="col">Herleitung</th>
    <th scope="col">Landkreis</th>
    <th scope="col">Count</th>
  </tr>`;

type PendingItem =
  | { kind: "server"; id: string; prefix: string }
  | { kind: "local"; id: string; prefix: string };

const els = {
  setupModal: document.getElementById("setup-modal")!,
  setupForm: document.getElementById("setup-form") as HTMLFormElement,
  setupKey: document.getElementById("setup-key") as HTMLInputElement,
  setupError: document.getElementById("setup-error")!,
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
  statsBtn: document.getElementById("stats-btn") as HTMLButtonElement,
  statsView: document.getElementById("stats-view")!,
  statsContent: document.getElementById("stats-content")!,
  mainView: document.getElementById("main-view")!,
};

let pendingQueue: PendingItem[] = [];
let queueIndex = 0;
let queueDeferred = false;
let toastTimer: number | undefined;
let listenSession: SpeechSession | null = null;
let focusHandlersRegistered = false;
let cachedStats: StatsResult | null = null;
let statsDrilldown: string | null = null;

function canFocusInput(): boolean {
  return (
    !els.app.hidden &&
    els.queueModal.hidden &&
    els.setupModal.hidden &&
    els.statsView.hidden
  );
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

const SPECIAL_BUNDESLAENDER = new Set(["Filmproduktion", "bundesweit"]);

function sortBundeslandRows(rows: BundeslandStats[]): BundeslandStats[] {
  return [...rows].sort((a, b) => {
    if (b.percent !== a.percent) return b.percent - a.percent;
    return a.bundesland.localeCompare(b.bundesland, "de");
  });
}

function renderPercentBar(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const label = formatPercent(clamped);
  return `<td class="stats-percent-cell"><div class="stats-percent-bar" style="--pct: ${clamped}"><div class="stats-percent-fill" aria-hidden="true"></div><span class="stats-percent-label">${escapeHtml(label)}</span></div></td>`;
}

function renderStatsTableRows(rows: BundeslandStats[]): string {
  return rows
    .map(
      (row) => `
          <tr class="stats-bl-row" data-bundesland="${escapeHtml(row.bundesland)}" role="button" tabindex="0">
            <td>${escapeHtml(row.bundesland)}</td>
            <td>${formatCount(row.total)}</td>
            <td>${formatCount(row.count)}</td>
            ${renderPercentBar(row.percent)}
          </tr>`,
    )
    .join("");
}

function renderPrefixDetailRows(items: PrefixResult[]): string {
  return items
    .map((item) => {
      const queried =
        item.count > 0
          ? `<span class="stats-queried-at">${formatQueriedAtHtml(item.queried_at)}</span>`
          : "";
      return `
          <tr class="${item.count > 0 ? "stats-prefix-found" : "stats-prefix-unfound"}">
            <td>${escapeHtml(item.code)}</td>
            <td>${escapeHtml(formatHerleitung(item.ursprung))}</td>
            <td>${escapeHtml(item.landkreis)}</td>
            <td class="stats-count-cell">${formatCount(item.count)}${queried}</td>
          </tr>`;
    })
    .join("");
}

function updateStatsBtnState(): void {
  const open = els.statsBtn.getAttribute("aria-pressed") === "true";
  const blMode = open && Boolean(statsDrilldown);

  els.statsBtn.innerHTML = blMode ? STATS_ICON_CLOSE : STATS_ICON_CHART;

  if (!open) {
    els.statsBtn.dataset.mode = "closed";
    els.statsBtn.setAttribute("aria-label", "Bundesland stats");
    return;
  }
  if (statsDrilldown) {
    els.statsBtn.dataset.mode = "bl";
    els.statsBtn.setAttribute("aria-label", "Back to stats overview");
    return;
  }
  els.statsBtn.dataset.mode = "overview";
  els.statsBtn.setAttribute("aria-label", "Close Bundesland stats");
}

function setStatsScrollLock(active: boolean): void {
  document.body.classList.toggle("stats-scroll-lock", active);
  els.statsView.classList.toggle("stats-view-scroll", active);
}

function renderStatsPage(stats: StatsResult): void {
  cachedStats = stats;
  statsDrilldown = null;
  updateStatsBtnState();
  const all = stats.bundeslaender ?? [];
  const main = sortBundeslandRows(
    all.filter((row) => !SPECIAL_BUNDESLAENDER.has(row.bundesland)),
  );
  const special = sortBundeslandRows(
    all.filter((row) => SPECIAL_BUNDESLAENDER.has(row.bundesland)),
  );

  if (all.length === 0) {
    setStatsScrollLock(false);
    els.statsContent.innerHTML = `
      <p class="stats-summary">${escapeHtml(formatProgress(stats.found, stats.total))}</p>
      <p class="muted">Bundesland breakdown unavailable until the database is updated.</p>
    `;
    return;
  }

  const specialTable = special.length
    ? `
        <table class="stats-table stats-table-overview stats-table-special">
          ${STATS_OVERVIEW_COLGROUP}
          <tbody>
            ${renderStatsTableRows(special)}
          </tbody>
        </table>`
    : "";

  els.statsContent.innerHTML = `
    <div class="stats-scroll-layout">
      <p class="stats-summary">${escapeHtml(formatProgress(stats.found, stats.total))}</p>
      <div class="stats-scroll-table-head">
        <table class="stats-table stats-table-overview">
          ${STATS_OVERVIEW_COLGROUP}
          <thead>${STATS_OVERVIEW_HEAD}</thead>
        </table>
      </div>
      <div class="stats-scroll-body">
        <table class="stats-table stats-table-overview">
          ${STATS_OVERVIEW_COLGROUP}
          <thead aria-hidden="true">${STATS_OVERVIEW_HEAD}</thead>
          <tbody>
            ${renderStatsTableRows(main)}
          </tbody>
        </table>
        ${specialTable}
      </div>
    </div>
  `;
  setStatsScrollLock(true);
}

function renderBundeslandDetail(bundesland: string, items: PrefixResult[]): void {
  statsDrilldown = bundesland;
  updateStatsBtnState();

  const blStats = cachedStats?.bundeslaender?.find(
    (row) => row.bundesland === bundesland,
  );
  const summary = blStats
    ? formatProgress(blStats.count, blStats.total)
    : bundesland;

  els.statsContent.innerHTML = `
    <div class="stats-scroll-layout">
      <p class="stats-summary">${escapeHtml(summary)} · ${escapeHtml(bundesland)}</p>
      <div class="stats-scroll-table-head">
        <table class="stats-table stats-table-prefixes">
          ${STATS_PREFIX_COLGROUP}
          <thead>${STATS_PREFIX_HEAD}</thead>
        </table>
      </div>
      <div class="stats-scroll-body">
        <table class="stats-table stats-table-prefixes">
          ${STATS_PREFIX_COLGROUP}
          <thead aria-hidden="true">${STATS_PREFIX_HEAD}</thead>
          <tbody>
            ${renderPrefixDetailRows(items)}
          </tbody>
        </table>
      </div>
    </div>
  `;
  setStatsScrollLock(true);
}

async function showBundeslandDetail(bundesland: string): Promise<void> {
  els.statsContent.innerHTML = `<p class="muted">Loading…</p>`;

  try {
    const items = await fetchPrefixesByBundesland(bundesland);
    renderBundeslandDetail(bundesland, items);
  } catch (error) {
    statsDrilldown = null;
    setStatsScrollLock(false);
    updateStatsBtnState();
    els.statsContent.innerHTML = `<p class="muted">${escapeHtml(
      error instanceof Error ? error.message : "Could not load prefixes",
    )}</p>`;
  }
}

function showStatsOverview(): void {
  if (cachedStats) {
    renderStatsPage(cachedStats);
    return;
  }

  void (async () => {
    try {
      const stats = await fetchStats();
      renderStatsPage(stats);
    } catch (error) {
      els.statsContent.innerHTML = `<p class="muted">${escapeHtml(
        error instanceof Error ? error.message : "Could not load stats",
      )}</p>`;
    }
  })();
}

function setStatsOpen(open: boolean): void {
  els.statsView.hidden = !open;
  els.mainView.hidden = open;
  els.statsBtn.setAttribute("aria-pressed", open ? "true" : "false");

  if (!open) {
    statsDrilldown = null;
    setStatsScrollLock(false);
    updateStatsBtnState();
    focusInput();
    return;
  }

  els.statsContent.innerHTML = `<p class="muted">Loading…</p>`;
  updateStatsBtnState();

  if (!isOnline()) {
    els.statsContent.innerHTML = `<p class="muted">Stats require an internet connection.</p>`;
    return;
  }

  void (async () => {
    try {
      const stats = await fetchStats();
      renderStatsPage(stats);
    } catch (error) {
      els.statsContent.innerHTML = `<p class="muted">${escapeHtml(
        error instanceof Error ? error.message : "Could not load stats",
      )}</p>`;
    }
  })();
}

function toggleStatsView(): void {
  if (!els.statsView.hidden && statsDrilldown) {
    showStatsOverview();
    return;
  }
  setStatsOpen(els.statsView.hidden);
}

function handleStatsContentClick(event: Event): void {
  const target = event.target as HTMLElement;
  const row = target.closest<HTMLElement>(".stats-bl-row");
  if (!row?.dataset.bundesland) return;
  void showBundeslandDetail(row.dataset.bundesland);
}

function handleStatsContentKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target as HTMLElement;
  const row = target.closest<HTMLElement>(".stats-bl-row");
  if (!row?.dataset.bundesland) return;
  event.preventDefault();
  void showBundeslandDetail(row.dataset.bundesland);
}

function formatHistoryMetaHtml(entry: HistoryEntry): string {
  const head = `${escapeHtml(formatHerleitung(entry.ursprung))} · ${entry.count}×`;
  const when = formatQueriedAtHtml(entry.queried_at ?? entry.savedAt);
  return `${head} · ${when}`;
}

function renderResult(result: PrefixResult): void {
  clearMessage();
  hideSearchResults();
  els.result.hidden = false;
  els.result.classList.remove("celebrate-flash", "celebrate-done");

  const countNum = `<span class="result-count-num">${formatCount(result.count)}</span>`;
  const countLine =
    result.count === 1
      ? `${countNum} · <span class="result-new">NEW!</span>`
      : result.count > 0
        ? `${countNum} · ${formatQueriedAtHtml(result.previous_queried_at)}`
        : countNum;

  els.result.innerHTML = `
    <p class="result-count">${countLine}</p>
    <p class="result-code">${escapeHtml(result.code)}: ${escapeHtml(formatHerleitung(result.ursprung))}</p>
    <p class="result-line">${escapeHtml(result.landkreis)}</p>
    <p class="result-line">${escapeHtml(result.bundesland)}</p>
  `;

  if (result.count === 1) {
    celebrateDiscovery(els.result);
  }
}

function formatHistoryDetailHtml(entry: HistoryEntry): string {
  const lines = [
    `<p class="history-detail-line">${escapeHtml(entry.landkreis)}</p>`,
    `<p class="history-detail-line">${escapeHtml(entry.bundesland)}</p>`,
  ];
  if (entry.count > 1) {
    const prev = formatQueriedAtHtml(entry.previous_queried_at);
    lines.push(`<p class="history-detail-line muted">zuvor ${prev}</p>`);
  }
  return lines.join("");
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
          <details class="history-item">
            <summary class="history-summary">
              <span class="history-code">${escapeHtml(h.code)}</span>
              <span class="history-meta">${formatHistoryMetaHtml(h)}</span>
            </summary>
            <div class="history-detail">${formatHistoryDetailHtml(h)}</div>
          </details>
        </li>`,
        )
        .join("")}
    </ul>
  `;

  const panels = els.history.querySelectorAll<HTMLDetailsElement>("details.history-item");
  panels.forEach((panel) => {
    panel.addEventListener("toggle", () => {
      if (!panel.open) return;
      panels.forEach((other) => {
        if (other !== panel) other.open = false;
      });
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

function formatQueriedAtHtml(iso: string | null | undefined): string {
  const display = displayQueriedAt(iso);
  const text = escapeHtml(display.text);
  if (display.preSwitchover) {
    return `<em class="pre-switchover">*${text}</em>`;
  }
  return text;
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
  if (getApiKey()) {
    els.setupModal.hidden = true;
    els.app.hidden = false;
    return true;
  }
  els.setupModal.hidden = false;
  els.app.hidden = true;
  return false;
}

function showSetupError(message: string): void {
  els.setupError.textContent = message;
  els.setupError.hidden = false;
}

function clearSetupError(): void {
  els.setupError.hidden = true;
  els.setupError.textContent = "";
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js");
}

async function init(): Promise<void> {
  registerServiceWorker();
  registerInputFocusHandlers();
  updateStatsBtnState();
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

    clearSetupError();
    const submitBtn = els.setupForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;

    void (async () => {
      try {
        const ok = await verifyApiKey(key);
        if (!ok) {
          showSetupError("Invalid household key");
          return;
        }
        setApiKey(key);
        ensureSetup();
        await bootstrap();
      } catch {
        showSetupError("Could not verify key — check connection");
      } finally {
        submitBtn.disabled = false;
      }
    })();
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

  els.statsBtn.addEventListener("click", () => {
    toggleStatsView();
  });
  els.statsContent.addEventListener("click", handleStatsContentClick);
  els.statsContent.addEventListener("keydown", handleStatsContentKeydown);

  focusInput();
}

void init();
