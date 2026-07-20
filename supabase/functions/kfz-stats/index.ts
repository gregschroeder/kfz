import { authorize, corsPreflight, json } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();

  const authError = authorize(req, "read");
  if (authError) return authError;

  if (req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const supabase = getServiceClient();
  const summary = await supabase.rpc("stats");

  if (summary.error) {
    return json({ error: summary.error.message }, 500);
  }

  const row = Array.isArray(summary.data) ? summary.data[0] : summary.data;
  const found = Number(row?.found ?? 0);
  const total = Number(row?.total ?? 0);

  const breakdown = await supabase.rpc("stats_by_bundesland");
  const bundeslaender = breakdown.error
    ? []
    : (breakdown.data ?? []).map(
        (entry: {
          bundesland: string;
          total: number;
          found: number;
          percent: number;
        }) => ({
          bundesland: entry.bundesland,
          total: Number(entry.total ?? 0),
          count: Number(entry.found ?? 0),
          percent: Number(entry.percent ?? 0),
        }),
      );

  return json({ found, total, bundeslaender });
});
