import { authorize, corsPreflight, json } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();

  const authError = authorize(req, "mutation");
  if (authError) return authError;

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  let body: { queue_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const queueId = body.queue_id?.trim();
  if (!queueId) {
    return json({ error: "queue_id required" }, 400);
  }

  const supabase = getServiceClient();
  const { error } = await supabase.rpc("queue_delete", {
    p_queue_id: queueId,
  });

  if (error) {
    const status = error.message.includes("not found") ? 404 : 500;
    return json({ error: error.message }, status);
  }

  return json({ deleted: true });
});
