import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildRustProjectContext,
  parseRustAnalyzerOutput,
} from "./rust-project-context";

const validOutput = {
  schemaVersion: 1,
  rootPath: "/project",
  packages: [],
  configFiles: { tsconfigs: [], ciConfigs: [], otherConfigs: [] },
  structure: [],
  existingDocs: [],
};

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Rust project context adapter", () => {
  it("removes the boundary version and attaches the detected stack", () => {
    expect(
      parseRustAnalyzerOutput(JSON.stringify(validOutput), {
        language: "rust",
      }),
    ).toEqual({
      rootPath: "/project",
      packages: [],
      configFiles: { tsconfigs: [], ciConfigs: [], otherConfigs: [] },
      structure: [],
      existingDocs: [],
      stack: { language: "rust" },
    });
  });

  it("rejects incompatible output", () => {
    expect(() => parseRustAnalyzerOutput('{"schemaVersion":2}')).toThrow(
      "incompatible schema",
    );
  });

  it.runIf(process.platform !== "win32")(
    "invokes the configured analyzer binary",
    async () => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), "dxgen-rust-adapter-"),
      );
      temporaryDirectories.push(directory);
      const binaryPath = path.join(directory, "fake-analyzer");
      await writeFile(
        binaryPath,
        `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(validOutput))});\n`,
      );
      await chmod(binaryPath, 0o755);

      await expect(
        buildRustProjectContext("/project", { binaryPath }),
      ).resolves.toMatchObject({ rootPath: "/project" });
    },
  );
});
