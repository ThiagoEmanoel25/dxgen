import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  outDir: "dist",
  platform: "node",
  target: "node18",
  // Bundle our own workspace code and nothing else. Third-party packages stay
  // external: several (the Pinecone client, for one) are CommonJS and break
  // with "Dynamic require is not supported" when inlined into ESM, and
  // puppeteer needs its postinstall to fetch Chromium.
  external: [/^[^./]/],
  noExternal: ["@repo/ai", "@repo/rag"],
});
