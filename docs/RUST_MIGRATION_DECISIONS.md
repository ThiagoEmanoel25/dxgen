# DXGen Rust Migration Decisions

## 2026-11-16 — Phase 4 local RAG accepted; Phase 5 providers retained

### Decision

- Rust now owns the credential-free default RAG scan + chunk stage through `dxgen-rag` JSON schema v1. It preserves chunk content and metadata; `DXGEN_RAG_PATH` selects it and the packaged CLI discovers it beside `dxgen-analyze`.
- `@repo/rag` keeps the TypeScript implementation as the fallback. Absence of the native binary and custom scan options use TypeScript. An incompatible or failing configured binary is surfaced; only the declared UTF-16 hard-split limitation falls back because JavaScript can represent lone UTF-16 surrogates and Rust strings cannot.
- The main RAG pipeline and the GitHub App edge path share `prepareProjectChunks`, so the migration reaches both local ingestion callers once. Embeddings, Pinecone synchronization/querying, filters, hybrid retrieval, and `Document` conversion remain TypeScript.
- Phase 5 is complete as a design evaluation, not a provider port. OpenAI calls, prompts, retries, tracing, and result extraction remain TypeScript. Generation now routes directly from the wizard feature to its generator, avoiding an extra LLM agent call whose only job was to choose the already-selected feature. A Rust prompt-only subprocess was rejected as overhead without ownership; provider migration was rejected because no credential-free deterministic parity contract currently exists.
- The accepted native RAG step is recursive character chunking, not model-token (BPE) tokenization. Tokenization remains a separate candidate that requires exact encoding parity before benchmarking.

### Evidence

- Passed: `npm run test:rag-parity` on the golden analyzer fixture and a Unicode/overlap fixture.
- Passed: `cargo test -p dxgen-rag` (3 tests).
- Passed: `npm test --workspace @repo/rag` (3 tests).
- Passed: `npm run build --workspace @repo/rag`.
- Phase 4 benchmark: `docs/benchmarks/2026-11-16-rag.md`. On the stable `packages/` corpus, median wall time fell from 303.14 ms to 11.67 ms (96.1%) and peak RSS from 127.7 MiB to 4.8 MiB (96.2%).
- The benchmark did not call OpenAI or Pinecone and required no credentials.

### Remaining blockers and risks

- Cross-platform release artifacts remain unbuilt. Packaging stages both binaries, but only the current platform can be validated locally.
- Custom `includeExtensions`, `excludeGlobs`, or `maxFileSizeBytes` stay on TypeScript until a v2 native contract has a demonstrated caller and parity fixture.
- Provider migration needs recorded, provider-neutral fixtures for messages, tool calls, retries, errors, tracing, and streaming plus an explicit secrets policy. Live model output is nondeterministic, so a latency-only comparison would not establish correctness.
- Retrieval quality was not re-benchmarked because chunk content and metadata are identical after order normalization and the embedding/query stages are unchanged.

## 2026-11-16 — Phase 3 hybrid CLI boundary

### Decision

- The shipping command remains the existing TypeScript CLI. It continues to own login, Supabase access, prompts, terminal progress, RAG, AI orchestration, provider calls, and generated-file writes.
- Rust owns only deterministic repository analysis. The existing versioned JSON subprocess contract is the boundary; no provider, authentication, frontend, or GitHub App code moves to Rust.
- A Rust command wrapper around the TypeScript CLI was rejected because it would add startup and signal-forwarding complexity without moving product behavior or removing the Node requirement.
- The CLI now auto-discovers `native/<platform>-<architecture>/dxgen-analyze[.exe]` beside its bundle. `DXGEN_ANALYZER_PATH` remains the explicit override, and absence of both paths preserves the TypeScript fallback.
- `npm run package:native --workspace @dxgen/cli` stages the existing CLI bundle and the current release analyzer into an npm-package layout. It does not compile, download, or guess a binary.
- Phase 4 and provider migration are not authorized by this decision. RAG and AI remain TypeScript unless a separate correctness contract and benchmark justify changing them.

### Evidence

- Passed: `npm test --workspace @dxgen/cli` (3 analyzer-discovery tests).
- Passed: `npm run build --workspace @dxgen/cli`.
- Passed: `cargo build --release -p dxgen-analyze`.
- Passed: current-platform package staging and `npm pack`; the inspected artifact contains executable `dist/index.js` and `native/darwin-arm64/dxgen-analyze`.
- Passed: `node apps/cli/dist/index.js --version` (`dxgen v0.0.1`).

### Remaining risks and work

- Only the current `darwin-arm64` artifact was produced and inspected. No Linux, Windows, x64, or cross-platform install result exists, so the release matrix remains pending.
- The staged CLI keeps its existing npm workspace dependencies. External installation must be tested together with the repository's package publication strategy before calling the artifact generally distributable.
- The product CLI still requires Node; only the analyzer satisfies the no-Node release gate.
- Full CLI TypeScript checking remains blocked by pre-existing errors in `apps/cli/src/components/Spinner.tsx:64` and `packages/ai/src/system-design.renderer.ts:93`. The new analyzer-discovery files have no remaining reported type errors.

