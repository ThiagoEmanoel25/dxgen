import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";

const input = JSON.stringify({
  texts: [
    "",
    "hello world",
    "olá mundo",
    "DXGen gera documentação com IA.",
    "const greeting = 'olá 🌎';\nexport default greeting;",
    "e\u0301 !== é",
    "中文 العربية हिन्दी",
    "<|endoftext|> deve ser texto comum no código-fonte",
    "a".repeat(10_000),
  ],
});

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} exited ${result.status}`);
  }
  return JSON.parse(result.stdout);
};

const javascript = run(process.execPath, ["scripts/tokenize-js.mjs"]);
const rust = run(process.env.CARGO || "cargo", [
  "run",
  "--quiet",
  "-p",
  "dxgen-rag",
  // --tokenize is not compiled into released binaries.
  "--features",
  "tokenize",
  "--",
  "--tokenize",
]);

assert.deepStrictEqual(rust, javascript);
process.stdout.write("cl100k_base tokenizer parity: OK\n");
