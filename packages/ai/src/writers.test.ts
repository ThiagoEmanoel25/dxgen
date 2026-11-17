import path from "node:path";
import { describe, expect, it } from "vitest";

import type { GenerateRequest, GenerateResult } from "./types";
import { resolveFilePath } from "./writers";

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
