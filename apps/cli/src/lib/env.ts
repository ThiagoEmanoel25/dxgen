import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import dotenv from "dotenv";

let envLoaded = false;

/**
 * LangSmith tracing is observability for whoever develops dxgen, not for the
 * person running it. Its client reports every failure through console.warn,
 * and each of those repaints the whole progress UI -- an unreachable or
 * unauthorized endpoint turns a normal run into pages of stack noise.
 *
 * Opt back in with DXGEN_TRACE=1.
 */
function silenceTracingUnlessRequested(): void {
  if (process.env.DXGEN_TRACE === "1") {
    return;
  }

  // langsmith reads both prefixes and only treats the exact string "true" as
  // on, so clearing them is enough.
  for (const name of [
    "LANGSMITH_TRACING",
    "LANGSMITH_TRACING_V2",
    "LANGCHAIN_TRACING",
    "LANGCHAIN_TRACING_V2",
  ]) {
    delete process.env[name];
  }
}

export function loadEnv(): void {
  if (envLoaded) {
    return;
  }

  const envPaths = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../.env"),
    resolve(process.cwd(), "../../.env"),
    resolve(import.meta.dirname, "../../../.env"),
    resolve(import.meta.dirname, "../../../../.env"),
    join(homedir(), ".dxgen", ".env"),
  ];

  const envPath = envPaths.find((candidate) => existsSync(candidate));

  if (envPath) {
    dotenv.config({ path: envPath });
  } else if (process.env.NODE_ENV !== "production") {
    console.warn("⚠️  No .env file found. Using environment variables only.");
  }

  silenceTracingUnlessRequested();
  envLoaded = true;
}

export function __resetEnvLoaded(): void {
  envLoaded = false;
}

export function isEnvLoaded(): boolean {
  return envLoaded;
}
