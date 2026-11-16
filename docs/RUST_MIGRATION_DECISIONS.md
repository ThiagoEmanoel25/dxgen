# DXGen Rust Migration Decisions

## 2026-11-15 — TypeScript baseline boundary

### Decisions

- The baseline is an `@repo/ai` command: `npm run --silent analyze --workspace @repo/ai -- <repository-path> --max-depth 3 --format json`. `--silent` prevents npm's own banner from contaminating JSON stdout.
- The command selects the `@repo/rag` `source` export condition so it runs from a clean workspace without relying on ignored build artifacts. Existing production imports continue to select `dist/index.js`.
- `buildProjectContext` remains the TypeScript source of truth and is unchanged. The command boundary adds `schemaVersion: 1`, removes `stack` by omission, normalizes path separators to `/`, and sorts path-based arrays with a locale-independent comparison.
- Diagnostics and errors go to stderr; JSON is the only stdout output. Missing or non-directory repository paths exit non-zero before scanning.
- Golden comparisons replace the fixture's absolute `rootPath` with `<ROOT>`. The committed fixture covers valid and malformed package manifests, TypeScript and YAML configuration, source files, top-level and nested documentation, and a depth-limited structure.
- The golden records existing analyzer behavior rather than correcting it. In particular, malformed `package.json` files are omitted and the current structure builder emits empty `children` arrays for fixture directories.

### Risks

- The baseline inherits scanner behavior from `@repo/rag`, including its extension allowlist, size limit, ignore rules, Git ignore handling, and unreadable-file behavior.
- Hidden paths such as `.env.example` and `.github` are not represented in this fixture because the current scanner does not enable Globby's `dot` option. This may conflict with the broader phase-1 contract and must be resolved as an explicit TypeScript contract change before demanding different Rust behavior.
- Symlink, unreadable-file, oversized-file, and malformed-content coverage required by the full correctness gate is still pending; this step establishes the first golden baseline only.
- A repository can become unreadable after the initial directory check. Scanner errors still propagate to the command's stderr and produce a non-zero exit.

### Progress and verification

- Added `packages/ai/src/analyze.ts`, the baseline fixture, its golden JSON, and three command-level tests (golden output, repeatability, and failure exit).
- Passed: `npm test --workspace @repo/ai` (3 tests).
- Passed: `npm run build --workspace @repo/ai`.
- Passed: `npm run build --workspace @repo/rag`.
- Passed: `npx biome check packages/ai/src/analyze.ts packages/ai/src/analyze.test.ts`.
- Full package TypeScript checking remains blocked by the pre-existing `packages/ai/src/system-design.renderer.ts:93` output-path type error; the new analyzer files produced no reported TypeScript errors.
- No Rust workspace was created.
