import { assertLocalSupabaseUrl } from "../../helpers/supabase-local";

export function getTestApiConfig() {
  const functionsUrl = process.env.VITE_FUNCTIONS_URL;
  const apiKey = process.env.VITE_KFZ_API_KEY;

  if (!functionsUrl || !apiKey) {
    throw new Error(
      "VITE_FUNCTIONS_URL and VITE_KFZ_API_KEY required (written by integration setup)",
    );
  }

  assertLocalSupabaseUrl(functionsUrl.replace(/\/functions\/v1\/?$/, ""));

  return { functionsUrl: functionsUrl.replace(/\/$/, ""), apiKey };
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { functionsUrl, apiKey } = getTestApiConfig();
  const headers = new Headers(init.headers);
  headers.set("x-kfz-key", apiKey);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${functionsUrl}/${path}`, {
    ...init,
    headers,
  });
}
