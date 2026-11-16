import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { configurePackagedAnalyzer } from "./analyzer";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("packaged Rust analyzer discovery", () => {
  it("preserves an explicitly configured analyzer", () => {
    const environment = { DXGEN_ANALYZER_PATH: "/custom/dxgen-analyze" };

    expect(
      configurePackagedAnalyzer(
        "file:///missing/dist/index.js",
        environment,
        "linux",
        "x64",
      ),
    ).toBe("/custom/dxgen-analyze");
  });

  it("selects the analyzer packaged beside the TypeScript CLI", async () => {
    const directory = path.join(
      os.tmpdir(),
      `dxgen-cli-${process.pid}-${Date.now()}`,
    );
    await mkdir(directory, { recursive: true });
    temporaryDirectories.push(directory);
    const executable =
      process.platform === "win32" ? "dxgen-analyze.exe" : "dxgen-analyze";
    const analyzerPath = path.join(
      directory,
      "native",
      `${process.platform}-${process.arch}`,
      executable,
    );
    await mkdir(path.dirname(analyzerPath), { recursive: true });
    await writeFile(analyzerPath, "analyzer");
    const ragPath = path.join(
      directory,
      "native",
      `${process.platform}-${process.arch}`,
      process.platform === "win32" ? "dxgen-rag.exe" : "dxgen-rag",
    );
    await writeFile(ragPath, "rag");
    const environment: NodeJS.ProcessEnv = {};

    expect(
      configurePackagedAnalyzer(
        pathToFileURL(path.join(directory, "dist/index.js")).href,
        environment,
      ),
    ).toBe(analyzerPath);
    expect(environment.DXGEN_ANALYZER_PATH).toBe(analyzerPath);
    expect(environment.DXGEN_RAG_PATH).toBe(ragPath);
  });

  it("keeps the TypeScript fallback when no packaged analyzer exists", () => {
    const environment: NodeJS.ProcessEnv = {};

    expect(
      configurePackagedAnalyzer(
        "file:///missing/dist/index.js",
        environment,
        "linux",
        "x64",
      ),
    ).toBeUndefined();
    expect(environment.DXGEN_ANALYZER_PATH).toBeUndefined();
    expect(environment.DXGEN_RAG_PATH).toBeUndefined();
  });
});
