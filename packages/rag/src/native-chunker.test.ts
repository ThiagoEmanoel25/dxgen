import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  chunkProjectWithRust,
  parseRustRagOutput,
  prepareProjectChunks,
} from "./native-chunker.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.DXGEN_RAG_PATH;
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Rust RAG boundary", () => {
  it("validates schema version and required chunk fields", () => {
    expect(() => parseRustRagOutput('{"schemaVersion":2,"chunks":[]}')).toThrow(
      "incompatible schema",
    );
    expect(parseRustRagOutput('{"schemaVersion":1,"chunks":[]}')).toEqual([]);
  });

  it.runIf(process.platform !== "win32")(
    "invokes a configured executable with chunk options",
    async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "dxgen-rag-test-"));
      temporaryDirectories.push(directory);
      const executable = path.join(directory, "fake-rag");
      await writeFile(
        executable,
        `#!/bin/sh
printf '%s' '{"schemaVersion":1,"chunks":[]}'
`,
      );
      await chmod(executable, 0o755);

      await expect(
        chunkProjectWithRust(directory, executable, {
          chunkSize: 100,
          chunkOverlap: 10,
        }),
      ).resolves.toEqual([]);
    },
  );

  it("preserves the TypeScript fallback when no native binary is configured", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "dxgen-rag-test-"));
    temporaryDirectories.push(directory);
    await writeFile(path.join(directory, "index.ts"), "export const value = 1;\n");

    const chunks = await prepareProjectChunks(directory, undefined, {
      chunkSize: 100,
      chunkOverlap: 10,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.relativePath).toBe("index.ts");
  });
});
