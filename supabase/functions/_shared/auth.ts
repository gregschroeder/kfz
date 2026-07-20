import { checkRateLimit, type RateLimitKind } from "./rate-limit.ts";
import { json } from "./http.ts";

export { corsPreflight, json } from "./http.ts";

export function checkApiKey(req: Request): Response | null {
  const expected = Deno.env.get("KFZ_API_KEY");
  if (!expected) {
    return json({ error: "server misconfigured" }, 500);
  }

  const provided = req.headers.get("x-kfz-key");
  if (!provided || provided !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  return null;
}

export function authorize(req: Request, kind: RateLimitKind): Response | null {
  const authError = checkApiKey(req);
  if (authError) return authError;
  return checkRateLimit(req, kind);
}
