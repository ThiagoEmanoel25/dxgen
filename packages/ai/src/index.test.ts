import type { Document } from "@langchain/core/documents";
import { describe, expect, it, vi } from "vitest";

import type { GenerateResult, ProjectContext, WizardFeature } from "./types";

const generators = vi.hoisted(() => ({
  readme: vi.fn(),
  apiDocs: vi.fn(),
  diagram: vi.fn(),
  summary: vi.fn(),
}));

vi.mock("./generators/readme.generator", () => ({
  generateReadme: generators.readme,
}));
vi.mock("./generators/api-docs.generator", () => ({
  generateApiDocs: generators.apiDocs,
}));
vi.mock("./generators/diagram.generator", () => ({
  generateDiagrams: generators.diagram,
}));
vi.mock("./generators/summary.generator", () => ({
  generateSummary: generators.summary,
}));

import { runGenerateCommand } from "./index";

const projectContext: ProjectContext = {
  rootPath: "/project",
  packages: [],
  configFiles: {
    tsconfigs: [],
    ciConfigs: [],
    otherConfigs: [],
  },
  structure: [],
  existingDocs: [],
};

describe("generation routing", () => {
  it.each([
    ["readme", generators.readme],
    ["api-docs", generators.apiDocs],
    ["diagram", generators.diagram],
    ["summary", generators.summary],
  ] as const)("routes %s directly to its generator", async (feature, generator) => {
    const expected: GenerateResult = {
      kind: feature as GenerateResult["kind"],
      content: "generated",
      suggestedPath: "output.md",
    };
    generator.mockResolvedValueOnce(expected);

    const result = await runGenerateCommand(
      {
        project: { rootPath: "/project" },
        wizard: {
          feature: feature as WizardFeature,
          outputDir: "docs",
          style: "technical",
          sync: false,
        },
      },
      {
        documents: [] as Document[],
        stack: { language: "TypeScript" },
        projectContext,
      },
    );

    expect(result).toBe(expected);
    expect(generator).toHaveBeenCalledOnce();
  });
});
