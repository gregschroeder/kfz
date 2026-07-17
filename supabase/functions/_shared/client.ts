import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "kfz" },
  });
}

export function prefixToResponse(row: {
  code: string;
  ursprung: string;
  landkreis: string;
  bundesland: string;
  count: number;
  queried_at: string | null;
}, previousQueriedAt: string | null = null) {
  return {
    code: row.code,
    ursprung: row.ursprung,
    landkreis: row.landkreis,
    bundesland: row.bundesland,
    count: row.count,
    queried_at: row.queried_at,
    previous_queried_at: previousQueriedAt,
  };
}

export async function getPreviousQueriedAt(
  supabase: ReturnType<typeof getServiceClient>,
  code: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("prefixes")
    .select("queried_at")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  return data?.queried_at ?? null;
}
