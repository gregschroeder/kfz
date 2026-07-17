import { checkApiKey, corsPreflight, json } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();

  const authError = checkApiKey(req);
  if (authError) return authError;

  if (req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("queue")
    .select("id, prefix, source, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ items: data ?? [] });
});
