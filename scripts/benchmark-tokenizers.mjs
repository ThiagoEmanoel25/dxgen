import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const take = (name) => {
  const index = args.indexOf(name);
  return index < 0 || !args[index + 1] ? undefined : args.splice(index, 2)[1];
};
const repositoryPath = take("--repository");
const outputPath = take("--output");
const runs = Number(take("--runs") ?? 20);
const warmups = Number(take("--warmups") ?? 3);
if (
  !repositoryPath ||
  !outputPath ||
  !Number.isInteger(runs) ||
  runs < 1 ||
  !Number.isInteger(warmups) ||
  warmups < 0
) {
  throw new Error(
    "Usage: node scripts/benchmark-tokenizers.mjs --repository <path> --output <result.json> [--runs 20] [--warmups 3]",
  );
}

const root = process.cwd();
const rustBinary = path.join(root, "target/release/dxgen-rag");
if (!statSync(rustBinary).isFile()) {
  throw new Error(
    "Build Rust first: cargo build --release -p dxgen-rag --features tokenize",
  );
}
const chunkResult = spawnSync(rustBinary, [path.resolve(repositoryPath)], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 500 * 1024 * 1024,
});
if (chunkResult.status !== 0) throw new Error(chunkResult.stderr);
const ragOutput = JSON.parse(chunkResult.stdout);
const input = JSON.stringify({
  texts: ragOutput.chunks.map((chunk) => chunk.text),
});
const implementations = {
  javascript: { command: process.execPath, args: ["scripts/tokenize-js.mjs"] },
  rust: { command: rustBinary, args: ["--tokenize"] },
};

const run = (implementation, captureOutput) => {
  const config = implementations[implementation];
  const command = captureOutput ? config.command : "/usr/bin/time";
  const commandArgs = captureOutput
    ? config.args
    : [
        ...(process.platform === "darwin" ? ["-lp"] : ["-v"]),
        config.command,
        ...config.args,
      ];
  const startedAt = process.hrtime.bigint();
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    input,
    maxBuffer: 500 * 1024 * 1024,
    stdio: ["pipe", captureOutput ? "pipe" : "ignore", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      result.stderr || `${implementation} exited ${result.status}`,
    );
  }
  if (captureOutput) return result.stdout;
  const user = result.stderr.match(/^user\s+([\d.]+)/m)?.[1];
  const sys = result.stderr.match(/^sys\s+([\d.]+)/m)?.[1];
  const rss =
    process.platform === "darwin"
      ? result.stderr.match(/^\s*(\d+)\s+maximum resident set size/m)?.[1]
      : result.stderr.match(
          /^\s*Maximum resident set size \(kbytes\):\s*(\d+)/m,
        )?.[1];
  if (!user || !sys || !rss)
    throw new Error(`Could not parse time output:\n${result.stderr}`);
  return {
    wallSeconds: Number(process.hrtime.bigint() - startedAt) / 1e9,
    cpuSeconds: Number(user) + Number(sys),
    peakRssBytes: Number(rss) * (process.platform === "darwin" ? 1 : 1024),
  };
};

const outputs = Object.fromEntries(
  Object.keys(implementations).map((implementation) => [
    implementation,
    JSON.parse(run(implementation, true)),
  ]),
);
assert.deepStrictEqual(
  outputs.rust,
  outputs.javascript,
  "Tokenizer outputs differ",
);
const percentile = (values, ratio) =>
  [...values].sort((left, right) => left - right)[
    Math.ceil(values.length * ratio) - 1
  ];
const samples = { javascript: [], rust: [] };
for (let index = 0; index < warmups + runs; index += 1) {
  const order =
    index % 2 === 0 ? ["javascript", "rust"] : ["rust", "javascript"];
  for (const implementation of order) {
    const sample = run(implementation, false);
    if (index >= warmups) samples[implementation].push(sample);
  }
}
const summarize = (values) => ({
  medianWallSeconds: percentile(
    values.map((value) => value.wallSeconds),
    0.5,
  ),
  p95WallSeconds: percentile(
    values.map((value) => value.wallSeconds),
    0.95,
  ),
  medianCpuSeconds: percentile(
    values.map((value) => value.cpuSeconds),
    0.5,
  ),
  peakRssBytes: Math.max(...values.map((value) => value.peakRssBytes)),
});
const tokenCount = outputs.javascript.tokens.reduce(
  (total, tokens) => total + tokens.length,
  0,
);
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      protocol: {
        warmups,
        runs,
        order: "alternating",
        boundary: "JSON stdin/stdout",
      },
      corpus: {
        chunks: ragOutput.chunks.length,
        inputBytes: Buffer.byteLength(input),
        tokenCount,
      },
      javascript: summarize(samples.javascript),
      rust: summarize(samples.rust),
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`Tokenizer benchmark written to ${outputPath}\n`);
