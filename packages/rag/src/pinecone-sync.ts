import crypto from "node:crypto";

import type { Embeddings } from "@langchain/core/embeddings";
import type { PineconeRecord } from "@pinecone-database/pinecone";

import { createEmbeddings } from "./embeddings.js";
import { getIndexForContext } from "./pinecone-utils.js";
import type { FileChunk, SyncOptions, SyncSummary } from "./types.js";

export const chunkVectorId = (chunk: FileChunk, options: SyncOptions) =>
  crypto
    .createHash("sha256")
    .update(
      [
        options.context.userId,
        options.context.projectId,
        chunk.metadata.relativePath,
        String(chunk.metadata.chunkIndex),
      ].join("\0"),
    )
    .digest("hex");

const buildMetadata = (chunk: FileChunk, options: SyncOptions) => {
  const metadata: Record<string, string | number | boolean> = {
    userId: options.context.userId,
    projectId: options.context.projectId,
    text: chunk.text,
    relativePath: chunk.metadata.relativePath,
    fileHash: chunk.metadata.fileHash,
    contentHash: chunk.metadata.contentHash,
    chunkIndex: chunk.metadata.chunkIndex,
    chunkCount: chunk.metadata.chunkCount,
    startLine: chunk.metadata.startLine,
    endLine: chunk.metadata.endLine,
    embeddingFingerprint: [
      options.embeddings?.model ??
        process.env.RAG_EMBEDDING_MODEL ??
        "text-embedding-3-small",
      String(options.embeddings?.dimensions ?? "default"),
    ].join(":"),
  };

  if (chunk.metadata.fileType) metadata.fileType = chunk.metadata.fileType;
  if (typeof chunk.metadata.isConfig === "boolean") {
    metadata.isConfig = chunk.metadata.isConfig;
  }
  if (typeof chunk.metadata.isPackageJson === "boolean") {
    metadata.isPackageJson = chunk.metadata.isPackageJson;
  }
  if (typeof chunk.metadata.isReadme === "boolean") {
    metadata.isReadme = chunk.metadata.isReadme;
  }
  if (typeof chunk.metadata.isEnvExample === "boolean") {
    metadata.isEnvExample = chunk.metadata.isEnvExample;
  }
  if (typeof chunk.metadata.isCiConfig === "boolean") {
    metadata.isCiConfig = chunk.metadata.isCiConfig;
  }

  if (options.context.branch) metadata.branch = options.context.branch;
  if (options.context.commitSha) metadata.commitSha = options.context.commitSha;

  if (options.context.extraMetadata) {
    Object.entries(options.context.extraMetadata).forEach(([key, value]) => {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        metadata[key] = value;
      }
    });
  }

  return metadata;
};

const embedChunks = async (
  chunks: FileChunk[],
  embeddings: Embeddings,
): Promise<number[][]> => {
  if (chunks.length === 0) return [];
  return embeddings.embedDocuments(chunks.map((chunk) => chunk.text));
};

const calculateBatchSize = (records: PineconeRecord[]): number => {
  try {
    const payload = {
      vectors: records.map((r) => ({
        id: r.id,
        values: r.values || [],
        metadata: r.metadata,
      })),
    };
    return Buffer.byteLength(JSON.stringify(payload), "utf8");
  } catch {
    return records.reduce((size, record) => {
      const idSize = Buffer.byteLength(record.id, "utf8");
      const valuesSize = (record.values?.length ?? 0) * 4; // float32 = 4 bytes
      const metadataSize = JSON.stringify(record.metadata || {}).length;
      return size + idSize + valuesSize + metadataSize + 100; // +100 to overhead
    }, 0);
  }
};

const batchRecords = (
  records: PineconeRecord[],
  maxSizeBytes: number = 3_500_000,
): PineconeRecord[][] => {
  if (records.length === 0) return [];

  const batches: PineconeRecord[][] = [];
  let currentBatch: PineconeRecord[] = [];

  for (const record of records) {
    const recordSize = calculateBatchSize([record]);
    if (recordSize > maxSizeBytes) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
      }
      console.warn(
        `⚠️  Record ${record.id} exceeds the size limit (${recordSize} bytes). Trying to send anyway.`,
      );
      batches.push([record]);
      continue;
    }

    const testBatch = [...currentBatch, record];
    const testBatchSize = calculateBatchSize(testBatch);

    if (testBatchSize > maxSizeBytes && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [record];
    } else {
      currentBatch.push(record);
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};

const listExistingVectorIds = async (
  index: ReturnType<typeof getIndexForContext>["index"],
) => {
  const existingIds: string[] = [];
  let paginationToken: string | undefined;
  do {
    const page = await index.listPaginated(
      paginationToken ? { paginationToken } : undefined,
    );
    existingIds.push(
      ...(page.vectors ?? [])
        .map((vector) => vector.id)
        .filter((id): id is string => typeof id === "string"),
    );
    paginationToken = page.pagination?.next;
  } while (paginationToken);
  return existingIds;
};

const fetchExistingMetadata = async (
  index: ReturnType<typeof getIndexForContext>["index"],
  ids: string[],
) => {
  const metadata = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < ids.length; offset += 1_000) {
    const response = await index.fetch(ids.slice(offset, offset + 1_000));
    for (const [id, record] of Object.entries(response.records)) {
      metadata.set(id, record.metadata ?? {});
    }
  }
  return metadata;
};

