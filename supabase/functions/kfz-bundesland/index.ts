import { authorize, corsPreflight, json } from "../_shared/auth.ts";
import { getServiceClient, prefixToResponse } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();

  const authError = authorize(req, "read");
  if (authError) return authError;

  if (req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const bundesland = url.searchParams.get("bl")?.trim() ?? "";
  if (!bundesland) {
    return json({ error: "missing bl query parameter" }, 400);
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("list_prefixes_by_bundesland", {
    p_bundesland: bundesland,
  });

  if (error) {
    return json({ error: error.message }, 500);
  }

  const items = (Array.isArray(data) ? data : []).map((row) => prefixToResponse(row));
  return json({ items });
});
