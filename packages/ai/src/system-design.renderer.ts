import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run as renderMermaid } from "@mermaid-js/mermaid-cli";

const README_SECTION_START = "<!-- dxgen:system-design:start -->";
const README_SECTION_END = "<!-- dxgen:system-design:end -->";

function extractPrimaryMermaidDiagram(markdown: string): string {
  const match = markdown.match(/```mermaid\s*\r?\n([\s\S]*?)```/i);

  if (!match?.[1]?.trim()) {
    throw new Error(
      "The generated architecture document does not contain a Mermaid system design diagram.",
    );
  }

  return match[1].trim();
}

function toMarkdownPath(fromDirectory: string, targetPath: string): string {
  const relativePath = path
    .relative(fromDirectory, targetPath)
    .split(path.sep)
    .join("/");

  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

async function upsertReadmeSystemDesign(
  readmePath: string,
  architecturePath: string,
  imagePath: string,
): Promise<void> {
  const readmeDirectory = path.dirname(readmePath);
  const imageReference = toMarkdownPath(readmeDirectory, imagePath);
  const architectureReference = toMarkdownPath(
    readmeDirectory,
    architecturePath,
  );
  const section = [
    README_SECTION_START,
    "## System Design",
    "",
    `![System design generated from the analyzed project](${imageReference})`,
    "",
    `[View the complete architecture documentation](${architectureReference}).`,
    README_SECTION_END,
  ].join("\n");

  let currentReadme: string;
  try {
    currentReadme = await fs.readFile(readmePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    currentReadme = "# Project Documentation\n";
  }

  const managedSectionPattern = new RegExp(
    `${README_SECTION_START}[\\s\\S]*?${README_SECTION_END}`,
  );
  const nextReadme = managedSectionPattern.test(currentReadme)
    ? currentReadme.replace(managedSectionPattern, section)
    : `${currentReadme.trimEnd()}\n\n${section}\n`;

  await fs.writeFile(readmePath, nextReadme, "utf-8");
}

/**
 * Renders the primary Mermaid architecture diagram as an SVG and keeps a
 * managed System Design section in the documentation README.
 */
export async function renderSystemDesignArtifacts(
  architecturePath: string,
  architectureMarkdown: string,
): Promise<string[]> {
  const diagram = extractPrimaryMermaidDiagram(architectureMarkdown);
  const documentationDirectory = path.dirname(architecturePath);
  const assetsDirectory = path.join(documentationDirectory, "assets");
  const imagePath = path.join(assetsDirectory, "system-design.svg");
  const readmePath = path.join(documentationDirectory, "README.md");
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "dxgen-system-design-"),
  );
  const temporaryInput = path.join(temporaryDirectory, "system-design.mmd");

  await fs.mkdir(assetsDirectory, { recursive: true });

  try {
    await fs.writeFile(temporaryInput, diagram, "utf-8");
    await renderMermaid(temporaryInput, imagePath, {
      outputFormat: "svg",
      quiet: true,
      parseMMDOptions: {
        backgroundColor: "white",
        mermaidConfig: {
          fontFamily: "Arial, sans-serif",
          securityLevel: "strict",
          theme: "neutral",
        },
      },
    });
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }

  await upsertReadmeSystemDesign(readmePath, architecturePath, imagePath);

  return [imagePath, readmePath];
}
