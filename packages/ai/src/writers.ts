import fs from "node:fs/promises";
import path from "node:path";
import { renderSystemDesignArtifacts } from "./system-design.renderer";
import type { GenerateRequest, GenerateResult } from "./types";

export interface WriteFileOptions {
  /**
   * Se true, sobrescreve arquivos existentes sem perguntar
   * Se false, pergunta ao usuário antes de sobrescrever
   */
  overwrite?: boolean;
}

export interface WriteResult {
  success: boolean;
  filePath: string;
  generatedFiles?: string[];
  error?: string;
}

/**
 * Resolve o caminho final do arquivo combinando outputDir e suggestedPath
 */
export function resolveFilePath(
  request: GenerateRequest,
  result: GenerateResult,
): string {
  const { outputDir } = request.wizard;
  const { suggestedPath } = result;
  if (path.isAbsolute(suggestedPath)) {
    throw new Error(
      "Generated file path must be relative to the output directory",
    );
  }
  const normalizedOutputDir = path.isAbsolute(outputDir)
    ? outputDir
    : path.resolve(request.project.rootPath, outputDir);
  const filePath = path.resolve(normalizedOutputDir, suggestedPath);
  const relative = path.relative(normalizedOutputDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Generated file path escapes the output directory");
  }
  return filePath;
}

/**
 * Cria os diretórios necessários para o arquivo
 */
async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Verifica se um arquivo existe
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Escreve o conteúdo da documentação gerada em um arquivo
 */
export async function writeDocumentationFile(
  request: GenerateRequest,
  result: GenerateResult,
  options: WriteFileOptions = {},
): Promise<WriteResult> {
  let filePath = "";
  try {
    filePath = resolveFilePath(request, result);

    // Verifica se o arquivo já existe
    const exists = await fileExists(filePath);

    // Never prompt from here: the caller owns the terminal by now. The CLI
    // asks in the wizard, before the progress UI starts.
    if (exists && !options.overwrite) {
      return {
        success: false,
        filePath,
        error: `${filePath} already exists and overwriting was declined.`,
      };
    }

    // Cria os diretórios necessários
    await ensureDirectoryExists(filePath);

    // Escreve o arquivo
    await fs.writeFile(filePath, result.content, "utf-8");

    const generatedFiles = [filePath];
    if (result.kind === "diagram") {
      const systemDesignFiles = await renderSystemDesignArtifacts(
        filePath,
        result.content,
      );
      generatedFiles.push(...systemDesignFiles);
    }

    return {
      success: true,
      filePath,
      generatedFiles,
    };
  } catch (error) {
    return {
      success: false,
      filePath,
      error: (error as Error).message,
    };
  }
}
