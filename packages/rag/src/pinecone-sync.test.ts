import { describe, expect, it } from "vitest";

import { findStaleVectorIds } from "./pinecone-sync.js";

describe("Pinecone full replacement", () => {
  it("deletes only vectors absent from the new completed index", () => {
    expect(
      findStaleVectorIds(["kept", "removed"], new Set(["kept", "added"])),
    ).toEqual(["removed"]);
  });
});
