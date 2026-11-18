# cl100k_base tokenizer benchmark — 2026-11-16

## Scope and protocol

This benchmark compares the complete local subprocess boundary: JSON input parsing, `cl100k_base` tokenization, and JSON token-ID serialization. It does not call OpenAI, Pinecone, or an LLM.

- Reference: `js-tiktoken` 1.0.21, already installed through LangChain.
- Candidate: `tiktoken-rs` 0.12.1 in the release build of `dxgen-rag`.
- Corpus: 168 chunks produced from the stable DXGen `packages/` subtree, totaling 184,786 input bytes and 42,043 tokens.
- Three warmups and twenty measured runs, alternating implementation order.
- Raw result: `docs/benchmarks/2026-11-16-tokenizers.json`.

`cl100k_base` is selected explicitly because the configured `text-embedding-3-small` model maps to that encoding in OpenAI's tokenizer mapping.

## Correctness

- `npm run test:tokenizer-parity` passed for empty text, ASCII, Portuguese, emoji, combining Unicode, multiple scripts, code, long repetition, and a literal special-token marker.
- The benchmark compared every token ID for the full corpus before measuring; outputs matched exactly.
- Special-token-looking source text is encoded as ordinary text by both implementations.

## Results

| Implementation | Median wall | p95 wall | Median CPU | Peak RSS |
|---|---:|---:|---:|---:|
| JavaScript | 301.86 ms | 348.74 ms | 360 ms | 208.0 MiB |
| Rust | 61.08 ms | 64.60 ms | 50 ms | 29.6 MiB |

Rust reduced median wall time by **79.8%**, p95 by **81.5%**, median CPU by **86.1%**, and peak RSS by **85.8%** for this boundary.

## Decision

The tokenizer performance and exact-parity gate passes. Keep `dxgen-rag --tokenize` as the versioned experimental boundary and use Rust for future local token-budget work.

Do not change production chunk boundaries yet. Current Pinecone vectors were produced from character-based chunks; switching to token-based chunks changes content, IDs, embeddings, retrieval quality, and reindex behavior. That migration needs a separate retrieval-quality fixture and reindex plan.
