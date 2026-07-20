import { authorize, corsPreflight, json } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();

  const authError = authorize(req, "mutation");
  if (authError) return authError;

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  let body: { prefix?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const prefix = body.prefix?.trim();
  if (!prefix) {
    return json({ error: "prefix required" }, 400);
  }

  const source = body.source === "phone" ? "phone" : "watch";

  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("queue_add", {
    p_prefix: prefix,
    p_source: source,
  });

  if (error) {
    return json({ error: error.message }, 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return json({
    saved: true,
    duplicate: row?.duplicate ?? false,
    queue: row,
  });
});
