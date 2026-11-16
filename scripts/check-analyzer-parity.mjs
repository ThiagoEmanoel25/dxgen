import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const run = (command, args, fixture) =>
  spawnSync(command, [...args, fixture, "--max-depth", "3", "--format", "json"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });

const typescriptArgs = [
  "run",
  "--silent",
  "analyze",
  "--workspace",
  "@repo/ai",
  "--",
];
const rustArgs = ["run", "--quiet", "-p", "dxgen-analyze", "--"];

const parseSuccessful = (result) => {
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
};

const compare = (fixture) => {
  const typescript = parseSuccessful(run("npm", typescriptArgs, fixture));
  const rust = parseSuccessful(
    run(process.env.CARGO || "cargo", rustArgs, fixture),
  );

  typescript.rootPath = "<ROOT>";
  rust.rootPath = "<ROOT>";
  assert.deepStrictEqual(rust, typescript);
};

compare(path.join(root, "packages/ai/test/fixtures/baseline"));

const edgeFixture = await mkdtemp(path.join(os.tmpdir(), "dxgen-parity-"));
try {
  await Promise.all([
    mkdir(path.join(edgeFixture, "src"), { recursive: true }),
    mkdir(path.join(edgeFixture, "node_modules"), { recursive: true }),
    mkdir(path.join(edgeFixture, "dist"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(edgeFixture, "package.json"), '{"name":"edge"}\n'),
    writeFile(path.join(edgeFixture, ".gitignore"), "ignored.ts\n"),
    writeFile(path.join(edgeFixture, "src/index.ts"), "export {};\n"),
    writeFile(path.join(edgeFixture, "ignored.ts"), "ignored\n"),
    writeFile(path.join(edgeFixture, ".hidden.ts"), "hidden\n"),
    writeFile(path.join(edgeFixture, "node_modules/ignored.ts"), "ignored\n"),
    writeFile(path.join(edgeFixture, "dist/ignored.ts"), "ignored\n"),
    writeFile(
      path.join(edgeFixture, "oversized.ts"),
      Buffer.alloc(1024 * 1024 + 1, "x"),
    ),
  ]);
  if (process.platform !== "win32") {
    await symlink("src/index.ts", path.join(edgeFixture, "linked.ts"));
  }
  compare(edgeFixture);

  if (process.platform !== "win32") {
    const unreadable = path.join(edgeFixture, "unreadable.ts");
    await writeFile(unreadable, "blocked\n");
    await chmod(unreadable, 0o000);
    const typescript = run("npm", typescriptArgs, edgeFixture);
    const rust = run(process.env.CARGO || "cargo", rustArgs, edgeFixture);
    await chmod(unreadable, 0o600);
    assert.notEqual(typescript.status, 0);
    assert.notEqual(rust.status, 0);
  }
} finally {
  await rm(edgeFixture, { recursive: true, force: true });
}

process.stdout.write("Analyzer parity: OK\n");
