/** Preserve Herleitung spelling (e.g. KauFbeuren — capitals mark plate letters). */
export function formatHerleitung(ursprung: string): string {
  return ursprung.trim();
}

export function formatCount(count: number): string {
  return String(count);
}

export function formatProgress(found: number, total: number): string {
  if (total <= 0) {
    return "0.00% · 0/0";
  }
  const pct = (found / total) * 100;
  return `${pct.toFixed(2)}% · ${found}/${total}`;
}

export function formatQueriedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
