import { z } from "zod";

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().pipe(schema).optional(),
  );

/**
 * Environment variable schema for AI package configuration.
 * All values have fallbacks to ensure the system works without explicit configuration.
 */
const aiEnvSchema = z.object({
  // OpenAI model configuration
  AI_OPENAI_MODEL: z.string().optional(),

  // LLM generation parameters
  AI_TEMPERATURE: optionalNumber(z.number().min(0).max(2)),
  AI_MAX_RETRIES: optionalNumber(z.number().int().min(0)),

  // Context formatting defaults
  AI_MAX_ENTRIES_DEFAULT: optionalNumber(z.number().int().positive()),
  AI_MAX_CHARS_PER_ENTRY_DEFAULT: optionalNumber(z.number().int().positive()),
});

/**
 * Validated and parsed AI environment configuration with fallbacks.
 */
export interface AiEnvConfig {
  openaiModel: string;
  temperature: number;
  maxRetries: number;
  maxEntriesDefault: number;
  maxCharsPerEntryDefault: number;
}

/**
 * Parse and validate AI environment variables with fallbacks.
 */
export function getAiEnvConfig(): AiEnvConfig {
  const raw = aiEnvSchema.parse(process.env);

  return {
    openaiModel: raw.AI_OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: raw.AI_TEMPERATURE ?? 0.3,
    maxRetries: raw.AI_MAX_RETRIES ?? 3,
    maxEntriesDefault: raw.AI_MAX_ENTRIES_DEFAULT ?? 15,
    maxCharsPerEntryDefault: raw.AI_MAX_CHARS_PER_ENTRY_DEFAULT ?? 2_000,
  };
}
