import type { Document } from "@langchain/core/documents";

import { buildProjectContext } from "./context/project-context";
import { buildRustProjectContext } from "./context/rust-project-context";
import { generateApiDocs } from "./generators/api-docs.generator";
import { generateDiagrams } from "./generators/diagram.generator";
import { generateReadme } from "./generators/readme.generator";
import { generateSummary } from "./generators/summary.generator";
import { detectStack } from "./tools/stack-detector.tool";
import type {
  DetectedStack,
  GenerateRequest,
  GenerateResult,
  ProjectContext,
} from "./types";

export interface GenerateOptions {
  documents: Document[];
  stack?: DetectedStack;
  projectContext?: ProjectContext;
  analyzerPath?: string;
}

export async function runGenerateCommand(
  request: GenerateRequest,
  options: GenerateOptions,
): Promise<GenerateResult> {
  const {
    documents,
    stack: providedStack,
    projectContext: providedContext,
  } = options;

  // Step 1: Auto-detect stack if not provided (for context)
  let stack = providedStack;
  if (!stack && documents.length > 0) {
    stack = await detectStack(documents);
  }

  // Step 2: Build deterministic project context if not provided
  let projectContext = providedContext;
  if (!projectContext) {
    const analyzerPath =
      options.analyzerPath ?? process.env.DXGEN_ANALYZER_PATH;
    projectContext = analyzerPath
      ? await buildRustProjectContext(request.project.rootPath, {
          binaryPath: analyzerPath,
          stack,
          maxStructureDepth: 5,
        })
      : await buildProjectContext(request.project.rootPath, {
          stack,
          maxStructureDepth: 5,
        });
  }

  const params = {
    rootPath: request.project.rootPath,
    outputDir: request.wizard.outputDir,
    style: request.wizard.style,
    documents,
    stack,
    projectContext,
  };

  switch (request.wizard.feature) {
    case "readme":
      return generateReadme(params);
    case "api-docs":
      return generateApiDocs(params);
    case "diagram":
      return generateDiagrams(params);
    case "summary":
      return generateSummary(params);
  }
}

// Export types and utilities
export { detectStack } from "./tools/stack-detector.tool";
export type * from "./types";
export * from "./writers";
export { buildProjectContext, buildRustProjectContext };

export { generateApiDocs } from "./generators/api-docs.generator";
export { generateDiagrams } from "./generators/diagram.generator";
export { generateReadme } from "./generators/readme.generator";
// Export generators
export { generateSummary } from "./generators/summary.generator";
