import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(cliRoot, "../..");
const analyzerExecutable =
  process.platform === "win32" ? "dxgen-analyze.exe" : "dxgen-analyze";
const ragExecutable =
  process.platform === "win32" ? "dxgen-rag.exe" : "dxgen-rag";
const analyzerArgument = process.argv.indexOf("--analyzer");
const ragArgument = process.argv.indexOf("--rag");
const outputArgument = process.argv.indexOf("--output");
const analyzerPath = path.resolve(
  analyzerArgument >= 0 && process.argv[analyzerArgument + 1]
    ? process.argv[analyzerArgument + 1]
    : path.join(repositoryRoot, "target/release", analyzerExecutable),
);
const ragPath = path.resolve(
  ragArgument >= 0 && process.argv[ragArgument + 1]
    ? process.argv[ragArgument + 1]
    : path.join(repositoryRoot, "target/release", ragExecutable),
);
const outputPath = path.resolve(
  outputArgument >= 0 && process.argv[outputArgument + 1]
    ? process.argv[outputArgument + 1]
    : path.join(
        repositoryRoot,
        "target/native-package",
        `${process.platform}-${process.arch}`,
      ),
);
const stagingPath = await mkdtemp(
  path.join(os.tmpdir(), "dxgen-native-package-"),
);

try {
  await cp(path.join(cliRoot, "dist"), path.join(stagingPath, "dist"), {
    recursive: true,
  });
  await mkdir(
    path.join(stagingPath, "native", `${process.platform}-${process.arch}`),
    { recursive: true },
  );
  await cp(
    analyzerPath,
    path.join(
      stagingPath,
      "native",
      `${process.platform}-${process.arch}`,
      analyzerExecutable,
    ),
  );
  await cp(
    ragPath,
    path.join(
      stagingPath,
      "native",
      `${process.platform}-${process.arch}`,
      ragExecutable,
    ),
  );

  const packageJson = JSON.parse(
    await readFile(path.join(cliRoot, "package.json"), "utf8"),
  );
  packageJson.files = ["dist", "native"];
  await writeFile(
    path.join(stagingPath, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await cp(stagingPath, outputPath, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  process.stdout.write(`${outputPath}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  await rm(stagingPath, { recursive: true, force: true });
}
