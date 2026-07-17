import { checkApiKey, corsPreflight, json } from "../_shared/auth.ts";
import { getServiceClient, prefixToResponse } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();

  const authError = checkApiKey(req);
  if (authError) return authError;

  if (req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim().toUpperCase() ?? "";
  if (!query) {
    return json({ items: [] });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("search_prefixes", {
    p_query: query,
  });

  if (error) {
    return json({ error: error.message }, 500);
  }

  const items = (Array.isArray(data) ? data : []).map((row) => prefixToResponse(row));
  return json({ items });
});
