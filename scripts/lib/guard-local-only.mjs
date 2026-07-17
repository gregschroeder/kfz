/**
 * Refuse destructive DB operations against hosted Supabase (prod).
 */

const PROD_PROJECT_REF = process.env.KFZ_PROD_PROJECT_REF ?? "wchzccrcqlxgsftjbpgn";

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isLocalHost(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function isRemoteDatabaseUrl(url) {
  if (!url) return false;
  return url.includes("pooler.supabase.com") || /@aws-.*supabase\.com/.test(url);
}

function isRemoteSupabaseUrl(url) {
  if (!url) return false;
  const host = hostnameFromUrl(url);
  if (!host || isLocalHost(host)) return false;
  return host.endsWith(".supabase.co");
}

export function assertLocalDevOnly() {
  if (process.env.KFZ_ALLOW_PROD_RESET === "1") {
    console.warn("WARNING: KFZ_ALLOW_PROD_RESET=1 — local-only guard disabled");
    return;
  }

  if (isRemoteDatabaseUrl(process.env.DATABASE_URL)) {
    throw new Error(
      "Refusing: DATABASE_URL points at hosted Supabase. Reset is local/dev only.",
    );
  }

  if (isRemoteSupabaseUrl(process.env.SUPABASE_URL)) {
    throw new Error(
      "Refusing: SUPABASE_URL points at hosted Supabase. Reset is local/dev only.",
    );
  }
}

export { PROD_PROJECT_REF, isLocalHost, isRemoteDatabaseUrl, isRemoteSupabaseUrl };
