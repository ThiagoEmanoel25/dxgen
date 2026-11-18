import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FileChunk, SyncOptions } from "./types.js";

const mocks = vi.hoisted(() => ({
  createEmbeddings: vi.fn(),
  embedDocuments: vi.fn(),
  listPaginated: vi.fn(),
  fetch: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("./embeddings.js", () => ({
  createEmbeddings: mocks.createEmbeddings,
}));
vi.mock("./pinecone-utils.js", () => ({
  getIndexForContext: () => ({
    namespace: "test",
    index: {
      listPaginated: mocks.listPaginated,
      fetch: mocks.fetch,
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
    },
  }),
}));

import {
  buildIndex,
  chunkVectorId,
  findStaleVectorIds,
  replaceIndex,
} from "./pinecone-sync.js";

const options: SyncOptions = {
  pinecone: { index: "docs" },
  context: { userId: "user", projectId: "project" },
};
const chunk: FileChunk = {
  id: "index.ts:0:content",
  text: "export const value = 1;",
  metadata: {
    source: "/project/index.ts",
    relativePath: "index.ts",
    fileHash: "file-hash",
    contentHash: "content-hash",
    chunkIndex: 0,
    chunkCount: 1,
    startLine: 1,
    endLine: 1,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createEmbeddings.mockReturnValue({
    embedDocuments: mocks.embedDocuments,
  });
  mocks.embedDocuments.mockResolvedValue([[0.1, 0.2]]);
  mocks.fetch.mockResolvedValue({ records: {} });
  mocks.upsert.mockResolvedValue(undefined);
  mocks.deleteMany.mockResolvedValue(undefined);
});

describe("Pinecone incremental synchronization", () => {
  it("keeps vector IDs stable so changed content overwrites old vectors", () => {
    const original = chunkVectorId(chunk, options);
    expect(chunkVectorId({ ...chunk, text: `${chunk.text}\n` }, options)).toBe(
      original,
    );
    expect(
      chunkVectorId(chunk, {
        ...options,
        embeddings: { model: "another-model" },
      }),
    ).toBe(original);
  });

  it("deletes only vectors absent from the new completed index", () => {
    expect(
      findStaleVectorIds(["kept", "removed"], new Set(["kept", "added"])),
    ).toEqual(["removed"]);
  });

  it("does not embed or upsert an unchanged chunk", async () => {
    const id = chunkVectorId(chunk, options);
    mocks.listPaginated.mockResolvedValue({ vectors: [{ id }] });
    mocks.fetch.mockResolvedValue({
      records: {
        [id]: {
          id,
          values: [],
          metadata: {
            contentHash: chunk.metadata.contentHash,
            embeddingFingerprint: "text-embedding-3-small:default",
          },
        },
      },
    });

    await expect(buildIndex([chunk], options)).resolves.toMatchObject({
      totalCount: 1,
      upsertedCount: 0,
      skippedCount: 1,
    });
    expect(mocks.createEmbeddings).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("re-embeds when the stored embedding configuration differs", async () => {
    const id = chunkVectorId(chunk, options);
    mocks.listPaginated.mockResolvedValue({ vectors: [{ id }] });
    mocks.fetch.mockResolvedValue({
      records: {
        [id]: {
          id,
          values: [],
          metadata: {
            contentHash: chunk.metadata.contentHash,
            embeddingFingerprint: "old-model:default",
          },
        },
      },
    });

    await expect(buildIndex([chunk], options)).resolves.toMatchObject({
      upsertedCount: 1,
      skippedCount: 0,
    });
    expect(mocks.embedDocuments).toHaveBeenCalledWith([chunk.text]);
  });

  it("embeds changed chunks before deleting their stale vectors", async () => {
    mocks.listPaginated.mockResolvedValue({
      vectors: [{ id: "old-vector" }],
    });

    await expect(replaceIndex([chunk], options)).resolves.toMatchObject({
      totalCount: 1,
      upsertedCount: 1,
      skippedCount: 0,
      deletedCount: 1,
    });
    expect(mocks.embedDocuments).toHaveBeenCalledWith([chunk.text]);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.deleteMany).toHaveBeenCalledWith(["old-vector"]);
    expect(mocks.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteMany.mock.invocationCallOrder[0],
    );
  });
});
