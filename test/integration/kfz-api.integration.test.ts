import { describe, expect, it } from "vitest";
import { apiFetch } from "./helpers/api";

describe("kfz edge functions", () => {
  it("lookup increments count and returns prefix metadata", async () => {
    const res = await apiFetch("kfz-lookup", {
      method: "POST",
      body: JSON.stringify({ prefix: "KF" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toMatchObject({
      code: "KF",
      ursprung: "KauFbeuren",
      landkreis: "Ostallgäu",
      bundesland: "Bayern",
      count: 1,
    });
    expect(body.result.queried_at).toBeTruthy();
  });

  it("returns 404 for unknown prefix", async () => {
    const res = await apiFetch("kfz-lookup", {
      method: "POST",
      body: JSON.stringify({ prefix: "ZZZ" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/unknown prefix/i);
  });

  it("rejects requests without api key", async () => {
    const { functionsUrl } = await import("./helpers/api").then((m) =>
      m.getTestApiConfig(),
    );

    const res = await fetch(`${functionsUrl}/kfz-lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "KF" }),
    });

    expect(res.status).toBe(401);
  });

  it("capture → queue → process flow", async () => {
    const capture = await apiFetch("kfz-capture", {
      method: "POST",
      body: JSON.stringify({ prefix: "M", source: "watch" }),
    });
    expect(capture.status).toBe(200);

    const queue = await apiFetch("kfz-queue");
    expect(queue.status).toBe(200);
    const { items } = await queue.json();
    const pending = items.find((item: { prefix: string }) => item.prefix === "M");
    expect(pending).toBeTruthy();

    const processed = await apiFetch("kfz-process", {
      method: "POST",
      body: JSON.stringify({ queue_id: pending.id }),
    });
    expect(processed.status).toBe(200);
    const { result } = await processed.json();
    expect(result.code).toBe("M");
    expect(result.count).toBe(1);
  });
});
