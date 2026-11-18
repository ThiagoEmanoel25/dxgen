import { readFileSync } from "node:fs";
import { getEncoding } from "js-tiktoken";

const input = JSON.parse(readFileSync(0, "utf8"));
if (
  !Array.isArray(input.texts) ||
  !input.texts.every((text) => typeof text === "string")
) {
  throw new Error('Expected JSON input shaped as {"texts":["..."]}');
}

const encoding = getEncoding("cl100k_base");
process.stdout.write(
  JSON.stringify({
    schemaVersion: 1,
    encoding: "cl100k_base",
    tokens: input.texts.map((text) => encoding.encode(text, [], [])),
  }),
);
