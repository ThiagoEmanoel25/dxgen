#!/usr/bin/env tsx
/**
 * Interactive script to help set up .env file
 * Run with: npm run setup:env
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const envPath = join(rootDir, ".env");

const rl = readline.createInterface({ input, output });

async function question(prompt: string): Promise<string> {
  const answer = await rl.question(prompt);
  return answer.trim();
}

async function questionSecret(prompt: string): Promise<string> {
  // For secrets, we'll just read normally (in real terminal you'd use readline with mask)
  return question(prompt);
}

function formatPrivateKey(key: string): string {
  // Remove any existing quotes
  key = key.trim().replace(/^["']|["']$/g, "");

  // If it's already formatted with \n, return as is
  if (key.includes("\\n")) {
    return key;
  }

  // If it's a multi-line string, convert newlines to \n
  if (key.includes("\n")) {
    return key.replace(/\n/g, "\\n");
  }

  // If it's a single line, assume it's already formatted
  return key;
}

async function main() {
  console.log("🔧 GitHub App - Configuração do .env\n");
  console.log("Este script vai ajudá-lo a configurar o arquivo .env\n");

  // Check if .env already exists
  if (existsSync(envPath)) {
    const overwrite = await question(
      "⚠️  O arquivo .env já existe. Deseja sobrescrever? (s/N): ",
    );
    if (overwrite.toLowerCase() !== "s" && overwrite.toLowerCase() !== "sim") {
      console.log("Operação cancelada.");
      rl.close();
      return;
    }
  }

  console.log("\n📝 Vamos configurar as variáveis de ambiente:\n");

  // APP_ID
  const appId = await question("1. APP_ID (ID do seu GitHub App): ");
  if (!appId) {
    console.error("❌ APP_ID é obrigatório!");
    rl.close();
    process.exit(1);
  }

  // PRIVATE_KEY
  console.log("\n2. PRIVATE_KEY (chave privada do GitHub App)");
  console.log("   Você pode:");
  console.log("   - Colar o conteúdo completo do arquivo .pem");
  console.log("   - Ou colar a chave já formatada com \\n");
  console.log("   - Ou fornecer o caminho do arquivo .pem");
  const privateKeyInput = await questionSecret("   PRIVATE_KEY: ");

  let privateKey = privateKeyInput.trim();

  // If it's a file path, read it
  if (
    privateKey.startsWith("/") ||
    privateKey.startsWith("./") ||
    privateKey.startsWith("../")
  ) {
    if (existsSync(privateKey)) {
      console.log(`   📄 Lendo arquivo: ${privateKey}`);
      privateKey = readFileSync(privateKey, "utf-8");
    } else {
      console.error(`   ❌ Arquivo não encontrado: ${privateKey}`);
      rl.close();
      process.exit(1);
    }
  }

  // Format the private key
  privateKey = formatPrivateKey(privateKey);

  if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) {
    console.warn(
      "   ⚠️  Aviso: A chave privada não parece estar no formato correto.",
    );
    console.warn(
      "   Certifique-se de que inclui 'BEGIN PRIVATE KEY' ou 'BEGIN RSA PRIVATE KEY'",
    );
  }

  // WEBHOOK_SECRET
  const webhookSecret = await questionSecret(
    "\n3. WEBHOOK_SECRET (segredo do webhook): ",
  );
  if (!webhookSecret) {
    console.error("❌ WEBHOOK_SECRET é obrigatório!");
    rl.close();
    process.exit(1);
  }

  // OPENAI_API_KEY
  const openaiKey = await questionSecret(
    "\n4. OPENAI_API_KEY (chave da API OpenAI): ",
  );
  if (!openaiKey) {
    console.warn(
      "   ⚠️  OPENAI_API_KEY não fornecida. Você precisará configurá-la depois.",
    );
  }

  // PINECONE_API_KEY
  const pineconeKey = await questionSecret(
    "\n5. PINECONE_API_KEY (chave da API Pinecone): ",
  );
  if (!pineconeKey) {
    console.warn(
      "   ⚠️  PINECONE_API_KEY não fornecida. Você precisará configurá-la depois.",
    );
  }

  // PORT (optional)
  const port =
    (await question("\n6. PORT (porta do servidor, padrão: 3000): ")) || "3000";

  // NODE_ENV
  const nodeEnv =
    (await question(
      "\n7. NODE_ENV (development/production, padrão: development): ",
    )) || "development";

  // Build .env content
  const envContent = `# GitHub App Configuration
APP_ID=${appId}
PRIVATE_KEY="${privateKey}"
WEBHOOK_SECRET=${webhookSecret}

# AI/LLM Configuration
${openaiKey ? `OPENAI_API_KEY=${openaiKey}` : "# OPENAI_API_KEY=your_openai_api_key_here"}
${pineconeKey ? `PINECONE_API_KEY=${pineconeKey}` : "# PINECONE_API_KEY=your_pinecone_api_key_here"}

# Server Configuration
PORT=${port}
NODE_ENV=${nodeEnv}
LOG_LEVEL=info
`;

  // Write .env file
  writeFileSync(envPath, envContent, "utf-8");
  console.log(`\n✅ Arquivo .env criado com sucesso em: ${envPath}\n`);

  // Verify
  console.log("📋 Resumo da configuração:");
  console.log(`   APP_ID: ${appId}`);
  console.log(
    `   PRIVATE_KEY: ${privateKey.substring(0, 50)}... (${privateKey.length} caracteres)`,
  );
  console.log(`   WEBHOOK_SECRET: ${webhookSecret.substring(0, 10)}...`);
  console.log(
    `   OPENAI_API_KEY: ${openaiKey ? "✅ Configurada" : "❌ Não configurada"}`,
  );
  console.log(
    `   PINECONE_API_KEY: ${pineconeKey ? "✅ Configurada" : "❌ Não configurada"}`,
  );
  console.log(`   PORT: ${port}`);
  console.log(`   NODE_ENV: ${nodeEnv}\n`);

  console.log("🎉 Configuração concluída!");
  console.log("\nPróximos passos:");
  console.log("1. Execute: npm run test:setup (para verificar a configuração)");
  console.log("2. Execute: npm run test:server (para testar o servidor)");
  console.log(
    "3. Execute: npm run dev (para iniciar em modo desenvolvimento)\n",
  );

  rl.close();
}

main().catch((error) => {
  console.error("❌ Erro:", error);
  rl.close();
  process.exit(1);
});
