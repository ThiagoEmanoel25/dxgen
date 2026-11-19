import { afterEach, describe, expect, it } from "vitest";
import { __resetEnvLoaded, loadEnv } from "./env";

const TRACING_VARS = [
  "LANGSMITH_TRACING",
  "LANGSMITH_TRACING_V2",
  "LANGCHAIN_TRACING",
  "LANGCHAIN_TRACING_V2",
];

afterEach(() => {
  for (const name of [...TRACING_VARS, "DXGEN_TRACE"]) {
    delete process.env[name];
  }
  __resetEnvLoaded();
});

describe("tracing is off unless asked for", () => {
  it("clears every tracing flag a .env may have set", () => {
    for (const name of TRACING_VARS) {
      process.env[name] = "true";
    }

    loadEnv();

    // Left on, langsmith reports failures through console.warn and each one
    // repaints the progress UI.
    for (const name of TRACING_VARS) {
      expect(process.env[name]).toBeUndefined();
    }
  });

  it("keeps tracing when DXGEN_TRACE=1", () => {
    process.env.DXGEN_TRACE = "1";
    process.env.LANGSMITH_TRACING = "true";

    loadEnv();

    expect(process.env.LANGSMITH_TRACING).toBe("true");
  });
});
