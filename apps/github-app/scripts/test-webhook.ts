#!/usr/bin/env tsx

/**
 * Script para testar webhook manualmente
 * Simula um evento pull_request.opened
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Probot } from "probot";
import app from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = join(__dirname, "..");
const monorepoRoot = join(appRoot, "../..");

// Load .env
config({ path: join(appRoot, ".env") });
config({ path: join(monorepoRoot, ".env") });

// Mock webhook payload
const mockPayload = {
  action: "opened",
  pull_request: {
    number: 123,
    title: "Test PR - Add new feature",
    body: "This is a test PR to verify the GitHub App is working",
    user: {
      login: "test-user",
    },
    base: {
      ref: "main",
    },
    head: {
      ref: "test-branch",
      sha: "abc123def456",
    },
  },
  repository: {
    name: "test-repo",
    full_name: "test-org/test-repo",
    owner: {
      login: "test-org",
    },
    clone_url: "https://github.com/test-org/test-repo.git",
  },
  installation: {
    id: 12345678,
  },
};

async function testWebhook() {
  console.log("🧪 Testando webhook manualmente...\n");

  if (!process.env.APP_ID || !process.env.PRIVATE_KEY) {
    console.error("❌ APP_ID e PRIVATE_KEY são necessários no .env");
    process.exit(1);
  }

  try {
    // Create Probot instance
    const probot = new Probot({
      appId: process.env.APP_ID!,
      privateKey: process.env.PRIVATE_KEY!,
      secret: process.env.WEBHOOK_SECRET,
    });

    // Load the app
    app(probot);

    // Create mock context
    const context = {
      payload: mockPayload,
      octokit: probot.auth() as any, // Mock octokit
      log: {
        info: (...args: any[]) => console.log("ℹ️ ", ...args),
        error: (...args: any[]) => console.error("❌", ...args),
        warn: (...args: any[]) => console.warn("⚠️ ", ...args),
        debug: (...args: any[]) => console.debug("🔍", ...args),
      },
    } as any;

    console.log("📦 Payload do webhook:");
    console.log(JSON.stringify(mockPayload, null, 2));
    console.log("\n");

    // Simulate receiving the event
    console.log("🔄 Simulando evento pull_request.opened...\n");
    await probot.receive({
      id: "test-event-id",
      name: "pull_request",
      payload: mockPayload as any,
    });

    console.log("\n✅ Webhook processado com sucesso!");
    console.log(
      "\n⚠️  Nota: Este é um teste básico. Para testar completamente,",
    );
    console.log("   você precisa usar smee.io com um repositório real.");
  } catch (error) {
    console.error("\n❌ Erro ao processar webhook:");
    console.error(error);
    process.exit(1);
  }
}

testWebhook();
