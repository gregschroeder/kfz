import type { InlineConfig } from "vitest";
import { vitestReporter, vitestSilent } from "./verbose";

export const quietVitestTestOptions = {
  reporters: [vitestReporter()],
  silent: vitestSilent(),
} satisfies Pick<InlineConfig, "reporters" | "silent">;
