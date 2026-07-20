import { authorize, corsPreflight, json } from "../_shared/auth.ts";
import {
  getPreviousQueriedAt,
  getServiceClient,
  prefixToResponse,
} from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();

  const authError = authorize(req, "mutation");
  if (authError) return authError;

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  let body: { prefix?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const prefix = body.prefix?.trim();
  if (!prefix) {
    return json({ error: "prefix required" }, 400);
  }

  const code = prefix.toUpperCase();
  const supabase = getServiceClient();
  const previousQueriedAt = await getPreviousQueriedAt(supabase, code);

  const { data, error } = await supabase.rpc("lookup_and_increment", {
    p_prefix: prefix,
  });

  if (error) {
    const status = error.message.includes("unknown prefix") ? 404 : 500;
    return json({ error: error.message }, status);
  }

  return json({ result: prefixToResponse(data, previousQueriedAt) });
});
