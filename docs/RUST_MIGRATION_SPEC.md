# DXGen Rust Migration Spec

Status: **proposed**  
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
| Rust workspace and analyzer | Pending | — |
| TypeScript/Rust parity test | Pending | — |
| Benchmark harness | Pending | — |
| Benchmark results | Pending | — |
| Migration decision | Pending | — |

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
| 3 | Native Rust CLI | Login, prompts, progress, and file output reach feature parity |
| 4 | RAG evaluation | Chunking and retrieval are benchmarked separately |
| 5 | AI orchestration evaluation | Provider and agent migration has a separate design decision |

The Next.js frontend and GitHub App remain TypeScript unless a later spec demonstrates a concrete reason to migrate them.

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

Create the Rust workspace and analyzer against the checked-in TypeScript golden output. Preserve the captured TypeScript behavior unless an intentional contract change is documented and approved.
