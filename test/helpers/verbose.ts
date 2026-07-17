import { execSync, type ExecSyncOptions } from "child_process";

export function isTestVerbose(): boolean {
  const v = process.env.TEST_VERBOSE;
  return v === "1" || v === "true" || v === "yes";
}

export function testLog(...args: unknown[]): void {
  if (isTestVerbose()) {
    console.log(...args);
  }
}

type ExecOpts = Pick<ExecSyncOptions, "cwd" | "encoding">;

export function execTestShell(command: string, options: ExecOpts): void {
  if (isTestVerbose()) {
    execSync(command, { cwd: options.cwd, stdio: "inherit" });
    return;
  }
  try {
    execSync(command, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer };
    const detail = [e.stderr?.toString().trim(), e.stdout?.toString().trim()]
      .filter(Boolean)
      .join("\n");
    throw new Error(
      detail ? `Command failed: ${command}\n${detail}` : `Command failed: ${command}`,
      { cause: err },
    );
  }
}

export function execTestCapture(
  command: string,
  options: ExecOpts & { encoding: "utf8" },
): string {
  return execSync(command, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: isTestVerbose()
      ? ["ignore", "pipe", "inherit"]
      : ["ignore", "pipe", "pipe"],
  });
}

export function vitestReporter(): "verbose" | "dot" {
  return isTestVerbose() ? "verbose" : "dot";
}

export function vitestSilent(): boolean {
  return !isTestVerbose();
}
