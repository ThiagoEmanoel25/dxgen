import { describe, expect, it } from "vitest";

import { buildNamespace } from "./pinecone-utils.js";

describe("Pinecone namespace isolation", () => {
  it("does not collide when project paths normalize to the same slug", () => {
    const pinecone = { index: "dxgen-docs" };
    const first = buildNamespace(pinecone, {
      userId: "user",
      projectId: "/a/b",
    });
    const second = buildNamespace(pinecone, {
      userId: "user",
      projectId: "/a-b",
    });

    expect(first).not.toBe(second);
    expect(first).toBe(
      buildNamespace(pinecone, { userId: "user", projectId: "/a/b" }),
    );
  });
});
