import type { Document } from "@langchain/core/documents";
import { ChatOpenAI } from "@langchain/openai";
// No "dotenv/config" here: it re-read .env on import and undid whatever the
// application had already decided about the environment -- including the
// tracing flags the CLI clears before rendering. Both consumers (the CLI and
// the GitHub app) load .env themselves, first thing.
import { getAiEnvConfig } from "../env.js";
import type { FormatContextOptions, InvokeOptions } from "../types";

let model: ChatOpenAI | undefined;

export function getChatModel(): ChatOpenAI {
  if (model) return model;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required. Define it in .env before generating docs.",
    );
  }
  const envConfig = getAiEnvConfig();
  model = new ChatOpenAI({
    model: envConfig.openaiModel,
    apiKey,
    temperature: envConfig.temperature,
    maxRetries: envConfig.maxRetries,
    timeout: 60_000,
  });
  return model;
}

export function formatContext(
  documents: Document[],
  options: FormatContextOptions = {},
): string {
  const envConfig = getAiEnvConfig();
  const maxEntries = options.maxEntries ?? envConfig.maxEntriesDefault;
  const maxCharsPerEntry =
    options.maxCharsPerEntry ?? envConfig.maxCharsPerEntryDefault;

  return documents
    .slice(0, maxEntries)
    .map((doc, index) => {
      const identifier =
        (typeof doc.metadata?.path === "string" && doc.metadata.path) ||
        (typeof doc.metadata?.source === "string" && doc.metadata.source) ||
        `Snippet ${index + 1}`;

      const score =
        typeof doc.metadata?.score === "number"
          ? ` (score: ${doc.metadata.score.toFixed(2)})`
          : "";

      const trimmedContent =
        doc.pageContent.length > maxCharsPerEntry
          ? `${doc.pageContent.slice(0, maxCharsPerEntry)}…`
          : doc.pageContent;

      return [
        `### ${identifier}${score}`,
        "```",
        trimmedContent.trim(),
        "```",
      ].join("\n");
    })
    .join("\n\n");
}

export async function invokeLLM({ prompt, tags, metadata }: InvokeOptions) {
  const response = await getChatModel().invoke(prompt, {
    tags,
    metadata,
  });

  return response;
}
