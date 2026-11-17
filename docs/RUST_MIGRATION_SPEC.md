# DXGen Rust Migration Spec

Status: **Phase 4 local RAG boundary accepted; Phase 5 evaluated and retained in TypeScript**
Strategy: **incremental migration, no big-bang rewrite**  
First target: **deterministic project analysis only**

## 1. Goal

Evaluate whether Rust materially improves DXGen's local repository analysis without changing generated documentation or the current product flow.

The first implementation must reproduce the existing TypeScript `ProjectContext`. LLM calls, embeddings, Pinecone, Supabase, GitHub webhooks, Mermaid rendering, and the frontend are outside the first migration phase.

## 2. Progress tracker

| Step | Status | Evidence |
|---|---|---|
| Migration spec | Done | This document |
| TypeScript baseline command | Done | `npm run --silent analyze --workspace @repo/ai -- <repository-path> --max-depth 3 --format json` (`packages/ai/src/analyze.ts`) |
| Golden repository fixtures | Done | `npm test --workspace @repo/ai` (`packages/ai/test/fixtures/baseline`, `packages/ai/test/golden/baseline.json`) |
| Rust workspace and analyzer | Done | `cargo test -p dxgen-analyze` (`crates/dxgen-analyze`) |
| TypeScript/Rust parity test | Done | `npm run test:analyzer-parity` (`scripts/check-analyzer-parity.mjs`) |
| Benchmark harness | Done | `npm run benchmark:analyzers -- --output <result.json> <alias=repository>...` (`scripts/benchmark-analyzers.mjs`) |
| Benchmark results | Done | `docs/benchmarks/2026-11-16-analyzer.md` |
| Migration decision | Done | Phase 1 gate passed; proceed to CLI integration |
| TypeScript CLI integration | Done | `DXGEN_ANALYZER_PATH=target/release/dxgen-analyze` selects Rust through `packages/ai/src/context/rust-project-context.ts` |
| Phase 3 boundary decision | Done | TypeScript retains CLI, AI, and RAG ownership; Rust remains the deterministic analyzer (`docs/RUST_MIGRATION_DECISIONS.md`) |
| Packaged analyzer discovery | Done | `npm test --workspace @dxgen/cli` (`apps/cli/src/lib/analyzer.test.ts`) |
| Current-platform npm package | Done | `npm run package:native --workspace @dxgen/cli` plus tarball content inspection |
| Cross-platform release artifacts | Pending | No CI matrix or release result yet |
| Native RAG scan + chunk | Done | `npm run test:rag-parity`; `docs/benchmarks/2026-11-16-rag.md` |
| RAG integration and fallback | Done | `npm test --workspace @repo/rag`; `npm test --workspace @dxgen/cli` |
| AI generation/provider evaluation | Done, retained in TypeScript | `docs/RUST_MIGRATION_DECISIONS.md` |

Update this table when a step is completed. A step is not complete without a command, test, or result file linked in the Evidence column.

## 3. Current source of truth

The Rust analyzer must initially match these implementations:

- `packages/rag/src/file-scanner.ts`: file discovery and exclusions.
- `packages/ai/src/context/project-context.ts`: package, configuration, documentation, and tree extraction.
- `packages/ai/src/types.ts`: `ProjectContext` and related types.

Behavioral parity comes before cleanup. Existing TypeScript behavior should not be redesigned during the comparison.

## 4. Phase 1 scope

Create a Rust command with this interface:

```bash
dxgen-analyze <repository-path> --max-depth 3 --format json
```

It must:

1. Scan the repository using the same default exclusions as TypeScript.
2. Find package manifests, configuration files, environment examples, and existing documentation.
3. Build the same project structure tree.
4. Emit a deterministic JSON document to standard output.
5. Send errors and diagnostics to standard error.
6. Exit non-zero when the repository cannot be analyzed.

It must not call external services or require credentials.

## 5. Output contract

The first Rust result must serialize the existing `ProjectContext` shape:

```json
{
  "schemaVersion": 1,
  "rootPath": "/absolute/path/to/project",
  "packages": [],
  "configFiles": {
    "tsconfigs": [],
    "ciConfigs": [],
    "otherConfigs": []
  },
  "structure": [],
  "existingDocs": []
}
```

Contract rules:

