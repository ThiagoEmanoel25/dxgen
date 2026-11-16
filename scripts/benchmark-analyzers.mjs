import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const args = process.argv.slice(2);
const take = (name) => {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) return undefined;
  return args.splice(index, 2)[1];
};
const outputPath = take("--output");
const runs = Number(take("--runs") ?? 20);
const warmups = Number(take("--warmups") ?? 3);
if (
  !outputPath ||
  !Number.isInteger(runs) ||
  runs < 1 ||
  !Number.isInteger(warmups) ||
  warmups < 0
) {
  throw new Error(
    "Usage: node scripts/benchmark-analyzers.mjs --output <file.json> [--runs 20] [--warmups 3] <alias=repository>...",
  );
}

const repositories = args.map((value) => {
  const separator = value.indexOf("=");
  if (separator < 1) throw new Error(`Invalid corpus entry: ${value}`);
  const name = value.slice(0, separator);
  const repositoryPath = path.resolve(value.slice(separator + 1));
  if (!statSync(repositoryPath).isDirectory())
    throw new Error(`Not a directory: ${repositoryPath}`);
  return { name, path: repositoryPath };
});
if (repositories.length < 1)
  throw new Error("At least one corpus repository is required");

const rustBinary = path.join(root, "target/release/dxgen-analyze");
if (!statSync(rustBinary).isFile())
  throw new Error("Build Rust first: cargo build --release -p dxgen-analyze");

const implementations = {
  typescript: {
    command: process.execPath,
    args: [
      "--conditions=source",
      "--import",
      "tsx",
      "packages/ai/src/analyze.ts",
    ],
  },
  rust: { command: rustBinary, args: [] },
};

const analyzerArgs = (implementation, repositoryPath, format = "json") => [
  ...implementations[implementation].args,
  repositoryPath,
  "--max-depth",
  "3",
  "--format",
  format,
];

const runAnalyzer = (implementation, repositoryPath) => {
  const config = implementations[implementation];
  const result = spawnSync(
    config.command,
    analyzerArgs(implementation, repositoryPath),
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 200,
    },
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr || `${implementation} exited ${result.status}`,
    );
  return result.stdout;
};

const runFileManifest = (implementation, repositoryPath) => {
  const config = implementations[implementation];
  const result = spawnSync(
    config.command,
    analyzerArgs(implementation, repositoryPath, "files"),
    { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 200 },
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr || `${implementation} exited ${result.status}`,
    );
  return JSON.parse(result.stdout);
};

const normalize = (json) => {
  const parsed = JSON.parse(json);
  parsed.rootPath = "<ROOT>";
  return `${JSON.stringify(parsed)}\n`;
};

const parseTiming = (stderr) => {
  const user = stderr.match(/^user\s+([\d.]+)/m)?.[1];
  const sys = stderr.match(/^sys\s+([\d.]+)/m)?.[1];
  const rss =
    process.platform === "darwin"
      ? stderr.match(/^\s*(\d+)\s+maximum resident set size/m)?.[1]
      : stderr.match(/^\s*Maximum resident set size \(kbytes\):\s*(\d+)/m)?.[1];
  if (!user || !sys || !rss)
    throw new Error(`Could not parse /usr/bin/time output:\n${stderr}`);
  return {
    cpuSeconds: Number(user) + Number(sys),
    peakRssBytes: Number(rss) * (process.platform === "darwin" ? 1 : 1024),
  };
};

const measure = (implementation, repositoryPath) => {
  const config = implementations[implementation];
  const timeArgs = process.platform === "darwin" ? ["-lp"] : ["-v"];
  const startedAt = process.hrtime.bigint();
  const result = spawnSync(
    "/usr/bin/time",
    [
      ...timeArgs,
      config.command,
      ...analyzerArgs(implementation, repositoryPath),
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] },
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr || `${implementation} exited ${result.status}`,
    );
  return {
    ...parseTiming(result.stderr),
    wallSeconds: Number(process.hrtime.bigint() - startedAt) / 1e9,
  };
};

const percentile = (values, ratio) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
};

