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

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, x-kfz-key",
    },
  });
}

export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-kfz-key",
    },
  });
}
