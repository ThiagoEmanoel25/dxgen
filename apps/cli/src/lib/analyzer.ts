import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function configurePackagedAnalyzer(
  entryUrl: string,
  environment: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  architecture = process.arch,
): string | undefined {
  const nativeDirectory = `../native/${platform}-${architecture}/`;
  if (!environment.DXGEN_ANALYZER_PATH) {
    const executable =
      platform === "win32" ? "dxgen-analyze.exe" : "dxgen-analyze";
    const candidate = fileURLToPath(
      new URL(`${nativeDirectory}${executable}`, entryUrl),
    );
    if (existsSync(candidate)) environment.DXGEN_ANALYZER_PATH = candidate;
  }
  if (!environment.DXGEN_RAG_PATH) {
    const executable = platform === "win32" ? "dxgen-rag.exe" : "dxgen-rag";
    const candidate = fileURLToPath(
      new URL(`${nativeDirectory}${executable}`, entryUrl),
    );
    if (existsSync(candidate)) environment.DXGEN_RAG_PATH = candidate;
  }
  return environment.DXGEN_ANALYZER_PATH;
}
