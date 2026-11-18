# RAG scan + chunk + SHA-256 benchmark — 2026-11-17

## Scope

This repeats the credential-free scan/chunk benchmark after adding SHA-256 file and chunk hashes. It includes process startup, repository traversal, reads, character chunking, both hashes, metadata, and JSON serialization. OpenAI and Pinecone are not called.

- Three warmups and twenty alternating measured runs.
- Exact normalized TypeScript/Rust output parity is required before timing.
- Raw result: `docs/benchmarks/2026-11-17-rag-hashes.json`.

## Results

| Corpus | Implementation | Median wall | p95 wall | Peak RSS |
|---|---|---:|---:|---:|
| Fixture, 7 chunks | TypeScript | 270.65 ms | 315.32 ms | 126.5 MiB |
| Fixture, 7 chunks | Rust | 5.90 ms | 6.04 ms | 3.8 MiB |
| Packages, 171 chunks | TypeScript | 285.84 ms | 368.71 ms | 130.2 MiB |
| Packages, 171 chunks | Rust | 12.43 ms | 14.99 ms | 5.3 MiB |

On `packages/`, Rust remains **95.7% faster** and uses **95.9% less peak memory** than TypeScript. Compared with the pre-hash Rust median of 11.67 ms, SHA-256 adds about 0.76 ms (6.5%), which remains within the 10% local regression gate.

## Decision

Keep file and chunk hashes. Their small local cost enables unchanged chunks to skip network embeddings and Pinecone upserts, where the avoided latency and usage dominate the sub-millisecond hash cost per corpus run.

Keep scanning sequential. The evaluated parallel walker regressed this corpus from 9.93 ms to 12.26 ms before final hash benchmarking.