const summarize = (samples) => ({
  medianWallSeconds: percentile(
    samples.map((sample) => sample.wallSeconds),
    0.5,
  ),
  p95WallSeconds: percentile(
    samples.map((sample) => sample.wallSeconds),
    0.95,
  ),
  medianCpuSeconds: percentile(
    samples.map((sample) => sample.cpuSeconds),
    0.5,
  ),
  peakRssBytes: Math.max(...samples.map((sample) => sample.peakRssBytes)),
});

const inventory = (repositoryPath, files) => ({
  fileCount: files.length,
  totalBytes: files.reduce(
    (total, relative) =>
      total + statSync(path.join(repositoryPath, relative)).size,
    0,
  ),
});

const commandOutput = (command, commandArgs) => {
  try {
    return execFileSync(command, commandArgs, { encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
};

const results = [];
for (const repository of repositories) {
  process.stderr.write(`Benchmarking ${repository.name}\n`);
  const files = runFileManifest("typescript", repository.path);
  assert.deepEqual(
    runFileManifest("rust", repository.path),
    files,
    `${repository.name}: discovered files differ`,
  );
  const outputs = Object.fromEntries(
    Object.keys(implementations).map((implementation) => [
      implementation,
      normalize(runAnalyzer(implementation, repository.path)),
    ]),
  );
  assert.equal(
    outputs.rust,
    outputs.typescript,
    `${repository.name}: analyzer output differs`,
  );
  const samples = { typescript: [], rust: [] };
  for (let index = 0; index < warmups; index += 1) {
    for (const implementation of index % 2 === 0
      ? ["typescript", "rust"]
      : ["rust", "typescript"]) {
      measure(implementation, repository.path);
    }
  }
  for (let index = 0; index < runs; index += 1) {
    for (const implementation of index % 2 === 0
      ? ["typescript", "rust"]
      : ["rust", "typescript"]) {
      samples[implementation].push(measure(implementation, repository.path));
    }
  }
  const normalized = outputs.typescript;
  results.push({
    repository: repository.name,
    revision: commandOutput("git", [
      "-C",
      repository.path,
      "rev-parse",
      "HEAD",
    ]),
    ...inventory(repository.path, files),
    outputBytes: Buffer.byteLength(normalized),
    outputSha256: createHash("sha256").update(normalized).digest("hex"),
    typescript: summarize(samples.typescript),
    rust: summarize(samples.rust),
  });
}

const startupPath = mkdtempSync(path.join(os.tmpdir(), "dxgen-startup-"));
let startup;
try {
  process.stderr.write("Benchmarking empty-fixture startup\n");
  const samples = { typescript: [], rust: [] };
  for (let index = 0; index < warmups; index += 1) {
    for (const implementation of ["typescript", "rust"])
      measure(implementation, startupPath);
  }
  for (let index = 0; index < runs; index += 1) {
    for (const implementation of index % 2 === 0
      ? ["typescript", "rust"]
      : ["rust", "typescript"])
      samples[implementation].push(measure(implementation, startupPath));
  }
  startup = {
    typescript: summarize(samples.typescript),
    rust: summarize(samples.rust),
  };
} finally {
  rmSync(startupPath, { recursive: true, force: true });
}

const report = {
  generatedAt: new Date().toISOString(),
  protocol: { warmups, runs, filesystemCache: "warm", order: "alternating" },
  environment: {
    platform: `${process.platform} ${process.arch}`,
    os: commandOutput("sw_vers", ["-productVersion"]),
    cpu: commandOutput("sysctl", ["-n", "machdep.cpu.brand_string"]),
    logicalCores:
      Number(commandOutput("sysctl", ["-n", "hw.logicalcpu"])) || "unavailable",
    memoryBytes:
      Number(commandOutput("sysctl", ["-n", "hw.memsize"])) || "unavailable",
    node: process.version,
    npm: commandOutput("npm", ["--version"]),
    rust: commandOutput("rustc", ["--version"]),
    sourceRevision: commandOutput("git", ["rev-parse", "HEAD"]),
    rustBinaryBytes: statSync(rustBinary).size,
    nodeExecutableBytes: statSync(process.execPath).size,
  },
  startup,
  results,
};

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`Benchmark written to ${outputPath}\n`);
