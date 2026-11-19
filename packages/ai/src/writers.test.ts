import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { GenerateRequest, GenerateResult } from "./types";
import { resolveFilePath, writeDocumentationFile } from "./writers";

const request: GenerateRequest = {
  project: { rootPath: "/project" },
  wizard: {
    feature: "readme",
    outputDir: "docs",
    style: "technical",
    sync: false,
  },
};

const result = (suggestedPath: string): GenerateResult => ({
  kind: "readme",
  content: "content",
  suggestedPath,
});

describe("documentation output confinement", () => {
  it("resolves generated files inside the selected output directory", () => {
    expect(resolveFilePath(request, result("README.md"))).toBe(
      path.resolve("/project/docs/README.md"),
    );
  });

  it("rejects absolute and escaping generated paths", () => {
    expect(() => resolveFilePath(request, result("/tmp/README.md"))).toThrow(
      "must be relative",
    );
    expect(() => resolveFilePath(request, result("../../README.md"))).toThrow(
      "escapes",
    );
  });
});

describe("overwrite handling", () => {
  // The CLI asks about overwriting in the wizard and passes the answer here.
  // It must never need a callback that prompts: the progress UI owns the
  // terminal by then, and a question printed under it is erased every frame.
  const existing = async (overwrite: boolean | undefined) => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "dxgen-writers-"));
    const target = path.join(dir, "README.md");
    await fs.writeFile(target, "old", "utf-8");

    const write = await writeDocumentationFile(
      { project: { rootPath: dir }, wizard: { ...request.wizard, outputDir: dir } },
      result("README.md"),
      { overwrite },
    );

    return { write, target, content: await fs.readFile(target, "utf-8") };
  };

  it("replaces the file when overwrite is allowed", async () => {
    const { write, content } = await existing(true);
    expect(write.success).toBe(true);
    expect(content).toBe("content");
  });

  it("fails with a readable error instead of waiting for an answer", async () => {
    const { write, target, content } = await existing(false);
    expect(write.success).toBe(false);
    expect(write.error).toBe(`${target} already exists and overwriting was declined.`);
    expect(content).toBe("old");
  });
});
