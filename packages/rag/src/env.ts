import { z } from "zod";

const optionalInteger = (minimum: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().int().min(minimum).optional(),
  );

/**
 * Environment variable schema for RAG package configuration.
 * All values have fallbacks to ensure the system works without explicit configuration.
 */
const ragEnvSchema = z.object({
  // Chunking configuration
  RAG_CHUNK_SIZE: optionalInteger(1),
  RAG_CHUNK_OVERLAP: optionalInteger(0),

  // Retrieval configuration
  RAG_TOP_K_DEFAULT: optionalInteger(1),
  RAG_TOP_K_README: optionalInteger(1),

  // Embedding model configuration
  RAG_EMBEDDING_MODEL: z.string().optional(),
});

/**
 * Validated and parsed RAG environment configuration with fallbacks.
 */
export interface RagEnvConfig {
  chunkSize: number;
  chunkOverlap: number;
  topKDefault: number;
  topKReadme: number;
  embeddingModel: string;
}

/**
 * Parse and validate RAG environment variables with fallbacks.
 */
export function getRagEnvConfig(): RagEnvConfig {
  const raw = ragEnvSchema.parse(process.env);
  const config = {
    chunkSize: raw.RAG_CHUNK_SIZE ?? 1500,
    chunkOverlap: raw.RAG_CHUNK_OVERLAP ?? 200,
    topKDefault: raw.RAG_TOP_K_DEFAULT ?? 25,
    topKReadme: raw.RAG_TOP_K_README ?? 35,
    embeddingModel: raw.RAG_EMBEDDING_MODEL ?? "text-embedding-3-small",
  };
  if (config.chunkOverlap >= config.chunkSize) {
    throw new Error("RAG_CHUNK_OVERLAP must be smaller than RAG_CHUNK_SIZE");
  }
  return config;
}
