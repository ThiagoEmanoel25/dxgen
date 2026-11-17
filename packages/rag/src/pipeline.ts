import { prepareProjectChunks } from "./native-chunker.js";
import { buildIndex, replaceIndex } from "./pinecone-sync.js";
import { createRetriever } from "./retriever.js";
import type {
  RagPipelineOptions,
  RagPipelineResult,
  SyncOptions,
  SyncSummary,
} from "./types.js";

export const runRagPipeline = async (
  options: RagPipelineOptions,
): Promise<RagPipelineResult> => {
  const { rootDir, query } = options;
  if (!rootDir) {
    throw new Error("rootDir is required to run the RAG pipeline");
  }

  let syncSummary: SyncSummary | undefined;

  if (options.sync?.enabled) {
    const chunks = await prepareProjectChunks(
      rootDir,
      options.scanOptions,
      options.chunkOptions,
    );

    const syncOptions: SyncOptions = {
      pinecone: options.pinecone,
      embeddings: options.embeddings,
      context: options.context,
      chunkOptions: options.chunkOptions,
    };

    syncSummary = options.sync.fullReindex
      ? await replaceIndex(chunks, syncOptions)
      : await buildIndex(chunks, syncOptions);
  }

  const retriever = createRetriever({
    pinecone: options.pinecone,
    context: options.context,
    embeddings: options.embeddings,
    ...options.retrieverOptions,
  });

  const documents = await retriever._getRelevantDocuments(query);

  return { documents, syncSummary };
};
