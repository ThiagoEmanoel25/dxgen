import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { DetectedStack, ProjectContext } from "../types";

const execFileAsync = promisify(execFile);

interface RustProjectContextOptions {
  binaryPath: string;
  maxStructureDepth?: number;
  stack?: DetectedStack;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function parseRustAnalyzerOutput(
  stdout: string,
  stack?: DetectedStack,
): ProjectContext {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Rust analyzer returned invalid JSON");
  }

  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.rootPath !== "string" ||
    !Array.isArray(value.packages) ||
    !isRecord(value.configFiles) ||
    !Array.isArray(value.configFiles.tsconfigs) ||
    !Array.isArray(value.configFiles.ciConfigs) ||
    !Array.isArray(value.configFiles.otherConfigs) ||
    !Array.isArray(value.structure) ||
    !Array.isArray(value.existingDocs)
  ) {
    throw new Error("Rust analyzer returned an incompatible schema");
  }

  const { schemaVersion: _, ...context } = value;
  return { ...(context as unknown as ProjectContext), stack };
}

export async function buildRustProjectContext(
  rootPath: string,
  options: RustProjectContextOptions,
): Promise<ProjectContext> {
  try {
    const { stdout } = await execFileAsync(
      options.binaryPath,
      [
        rootPath,
        "--max-depth",
        String(options.maxStructureDepth ?? 5),
        "--format",
        "json",
      ],
      { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 },
    );
    return parseRustAnalyzerOutput(stdout, options.stack);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Rust analyzer")) {
      throw error;
    }
    const stderr =
      isRecord(error) && typeof error.stderr === "string"
        ? error.stderr.trim()
        : "";
    throw new Error(
      `Rust analyzer failed: ${stderr || (error instanceof Error ? error.message : String(error))}`,
    );
  }
}
