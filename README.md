<div align="center">
  <h1>🚀 DXGen</h1>
  <p><strong>Agente de Documentação com IA - Ferramenta CLI-first para geração automática de documentação</strong></p>

  <p>
    <a href="#instalação"><img src="https://img.shields.io/badge/instalação-guia-blue?style=for-the-badge" alt="Instalação" /></a>
    <a href="#início-rápido"><img src="https://img.shields.io/badge/início-rápido-green?style=for-the-badge" alt="Início Rápido" /></a>
    <a href="#documentação"><img src="https://img.shields.io/badge/documentação-completa-purple?style=for-the-badge" alt="Documentação" /></a>
  </p>
</div>

## 📋 Sobre o Projeto

DXGen é uma ferramenta poderosa de geração de documentação alimentada por IA que utiliza técnicas avançadas de RAG (Retrieval-Augmented Generation) para criar documentação contextual e precisa para seus projetos. Com uma abordagem CLI-first, o DXGen se integra perfeitamente ao seu fluxo de trabalho de desenvolvimento.

### ✨ Destaques

- ⚡ **Documentação Alimentada por IA** – Gera documentação abrangente usando técnicas avançadas de IA
- 🔒 **Abordagem CLI-First** – Integre facilmente ao seu fluxo de trabalho com uma interface de linha de comando intuitiva
- 🎯 **Suporte Multi-Formato** – Gera vários tipos de documentação incluindo README, documentação de API e diagramas
- 🔍 **RAG (Retrieval-Augmented Generation)** – Utiliza busca semântica para recuperar contexto relevante do seu código
- 🤖 **GitHub App Integrado** – Gera documentação automaticamente em Pull Requests
- 🎨 **Frontend Moderno** – Landing page elegante para apresentar o projeto

## 🏗️ Estrutura do Projeto

