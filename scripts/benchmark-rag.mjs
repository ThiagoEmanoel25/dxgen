import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = process.argv.slice(2);
const take = (name) => {
  const index = args.indexOf(name);
  return index < 0 || !args[index + 1] ? undefined : args.splice(index, 2)[1];
};
const outputPath = take("--output");
const runs = Number(take("--runs") ?? 20);
const warmups = Number(take("--warmups") ?? 3);
if (!outputPath || !Number.isInteger(runs) || runs < 1 || !Number.isInteger(warmups) || warmups < 0) {
  throw new Error("Usage: node scripts/benchmark-rag.mjs --output <file.json> [--runs 20] [--warmups 3] <alias=repository>...");
}
const repositories = args.map((value) => {
  const separator = value.indexOf("=");
  if (separator < 1) throw new Error(`Invalid corpus entry: ${value}`);
  const repositoryPath = path.resolve(value.slice(separator + 1));
  if (!statSync(repositoryPath).isDirectory()) throw new Error(`Not a directory: ${repositoryPath}`);
  return { name: value.slice(0, separator), path: repositoryPath };
});
if (repositories.length < 1) throw new Error("At least one corpus repository is required");

const rustBinary = path.join(root, "target/release/dxgen-rag");
if (!statSync(rustBinary).isFile()) throw new Error("Build Rust first: cargo build --release -p dxgen-rag");
const implementations = {
  typescript: {
    command: process.execPath,
    args: ["--import", "tsx", "packages/rag/src/chunk-project.ts"],
  },
  rust: { command: rustBinary, args: [] },
};
const commandArgs = (implementation, repositoryPath) => [
  ...implementations[implementation].args,
  repositoryPath,
  "--chunk-size", "1500",
  "--chunk-overlap", "200",
];
const runChunker = (implementation, repositoryPath) => {
  const config = implementations[implementation];
  const result = spawnSync(config.command, commandArgs(implementation, repositoryPath), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 500 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || `${implementation} exited ${result.status}`);
  return result.stdout;
};
const parseTiming = (stderr) => {
  const user = stderr.match(/^user\s+([\d.]+)/m)?.[1];
  const sys = stderr.match(/^sys\s+([\d.]+)/m)?.[1];
  const rss = process.platform === "darwin"
    ? stderr.match(/^\s*(\d+)\s+maximum resident set size/m)?.[1]
    : stderr.match(/^\s*Maximum resident set size \(kbytes\):\s*(\d+)/m)?.[1];
  if (!user || !sys || !rss) throw new Error(`Could not parse /usr/bin/time output:\n${stderr}`);
  return {
    cpuSeconds: Number(user) + Number(sys),
    peakRssBytes: Number(rss) * (process.platform === "darwin" ? 1 : 1024),
  };
};
const measure = (implementation, repositoryPath) => {
  const config = implementations[implementation];
  const startedAt = process.hrtime.bigint();
  const result = spawnSync("/usr/bin/time", [
    ...(process.platform === "darwin" ? ["-lp"] : ["-v"]),
    config.command,
    ...commandArgs(implementation, repositoryPath),
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || `${implementation} exited ${result.status}`);
  return {
    wallSeconds: Number(process.hrtime.bigint() - startedAt) / 1e9,
    ...parseTiming(result.stderr),
  };
};
const percentile = (values, ratio) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * ratio) - 1];
const summarize = (samples) => ({
  medianWallSeconds: percentile(samples.map((sample) => sample.wallSeconds), 0.5),
  p95WallSeconds: percentile(samples.map((sample) => sample.wallSeconds), 0.95),
  medianCpuSeconds: percentile(samples.map((sample) => sample.cpuSeconds), 0.5),
  peakRssBytes: Math.max(...samples.map((sample) => sample.peakRssBytes)),
});
const commandOutput = (command, commandArgs) => {
  try { return execFileSync(command, commandArgs, { encoding: "utf8" }).trim(); }
  catch { return "unavailable"; }
};
const normalize = (output) => {
  const parsed = JSON.parse(output);
  parsed.chunks.sort((left, right) =>
    left.metadata.relativePath.localeCompare(right.metadata.relativePath) ||
    left.metadata.chunkIndex - right.metadata.chunkIndex,
  );
  return `${JSON.stringify(parsed)}\n`;
};

const results = [];
for (const repository of repositories) {
  process.stderr.write(`Benchmarking ${repository.name}\n`);
  const outputs = Object.fromEntries(Object.keys(implementations).map((implementation) => [
    implementation,
    runChunker(implementation, repository.path),
  ]));
  const normalized = Object.fromEntries(Object.entries(outputs).map(([implementation, output]) => [implementation, normalize(output)]));
  assert.equal(normalized.rust, normalized.typescript, `${repository.name}: chunk output differs`);
  const samples = { typescript: [], rust: [] };
  for (let index = 0; index < warmups + runs; index += 1) {
    const order = index % 2 === 0 ? ["typescript", "rust"] : ["rust", "typescript"];
    for (const implementation of order) {
      const sample = measure(implementation, repository.path);
      if (index >= warmups) samples[implementation].push(sample);
    }
  }
  const parsed = JSON.parse(normalized.typescript);
  results.push({
    repository: repository.name,
    revision: commandOutput("git", ["-C", repository.path, "rev-parse", "HEAD"]),
    chunkCount: parsed.chunks.length,
    outputBytes: Buffer.byteLength(normalized.typescript),
    outputSha256: createHash("sha256").update(normalized.typescript).digest("hex"),
    typescript: summarize(samples.typescript),
    rust: summarize(samples.rust),
  });
}

writeFileSync(outputPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  protocol: { warmups, runs, filesystemCache: "warm", order: "alternating" },
  environment: {
    platform: `${process.platform} ${process.arch}`,
    os: commandOutput("sw_vers", ["-productVersion"]),
    cpu: commandOutput("sysctl", ["-n", "machdep.cpu.brand_string"]),
    logicalCores: Number(commandOutput("sysctl", ["-n", "hw.logicalcpu"])) || "unavailable",
    memoryBytes: Number(commandOutput("sysctl", ["-n", "hw.memsize"])) || "unavailable",
    node: process.version,
    npm: commandOutput("npm", ["--version"]),
    rust: commandOutput("rustc", ["--version"]),
    sourceRevision: commandOutput("git", ["rev-parse", "HEAD"]),
    rustBinaryBytes: statSync(rustBinary).size,
    nodeExecutableBytes: statSync(process.execPath).size,
  },
  results,
}, null, 2)}\n`);
process.stdout.write(`Benchmark written to ${outputPath}\n`);