- Paths inside project data use `/`, including on Windows.
- Project-relative paths never start with `./`.
- Arrays are sorted by project-relative path before serialization.
- Object fields with no value follow the TypeScript serializer's omission behavior.
- No timestamps, durations, machine names, or nondeterministic values appear in the JSON.
- `stack` is omitted in phase 1 because stack detection is not part of deterministic filesystem analysis.
- `schemaVersion` belongs to the analyzer boundary; adapters may remove it before passing the result to current TypeScript code.

For parity comparisons, both outputs replace `rootPath` with `<ROOT>` before diffing.

## 6. Correctness gate

Performance results are invalid until correctness passes.

For every benchmark repository:

- Both implementations discover the same relative file paths.
- Package metadata matches after JSON normalization.
- Configuration and documentation contents match byte-for-byte.
- Structure trees match after deterministic sorting.
- Repeating either analyzer produces identical output.
- Symlinks, unreadable files, malformed `package.json`, large files, and excluded directories have explicit test cases.

The required parity target is **100% on the agreed contract**. Any intentional difference must be documented and approved before benchmarking.

## 7. Benchmark protocol

The first benchmark measures only repository analysis. Networked generation is a separate future benchmark because API latency would hide local runtime differences.

### Corpus

Use at least three repositories:

| Size | Suggested profile |
|---|---|
| Small | Single package, fewer than 500 eligible files |
| Medium | Monorepo, 500–5,000 eligible files |
| Large | More than 5,000 eligible files and nested workspaces |

Record the repository commit, eligible file count, and total eligible bytes with every result. Do not commit private repository paths or source contents to benchmark results.

### Environment

Record:

- Operating system and architecture.
- CPU model and logical core count.
- Total memory.
- Node, npm, and Rust versions.
- TypeScript and Rust commit hashes.
- Build mode; Rust must use `--release`.

Use the same machine, power mode, repository checkout, exclusions, and output destination for both implementations.

### Runs

- Run three warmups per implementation.
- Run twenty measured executions per repository.
- Alternate implementation order to reduce thermal and background-process bias.
- Measure process startup plus analysis plus JSON serialization.
- Treat filesystem-warm results as the primary comparison.
- Do not label results “filesystem cold” unless the OS cache was actually controlled.

`hyperfine` is the preferred harness when the benchmark is implemented:

```bash
hyperfine --warmup 3 --runs 20 \
  'node <typescript-analyzer> <repo> --format json > /dev/null' \
  './target/release/dxgen-analyze <repo> --format json > /dev/null'
```

## 8. Metrics

Capture:

| Metric | Why it matters |
|---|---|
| Median wall time | Typical user-visible analysis time |
| p95 wall time | Slow-run stability |
| Peak RSS | Memory pressure on large repositories |
| CPU time | Cost of local processing |
| Output size and hash | Correctness and serialization parity |
| Installed/runtime size | Distribution cost |
| Startup time on an empty fixture | CLI responsiveness |

Do not use LLM token usage, OpenAI latency, or Pinecone latency in phase 1.

## 9. Provisional decision gate

Proceed with integrating the Rust analyzer only if:

1. The correctness gate passes.
2. Rust reduces median analysis time by at least 30% on medium or large repositories, **or** reduces peak RSS by at least 50%.
3. Rust does not regress the small-repository median by more than 10%.
4. The released analyzer runs without requiring a Node runtime.
5. Error messages remain actionable for CLI users.

These thresholds are provisional. Change them before running the benchmark, not after seeing results.

## 10. Migration phases

| Phase | Scope | Exit condition |
|---|---|---|
| 0 | Spec and baseline | Contract and benchmark protocol accepted |
| 1 | Rust analyzer | Parity and benchmark gates pass |
| 2 | CLI integration | TypeScript CLI can invoke Rust without changing user output |
| 3 | Hybrid CLI packaging | The TypeScript CLI preserves login, prompts, progress, RAG/AI, and file output; its package auto-selects the colocated Rust analyzer |
| 4 | RAG evaluation | Complete: default local scan + chunking has a versioned Rust boundary; network retrieval remains TypeScript |
| 5 | AI orchestration evaluation | Complete as an evaluation: provider and agent migration is rejected until a provider-neutral contract can be tested without changing behavior |

The Next.js frontend and GitHub App remain TypeScript unless a later spec demonstrates a concrete reason to migrate them.