Este é um monorepo gerenciado com [Turborepo](https://turbo.build/repo) contendo:

### Aplicações (`apps/`)

- **`cli/`** – Ferramenta de linha de comando para geração de documentação
- **`frontend/`** – Aplicação Next.js com landing page
- **`github-app/`** – GitHub App para automação de documentação em PRs

### Pacotes (`packages/`)

- **`ai/`** – Pacote core com lógica de geração de documentação usando LangChain e LangGraph
- **`rag/`** – Pipeline RAG para varredura, chunking, embeddings e recuperação de documentos

## 📦 Pré-requisitos

- **Node.js**: versão 18.x ou superior
- **npm**: versão 10.0.0 ou superior (gerenciador de pacotes configurado)
- **Variáveis de ambiente**: Consulte a seção [Configuração](#configuração) para as variáveis necessárias

## 🚀 Instalação

```bash
# Clone o repositório
git clone <url-do-repositorio>
cd dxgen

# Instale as dependências
npm install

# Configure as variáveis de ambiente (veja seção de Configuração)
```

## ⚙️ Configuração

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# OpenAI (obrigatório)
OPENAI_API_KEY=your_openai_api_key

# Pinecone (obrigatório para RAG)
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_CONTROLLER_HOST=your_pinecone_controller_host  # Opcional

# Supabase (obrigatório para autenticação e armazenamento)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Google Generative AI (opcional, usado como alternativa ao OpenAI)
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key
```

### Configuração por Aplicação

Cada aplicação pode ter suas próprias variáveis de ambiente adicionais. Consulte:
- `apps/cli/` – Para configurações específicas do CLI
- `apps/github-app/` – Para configurações do GitHub App (APP_ID, PRIVATE_KEY, WEBHOOK_SECRET)
- `apps/frontend/` – Para configurações do frontend

## 🎯 Início Rápido

### CLI

```bash
# Executar o CLI em modo desenvolvimento
npm run dxgen

# Ou após build
npm run build
./apps/cli/dist/index.js generate
```

**Comandos disponíveis:**
- `dxgen login` – Autenticar no serviço
- `dxgen logout` – Fazer logout
- `dxgen status` – Verificar status da sessão
- `dxgen generate` – Gerar documentação (interativo)

**Exemplo de uso:**
```bash
$ dxgen generate

? Output directory for docs: ./docs
? Do you want to sync your project? Yes
? What types of documentation? README
? Style of the documentation: Onboarding for new users

◐ Scanning repository...
◐ Building semantic index...
◐ Generating documentation...

✅ Documentation saved!
📄 File: ./docs/README.md
```

### Frontend

```bash
cd apps/frontend
npm run dev
```

Acesse `http://localhost:3000` para ver a landing page.

### GitHub App

```bash
cd apps/github-app
npm run dev
```

Consulte [`apps/github-app/README.md`](apps/github-app/README.md) para instruções detalhadas de configuração.

## 📜 Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia todos os serviços em modo desenvolvimento usando Turborepo |
| `npm run dxgen` | Executa o CLI diretamente (modo desenvolvimento) |
| `npm run build` | Compila todos os pacotes e aplicações para produção |
| `npm run lint` | Executa o linter (Biome) em todo o projeto |
| `npm run test` | Executa os testes em todos os workspaces |

### Scripts por Workspace

Cada workspace pode ter scripts adicionais. Consulte os `package.json` individuais:
- `apps/cli/package.json`
- `apps/frontend/package.json`
- `apps/github-app/package.json`
- `packages/ai/package.json`
- `packages/rag/package.json`

## 🏛️ Arquitetura

DXGen é estruturado como um monorepo usando Turborepo, permitindo gerenciamento eficiente de múltiplas aplicações e bibliotecas compartilhadas.

### Visão Geral

```
┌─────────────┐     ┌─────────────┐
│     CLI     │     │  Frontend   │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │
         ┌───────▼────────┐
         │   @repo/ai     │
         └───────┬────────┘
                 │
         ┌───────▼────────┐
         │   @repo/rag    │
         └───────┬────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼───┐  ┌────▼────┐  ┌────▼────┐
│OpenAI │  │Pinecone │  │Supabase │
└───────┘  └─────────┘  └─────────┘
```

### Fluxo de Geração de Documentação

1. **Análise do Projeto**: O agente analisa a estrutura do projeto e detecta a stack tecnológica
2. **Recuperação de Contexto**: Utiliza RAG para recuperar documentos relevantes do código
3. **Geração**: O agente de IA gera documentação contextual usando LangGraph
4. **Validação**: Aplica guardrails para garantir qualidade e relevância
5. **Saída**: Salva a documentação gerada no diretório especificado

Para mais detalhes, consulte [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 🛠️ Tecnologias Utilizadas

### Core
- **LangChain** – Framework para aplicações LLM
- **LangGraph** – Construção de agentes de IA
- **TypeScript** – Linguagem principal
- **Turborepo** – Gerenciamento de monorepo

### Infraestrutura
- **OpenAI** – Modelos de linguagem
- **Google Generative AI** – Alternativa de modelos de linguagem
- **Pinecone** – Banco de dados vetorial para RAG
- **Supabase** – Backend como serviço (autenticação e armazenamento)

### Aplicações
- **Next.js** – Framework React para frontend
- **React** – Biblioteca UI
- **Ink** – CLI interativo em React
- **Probot** – Framework para GitHub Apps

### Ferramentas
- **Biome** – Linter e formatter
- **tsup** – Bundler TypeScript
- **Vitest** – Framework de testes

## 📚 Documentação Adicional

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) – Documentação detalhada da arquitetura
- [`docs/RUST_MIGRATION_SPEC.md`](docs/RUST_MIGRATION_SPEC.md) – Plano, critérios de paridade e benchmark da migração incremental para Rust
- [`docs/README.md`](docs/README.md) – Documentação geral do projeto
- [`apps/github-app/README.md`](apps/github-app/README.md) – Guia do GitHub App
- [`packages/rag/README.md`](packages/rag/README.md) – Documentação do pacote RAG

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor, siga estas diretrizes:

1. Faça um fork do repositório
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

### Desenvolvimento

```bash
# Instalar dependências
npm install

# Executar em modo desenvolvimento
npm run dev

# Executar linter
npm run lint

# Executar testes
npm run test
```

## 📄 Licença

Este projeto está licenciado sob a licença ISC. Veja o arquivo `LICENSE` para mais detalhes.

## 🙏 Agradecimentos

- [LangChain](https://www.langchain.com/) pela excelente framework
- [Turborepo](https://turbo.build/) pelo gerenciamento de monorepo
- Todos os contribuidores e mantenedores de projetos open source utilizados

---

<div align="center">
  <p>Feito com ❤️ pela equipe DXGen</p>
  <p>
    <a href="#-sobre-o-projeto">Voltar ao topo</a>
  </p>
</div>

