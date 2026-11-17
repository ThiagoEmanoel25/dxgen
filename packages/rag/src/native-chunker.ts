import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { chunkProjectFiles } from "./chunker.js";
import { getRagEnvConfig } from "./env.js";
import { scanProjectFiles } from "./file-scanner.js";
import type { ChunkOptions, FileChunk, ScanOptions } from "./types.js";

const execFileAsync = promisify(execFile);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFileChunk = (value: unknown): value is FileChunk =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.text === "string" &&
  isRecord(value.metadata) &&
  typeof value.metadata.source === "string" &&
  typeof value.metadata.relativePath === "string" &&
  typeof value.metadata.chunkIndex === "number" &&
  typeof value.metadata.chunkCount === "number" &&
  typeof value.metadata.startLine === "number" &&
  typeof value.metadata.endLine === "number" &&
  ["code", "config", "docs", "test", "other"].includes(
    String(value.metadata.fileType),
  ) &&
  typeof value.metadata.isConfig === "boolean" &&
  typeof value.metadata.isPackageJson === "boolean" &&
  typeof value.metadata.isReadme === "boolean" &&
  typeof value.metadata.isEnvExample === "boolean" &&
  typeof value.metadata.isCiConfig === "boolean";

export function parseRustRagOutput(stdout: string): FileChunk[] {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Rust RAG chunker returned invalid JSON");
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.chunks) ||
    !value.chunks.every(isFileChunk)
  ) {
    throw new Error("Rust RAG chunker returned an incompatible schema");
  }
  return value.chunks;
}

export async function chunkProjectWithRust(
  rootDir: string,
  binaryPath: string,
  options: ChunkOptions = {},
): Promise<FileChunk[]> {
  const args = [rootDir];
  if (options.chunkSize !== undefined) {
    args.push("--chunk-size", String(options.chunkSize));
  }
  if (options.chunkOverlap !== undefined) {
    args.push("--chunk-overlap", String(options.chunkOverlap));
  }

  try {
    const { stdout } = await execFileAsync(binaryPath, args, {
      encoding: "utf8",
      maxBuffer: 500 * 1024 * 1024,
      timeout: 60_000,
    });
    return parseRustRagOutput(stdout);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Rust RAG chunker")
    ) {
      throw error;
    }
    const stderr =
      isRecord(error) && typeof error.stderr === "string"
        ? error.stderr.trim()
        : "";
    throw new Error(
      `Rust RAG chunker failed: ${stderr || (error instanceof Error ? error.message : String(error))}`,
    );
  }
}

export async function prepareProjectChunks(
  rootDir: string,
  scanOptions?: Omit<ScanOptions, "rootDir">,
  chunkOptions: ChunkOptions = {},
): Promise<FileChunk[]> {
  const nativePath = process.env.DXGEN_RAG_PATH;
  const hasCustomScanOptions =
    scanOptions !== undefined &&
    Object.values(scanOptions).some((value) => value !== undefined);
  const envConfig = getRagEnvConfig();
  const resolvedChunkOptions = {
    chunkSize: chunkOptions.chunkSize ?? envConfig.chunkSize,
    chunkOverlap: chunkOptions.chunkOverlap ?? envConfig.chunkOverlap,
  };

  if (nativePath && !hasCustomScanOptions) {
    try {
      return await chunkProjectWithRust(
        rootDir,
        nativePath,
        resolvedChunkOptions,
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("DXGEN_RAG_UNSUPPORTED_UTF16_SPLIT")
      ) {
        throw error;
      }
    }
  }

  const { files } = await scanProjectFiles({ rootDir, ...scanOptions });
  return chunkProjectFiles(files, resolvedChunkOptions);
}
