import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const chunkArgs = ["--chunk-size", "48", "--chunk-overlap", "12"];

const run = (command, args) =>
  spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 500 * 1024 * 1024,
  });

const parseSuccessful = (result) => {
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
};

const compare = (fixture) => {
  const typescript = parseSuccessful(
    run("npm", [
      "run",
      "--silent",
      "chunk-project",
      "--workspace",
      "@repo/rag",
      "--",
      fixture,
      ...chunkArgs,
    ]),
  );
  const rust = parseSuccessful(
    run(process.env.CARGO || "cargo", [
      "run",
      "--quiet",
      "-p",
      "dxgen-rag",
      "--",
      fixture,
      ...chunkArgs,
    ]),
  );
  const byChunk = (left, right) =>
    left.metadata.relativePath.localeCompare(right.metadata.relativePath) ||
    left.metadata.chunkIndex - right.metadata.chunkIndex;
  rust.chunks.sort(byChunk);
  typescript.chunks.sort(byChunk);
  assert.deepStrictEqual(rust, typescript);
};

compare(path.join(root, "packages/ai/test/fixtures/baseline"));

const edgeFixture = await mkdtemp(path.join(os.tmpdir(), "dxgen-rag-parity-"));
try {
  await mkdir(path.join(edgeFixture, "src"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(edgeFixture, "src/index.ts"),
      "const greeting = 'olá 🌎';\n\nexport function greet() {\n  return greeting;\n}\n".repeat(3),
    ),
    writeFile(
      path.join(edgeFixture, "README.md"),
      "# Example\n\nA paragraph with words that exercises recursive splitting.\n",
    ),
    writeFile(path.join(edgeFixture, "ignored.txt"), "not scanned\n"),
  ]);
  compare(edgeFixture);
} finally {
  await rm(edgeFixture, { recursive: true, force: true });
}

process.stdout.write("RAG scan/chunk parity: OK\n");
