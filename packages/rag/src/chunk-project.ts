#!/usr/bin/env node

import { parseArgs } from "node:util";

import { chunkProjectFiles } from "./chunker.js";
import { scanProjectFiles } from "./file-scanner.js";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "chunk-size": { type: "string", default: "1500" },
      "chunk-overlap": { type: "string", default: "200" },
    },
  });
  if (positionals.length !== 1) {
    throw new Error(
      "Usage: chunk-project <repository-path> [--chunk-size 1500] [--chunk-overlap 200]",
    );
  }
  const chunkSize = Number(values["chunk-size"]);
  const chunkOverlap = Number(values["chunk-overlap"]);
  if (
    !Number.isInteger(chunkSize) ||
    chunkSize < 1 ||
    !Number.isInteger(chunkOverlap) ||
    chunkOverlap < 0 ||
    chunkOverlap >= chunkSize
  ) {
    throw new Error(
      "chunk size must be positive and chunk overlap must be smaller",
    );
  }

  const { files } = await scanProjectFiles({ rootDir: positionals[0] });
  const chunks = await chunkProjectFiles(files, { chunkSize, chunkOverlap });
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, chunks })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