The benchmark-only `--format files` diagnostic emits sorted discovered paths so the correctness gate can verify scanner parity. Product callers continue to use `--format json`.

Phase 2 selects Rust by setting `DXGEN_ANALYZER_PATH` to the analyzer binary. The adapter validates `schemaVersion`, removes the boundary-only field, restores the detected stack, and returns the existing `ProjectContext`. When the variable is absent, the current TypeScript analyzer remains the default. An explicitly configured but failing Rust binary produces an actionable error instead of silently changing implementations.

Phase 3 keeps the product command and networked engine in TypeScript. The CLI looks for a target-specific analyzer at `native/<platform>-<architecture>/dxgen-analyze[.exe]` beside its `dist` bundle. An explicit `DXGEN_ANALYZER_PATH` always wins; when neither is present, the TypeScript analyzer remains the fallback. The package staging command places the release analyzer in that layout without changing authentication, prompts, generated files, providers, or frontend code.

```text
TypeScript CLI (auth, prompts, progress, output)
  ├─ TypeScript RAG network layer + AI engine (providers and orchestration)
  ├─ TypeScript adapter ── JSON schema v1 ── Rust dxgen-rag (default scan + chunk)
  └─ TypeScript adapter ── JSON schema v1 ── Rust dxgen-analyze
```

The product CLI still requires Node. Only `dxgen-analyze` and `dxgen-rag` are standalone. A Rust wrapper around the TypeScript CLI is intentionally excluded because it would add a process boundary without taking ownership of product behavior.

### Phase 4 RAG contract

`dxgen-rag <repository-path> [--chunk-size 1500] [--chunk-overlap 200]` owns only credential-free repository scanning, recursive character chunking, and chunk metadata. It emits schema v1 as `{"schemaVersion":1,"chunks":[]}`.

The contract preserves chunk IDs, text, source paths, relative paths, indices, counts, line ranges, and semantic flags. Chunk arrays are compared by `(relativePath, chunkIndex)` because the old Globby traversal order is filesystem-dependent and has no indexing meaning. `DXGEN_RAG_PATH` opts into the native boundary; packaged CLIs discover the colocated binary. Absence of a binary, custom scan options, or the explicitly reported UTF-16 hard-split edge case uses the existing TypeScript implementation. A configured binary that otherwise fails or returns an incompatible schema is an error.

OpenAI embeddings, Pinecone writes/queries, LangChain `Document` conversion, filters, and hybrid retrieval remain TypeScript. They require provider credentials and SDK behavior and were not included in the local benchmark.

The Phase 4 gate is the Phase 1 local-work gate applied separately: exact normalized chunk parity, at least 30% median wall-time reduction or 50% peak-RSS reduction on a non-trivial repository, and no more than a 10% small-fixture regression. The recorded benchmark passes.

### Phase 5 AI boundary

No Rust AI subprocess was added. The selected documentation generator is called directly; an extra LLM agent call is not used to repeat the wizard's routing decision. Generators still depend directly on LangChain message types, OpenAI behavior, environment-loaded credentials, tracing metadata, and provider errors. Moving prompt formatting alone would add JSON serialization and process startup without owning a meaningful unit of work; moving providers would require a new SDK, credential, retry, streaming, and observability contract. Without deterministic provider fixtures or approved live credentials, claiming parity would be unsafe.

The native RAG boundary currently performs recursive **character** chunking, not model-token (BPE) tokenization. A tokenization migration needs its own parity fixture against the exact encoding used by the embedding and chat models before performance is compared.

## 11. Benchmark result template

Create a dated result under `docs/benchmarks/` when the harness exists:

```markdown
# Analyzer benchmark — YYYY-MM-DD

## Environment
- Machine:
- OS:
- Node:
- Rust:
- TypeScript commit:
- Rust commit:

## Correctness
- Normalized output hashes:
- Parity result:

## Results
| Repository | Implementation | Median | p95 | Peak RSS | Output hash |
|---|---|---:|---:|---:|---|

## Decision
- Gate passed:
- Evidence:
- Follow-up:
```

## 12. Next action

Add a release build matrix for the supported Node platforms, stage both matching Rust binaries with `npm run package:native --workspace @dxgen/cli`, install-test each produced artifact, and record the results. Revisit AI/provider migration only after provider-neutral recorded fixtures cover tool calls, retries, errors, tracing, and generated-output parity.
