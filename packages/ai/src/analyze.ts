#!/usr/bin/env node

import { stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { buildProjectContext } from "./context/project-context";
import type {
  ProjectContext,
  ProjectDocFile,
  ProjectPackage,
  ProjectStructureNode,
} from "./types";

const byPath = <T extends { path: string }>(left: T, right: T): number =>
  left.path < right.path ? -1 : left.path > right.path ? 1 : 0;

const normalizePath = (value: string): string => value.replaceAll("\\", "/");

const normalizeFile = <T extends { path: string }>(file: T): T => ({
  ...file,
  path: normalizePath(file.path),
});

const sortStructure = (nodes: ProjectStructureNode[]): ProjectStructureNode[] =>
  nodes
    .map((node) => ({
      ...node,
      path: normalizePath(node.path),
      children: node.children ? sortStructure(node.children) : undefined,
    }))
    .sort(byPath);

export interface AnalyzerOutput {
  schemaVersion: 1;
  rootPath: string;
  packages: ProjectPackage[];
  configFiles: ProjectContext["configFiles"];
  structure: ProjectStructureNode[];
  existingDocs: ProjectDocFile[];
}

export const createAnalyzerOutput = (
  context: ProjectContext,
): AnalyzerOutput => ({
  schemaVersion: 1,
  rootPath: normalizePath(context.rootPath),
  packages: context.packages.map(normalizeFile).sort(byPath),
  configFiles: {
    turbo: context.configFiles.turbo
      ? normalizeFile(context.configFiles.turbo)
      : undefined,
    tsconfigs: context.configFiles.tsconfigs.map(normalizeFile).sort(byPath),
    envExample: context.configFiles.envExample
      ? normalizeFile(context.configFiles.envExample)
      : undefined,
    ciConfigs: context.configFiles.ciConfigs.map(normalizeFile).sort(byPath),
    otherConfigs: context.configFiles.otherConfigs
      .map(normalizeFile)
      .sort(byPath),
  },
  structure: sortStructure(context.structure),
  existingDocs: context.existingDocs.map(normalizeFile).sort(byPath),
});

const parseMaxDepth = (value: string | undefined): number => {
  const depth = Number(value ?? 3);
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error("--max-depth must be a positive integer");
  }
  return depth;
};

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "max-depth": { type: "string" },
      format: { type: "string", default: "json" },
    },
  });

  const repositoryPath = positionals[0];
  if (positionals.length !== 1 || !repositoryPath) {
    throw new Error(
      "Usage: dxgen-analyze <repository-path> [--max-depth 3] [--format json]",
    );
  }
  if (values.format !== "json") {
    throw new Error("--format must be json");
  }

  const rootPath = path.resolve(repositoryPath);
  const rootStats = await stat(rootPath).catch(() => undefined);
  if (!rootStats?.isDirectory()) {
    throw new Error(`Repository path is not a readable directory: ${rootPath}`);
  }
  const context = await buildProjectContext(rootPath, {
    maxStructureDepth: parseMaxDepth(values["max-depth"]),
  });
  process.stdout.write(
    `${JSON.stringify(createAnalyzerOutput(context), null, 2)}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
