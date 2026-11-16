import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const fixturePath = path.resolve(
  import.meta.dirname,
  "../test/fixtures/baseline",
);
const goldenPath = path.resolve(
  import.meta.dirname,
  "../test/golden/baseline.json",
);
const fixtureJsonPath = fixturePath.replaceAll("\\", "/");

const analyzerArgs = (repositoryPath: string): string[] => [
  "--conditions=source",
  "--import",
  "tsx",
  path.resolve(import.meta.dirname, "analyze.ts"),
  repositoryPath,
  "--max-depth",
  "3",
  "--format",
  "json",
];

const runAnalyzer = async (): Promise<string> => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    analyzerArgs(fixturePath),
    { encoding: "utf8" },
  );
  expect(stderr).toBe("");
  return stdout;
};

describe("dxgen-analyze TypeScript baseline", () => {
  it("matches the normalized golden output", async () => {
    const expected = await readFile(goldenPath, "utf8");
    const actual = (await runAnalyzer()).replaceAll(fixtureJsonPath, "<ROOT>");

    expect(actual).toBe(expected);
  });

  it("is deterministic across repeated runs", async () => {
    expect(await runAnalyzer()).toBe(await runAnalyzer());
  });

  it("fails when the repository cannot be analyzed", async () => {
    await expect(
      execFileAsync(process.execPath, analyzerArgs(`${fixturePath}-missing`), {
        encoding: "utf8",
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("not a readable directory"),
    });
  });
});