const prepareRecords = async (chunks: FileChunk[], options: SyncOptions) => {
  const { index, namespace } = getIndexForContext(
    options.pinecone,
    options.context,
  );
  const existingIds = await listExistingVectorIds(index);
  const existingIdSet = new Set(existingIds);
  const candidates = chunks.map((chunk) => ({
    chunk,
    id: chunkVectorId(chunk, options),
  }));
  const existingMetadata = await fetchExistingMetadata(
    index,
    candidates.map(({ id }) => id).filter((id) => existingIdSet.has(id)),
  );
  const expectedEmbeddingFingerprint = [
    options.embeddings?.model ??
      process.env.RAG_EMBEDDING_MODEL ??
      "text-embedding-3-small",
    String(options.embeddings?.dimensions ?? "default"),
  ].join(":");
  const pending = candidates.filter(({ chunk, id }) => {
    const metadata = existingMetadata.get(id);
    return (
      metadata?.contentHash !== chunk.metadata.contentHash ||
      metadata?.embeddingFingerprint !== expectedEmbeddingFingerprint
    );
  });
  const values =
    pending.length === 0
      ? []
      : await embedChunks(
          pending.map(({ chunk }) => chunk),
          createEmbeddings(options.embeddings),
        );
  const records: PineconeRecord[] = values.map((vector, index) => ({
    id: pending[index].id,
    values: vector,
    metadata: buildMetadata(pending[index].chunk, options),
  }));
  return {
    index,
    namespace,
    records,
    existingIds,
    currentIds: new Set(candidates.map(({ id }) => id)),
    skippedCount: candidates.length - pending.length,
  };
};

const upsertRecords = async (
  index: Awaited<ReturnType<typeof prepareRecords>>["index"],
  records: PineconeRecord[],
) => {
  const batches = batchRecords(records);
  let totalUpserted = 0;

  for (let indexPosition = 0; indexPosition < batches.length; indexPosition++) {
    const batch = batches[indexPosition];
    try {
      await index.upsert(batch);
      totalUpserted += batch.length;
    } catch (error) {
      const err = error as Error;
      if (
        !err.message.includes("message length too large") &&
        !err.message.includes("too large")
      ) {
        throw error;
      }
      const halfSize = Math.ceil(batch.length / 2);
      for (const subBatch of [
        batch.slice(0, halfSize),
        batch.slice(halfSize),
      ].filter((value) => value.length > 0)) {
        await index.upsert(subBatch);
        totalUpserted += subBatch.length;
      }
    }
  }
  return totalUpserted;
};

export const findStaleVectorIds = (
  existingIds: string[],
  currentIds: Set<string>,
) => existingIds.filter((id) => !currentIds.has(id));

const deleteStaleRecords = async (
  index: Awaited<ReturnType<typeof prepareRecords>>["index"],
  existingIds: string[],
  currentIds: Set<string>,
) => {
  const staleIds = findStaleVectorIds(existingIds, currentIds);
  for (let offset = 0; offset < staleIds.length; offset += 1_000) {
    await index.deleteMany(staleIds.slice(offset, offset + 1_000));
  }
  return staleIds.length;
};

export async function buildIndex(
  chunks: FileChunk[],
  options: SyncOptions,
): Promise<SyncSummary> {
  const { index, namespace, records, skippedCount } = await prepareRecords(
    chunks,
    options,
  );
  const totalUpserted = await upsertRecords(index, records);

  return {
    index: options.pinecone.index,
    namespace,
    totalCount: chunks.length,
    upsertedCount: totalUpserted,
    skippedCount,
    deletedCount: 0,
  };
}

export async function replaceIndex(
  chunks: FileChunk[],
  options: SyncOptions,
): Promise<SyncSummary> {
  const { index, namespace, records, existingIds, currentIds, skippedCount } =
    await prepareRecords(chunks, options);
  if (records.length === 0) {
    const deletedCount = await deleteStaleRecords(
      index,
      existingIds,
      currentIds,
    );
    return {
      index: options.pinecone.index,
      namespace,
      totalCount: chunks.length,
      upsertedCount: 0,
      skippedCount,
      deletedCount,
    };
  }
  const upsertedCount = await upsertRecords(index, records);
  const deletedCount = await deleteStaleRecords(index, existingIds, currentIds);
  return {
    index: options.pinecone.index,
    namespace,
    totalCount: chunks.length,
    upsertedCount,
    skippedCount,
    deletedCount,
  };
}

export async function syncChunksToPinecone(
  chunks: FileChunk[],
  options: SyncOptions,
): Promise<SyncSummary> {
  return buildIndex(chunks, options);
}

export async function resetPineconeNamespace(options: SyncOptions) {
  const { index } = getIndexForContext(options.pinecone, options.context);
  try {
    await index.deleteAll();
  } catch (error) {
    const err = error as Error & { status?: number };
    const isNotFound =
      err?.name === "PineconeNotFoundError" || err?.status === 404;

    if (isNotFound) {
      return;
    }

    throw error;
  }
}