## 2026-11-16 — Phase 2 CLI integration

### Decisions

- `runGenerateCommand` selects the Rust analyzer when `DXGEN_ANALYZER_PATH` is configured and otherwise preserves the existing TypeScript path.
- The adapter invokes the binary without a shell, validates the versioned JSON boundary, removes `schemaVersion`, and attaches the already-detected stack so downstream generators receive the same `ProjectContext` shape.
- A configured Rust failure is surfaced to the CLI. Silent fallback is intentionally limited to the absence of configuration; it must not hide a broken binary or incompatible schema.
- Phase 3 will not start with an empty native CLI scaffold. Its process boundary must be chosen first because retaining the TypeScript AI engine and porting the entire networked stack are materially different projects.

### Evidence

- Passed: `npm test --workspace @repo/ai` (7 tests across the analyzer and Rust adapter).
- Passed: `npm run build --workspace @repo/ai`.
- The adapter test covers schema conversion, incompatible output, and spawning a configured executable.

### Resolution

- Resolved by the Phase 3 hybrid boundary above: keep the TypeScript command and engine, and package only the Rust analyzer.

## 2026-11-16 — Phase 1 benchmark decision

### Decisions

- The benchmark corpus was frozen before measurement: barber-saas (441 eligible files), Vite (2,172), and Next.js (29,892).
- Correctness now compares both the normalized `ProjectContext` JSON and a benchmark-only discovered-file manifest. Comparing only final JSON was insufficient because most source-file paths are discarded by `ProjectContext`.
- The harness uses three warmups, twenty measured runs, alternating implementation order, release-mode Rust, filesystem-warm caches, and `/usr/bin/time` for CPU/RSS. Future wall time uses Node's monotonic nanosecond clock because macOS `/usr/bin/time` rounds to 10 ms.
- Phase 1 passed every provisional gate. Proceed to Phase 2 CLI integration without changing generated documentation output.

### Evidence

- Medium median wall time: TypeScript 0.74 s; Rust 0.06 s (91.9% reduction).
- Large median wall time: TypeScript 34.44 s; Rust 1.23 s (96.4% reduction).
- Large peak RSS: TypeScript 613.1 MiB; Rust 124.5 MiB (79.7% reduction).
- Full results: `docs/benchmarks/2026-11-16-analyzer.md`.

### Risks

- The source changes were benchmarked from a working tree based on commit `c25e31de76d1b99f85a2f45c9c22c180e5525f22`; the result file records the exact corpus revisions but the analyzer changes should be committed before external reproduction.
- The TypeScript runtime-size comparison counts only the Node executable and excludes dependencies, so it is a conservative lower bound rather than a full packaged-size measurement.
- Phase 2 still needs a binary discovery and packaging strategy; benchmark success alone does not solve cross-platform distribution.

## 2026-11-16 — Rust analyzer parity

### Decisions

- The Rust workspace contains one binary crate, `dxgen-analyze`, with only `ignore`, `serde`, and `serde_json` as dependencies.
- The CLI parser uses the standard library. Its public interface matches the TypeScript baseline: `dxgen-analyze <repository-path> --max-depth 3 --format json`.
- The Rust walker respects `.gitignore` without requiring a `.git` directory, follows symbolic links, excludes the same generated directories, skips hidden entries, and enforces the same 1 MiB file limit.
- Nested manifest fields remain `serde_json::Value` so the Rust boundary preserves the JavaScript runtime values instead of adding stricter validation during a parity migration.
- The structure output intentionally preserves the frozen TypeScript behavior that currently exposes only top-level nodes. Correcting the tree requires a separate contract change in both implementations.
- The parity command runs both analyzers against the committed golden fixture and a temporary edge-case fixture covering `.gitignore`, hidden and excluded paths, oversized files, symlinks, and unreadable-file failures.

### Risks

- `ignore` and Globby can still differ on complex ignore patterns, filesystem case sensitivity, or platform-specific symlink behavior. The benchmark corpus must pass parity before any timing result is accepted.
- Hidden configuration paths remain absent because that is the current TypeScript contract, not because it is the desired final behavior.
- No performance claim has been made. Release compilation succeeded, but the benchmark harness and corpus are still pending.

### Progress and verification

- Passed: `cargo fmt --all -- --check` after formatting.
- Passed: `cargo clippy -p dxgen-analyze --all-targets -- -D warnings`.
- Passed: `cargo test -p dxgen-analyze` (4 tests).
- Passed: `cargo build --release -p dxgen-analyze`.
- Passed: `npm run test:analyzer-parity`.

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
