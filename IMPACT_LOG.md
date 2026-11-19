# Impact Log — DXGen

Registro de trabalho técnico com impacto real, para uso em portfólio, currículo e conversas de carreira. Cada entrada documenta o que foi feito, o efeito técnico e o efeito de negócio (quando aplicável), com evidência rastreável (commit/PR).

---

## [2026-11-19] Bypass de auth local destrava geração de docs sem schema Supabase

**Tags:** feature, segurança, developer-experience

**O que foi feito:**
O comando `dxgen generate` exigia login via Supabase, que depende de três rotinas SQL (`check_allowlist`, `check_and_reset_monthly_usage`, `increment_doc_usage`) e da tabela `profiles` — nenhuma delas versionada no repositório. Sem acesso ao projeto Supabase hospedado, era impossível gerar documentação localmente. Foi adicionado um bypass explícito, ativado só por `DXGEN_DEV_NO_AUTH=1`, que injeta um usuário local e libera os gates de uso.

**Impacto técnico:**
- Destrava `dxgen generate` em ambiente local sem nenhum banco de dados, container ou credencial de auth.
- Guards colocados nas funções compartilhadas (`requireAuth`, `checkUsageLimits`, `incrementUsage`) em vez dos handlers, então os três pontos de chamada e o comando `status` herdam o comportamento sem duplicação.
- Recusa explícita com erro quando combinado com `NODE_ENV=production` — a flag não pode vazar para produção e liberar auth silenciosamente.
- Ativação apenas com o valor exato `"1"`; `DXGEN_DEV_NO_AUTH=true` não ativa, com teste cobrindo o caso.
- Aviso em `stderr` a cada execução, para o bypass nunca passar despercebido.
- User ID fixo e estável, porque ele deriva o namespace do Pinecone via `buildNamespace` — um ID variável descartaria o índice a cada execução.
- 4 testes novos, incluindo o guard de produção e a verificação de que os gates de uso não tocam o Supabase.

**Impacto de negócio:**
- Desbloqueou o time inteiro, que estava impedido de testar geração de documentação localmente pelo mesmo gate de login. Horas/semana economizadas não quantificadas.
- Projeto em pré-lançamento, sem usuários externos afetados.

**Evidência:**
- Commit: não commitado no momento do registro (working tree da branch `new-update`)
- Arquivos: `apps/cli/src/lib/dev-auth.ts` (novo, 55 linhas), `apps/cli/src/lib/dev-auth.test.ts` (novo, 62 linhas), `apps/cli/src/lib/auth/index.ts`, `apps/cli/src/lib/usage.ts`, `.env.example`
- Testes: `npm test` — 33 testes passando (7 no `@dxgen/cli`)
- Repositório: ThiagoEmanoel25/dxgen, branch `new-update`

---

## [2026-11-18] Três módulos Rust que nunca compilavam ligados ao build, mais correções de release e dependência

**Tags:** bugfix, refactor, ci, rust

**O que foi feito:**
Revisão do diff da migração incremental para Rust encontrou que `chunker.rs`, `scanner.rs` e `types.rs` existiam no crate `dxgen-rag` mas não eram declarados com `mod` no `main.rs` — ou seja, nunca eram compilados, e duplicavam lógica que continuava ativa no `main.rs`. A separação em módulos foi concluída: o `main.rs` passou a declarar os três, ficou só com parsing de argumentos e `--tokenize`, e as cópias duplicadas foram removidas. Junto, duas correções de distribuição.

**Impacto técnico:**
- Elimina ~380 linhas de código duplicado que `cargo test` e o CI nunca validavam: erros de compilação e correções divergentes nesses arquivos ficariam invisíveis indefinidamente.
- Refactor verificado como comportamento-preservante por comparação de saída byte-a-byte em 4 corpora (51, 123, 89 e 557 chunks) e no caminho `--tokenize` — todas idênticas. O hash do fixture (`3a2ab738674af228`) bateu exatamente com o registrado no benchmark anterior ao refactor.
- Custo de performance medido e nulo: mediana 5.52 ms antes e depois no fixture, 16.76 → 16.41 ms em `packages/` (3 warmups, 20 execuções alternadas), com RSS inalterado.
- Corrigido nome de tarball fixo (`dxgen-cli-0.0.1.tgz`) no workflow de release, que quebraria todos os jobs da matriz no primeiro bump de versão; passou a derivar o nome da saída do `npm pack`.
- Declarado `js-tiktoken` fixado em 1.0.21 como devDependency: a referência de paridade do tokenizer resolvia apenas por hoisting transitivo do LangChain, e podia quebrar ou trocar de versão silenciosamente.
- Paridade TypeScript/Rust revalidada após as mudanças: Rust 95.1% mais rápido e com 95.9% menos memória de pico em `packages/` (15.17 ms vs 306.92 ms; 5.3 MiB vs 130.3 MiB).

**Impacto de negócio:**
- Não quantificado. Projeto em pré-lançamento, sem usuários externos no momento.

**Evidência:**
- Commits: `da46194` — "feat: implement chunking functionality with SHA-256 metadata and incremental Pinecone sync"; `5aec266` — "feat: add GitHub Actions workflow for native CLI artifacts"
- Arquivos: `crates/dxgen-rag/src/main.rs` (446 linhas alteradas), `crates/dxgen-rag/src/chunker.rs`, `crates/dxgen-rag/src/scanner.rs`, `.github/workflows/native-cli.yml`, `package.json`
- Testes: `cargo test --workspace` (8 passando), `npm run test:rag-parity`, `npm run test:tokenizer-parity`, `npm run test:analyzer-parity`
- Repositório: ThiagoEmanoel25/dxgen, branch `new-update`

---
