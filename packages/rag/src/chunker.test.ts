import { describe, expect, it } from "vitest";

import { chunkProjectFiles } from "./chunker.js";

describe("chunk hashes", () => {
  it("keeps hashes stable and changes them with content", async () => {
    const file = {
      fullPath: "/project/index.ts",
      relativePath: "index.ts",
      size: 23,
      content: "export const value = 1;\n",
    };
    const [first] = await chunkProjectFiles([file]);
    const [same] = await chunkProjectFiles([file]);
    const [changed] = await chunkProjectFiles([
      { ...file, content: "export const value = 2;\n" },
    ]);

    expect(first.metadata.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.metadata.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(same).toEqual(first);
    expect(changed.metadata.fileHash).not.toBe(first.metadata.fileHash);
    expect(changed.metadata.contentHash).not.toBe(first.metadata.contentHash);
    expect(changed.id).not.toBe(first.id);
  });
});
