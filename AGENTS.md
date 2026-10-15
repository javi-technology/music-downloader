# AGENTS.md — Music Downloader

Guia obrigatório para qualquer agente (humano ou IA) que contribua neste repositório.

> **Idioma:** toda comunicação com o usuário, descrições de issues e PRs deve ser em **português**.

## Visão geral

Sistema para baixar músicas a partir de links do Spotify (faixa, álbum ou playlist). A lógica do
backend replica a do [spotDL](https://github.com/spotdl/spotify-downloader):

1. Interpretar a URL do Spotify;
2. Buscar metadados na Spotify Web API;
3. Encontrar o melhor correspondente no YouTube Music (score por título, artistas e duração);
4. Baixar o áudio (yt-dlp) e converter para MP3 (ffmpeg);
5. Gravar tags ID3 (título, artistas, álbum, capa, número da faixa, ano);
6. Salvar o arquivo no Storage e registrar o status no Firestore.

O spotDL é escrito em Python e não roda em Cloud Functions Node, por isso a lógica é **replicada em
TypeScript** em `functions/src`.

## Stack

| Camada    | Tecnologia                                              |
| --------- | ------------------------------------------------------- |
| Frontend  | Angular (latest, standalone, zoneless) + TailwindCSS v4 |
| Backend   | Firebase Cloud Functions (2ª geração) em TypeScript     |
| Banco     | Cloud Firestore (database nomeado)                      |
| Arquivos  | Cloud Storage for Firebase (bucket dedicado)            |
| Testes    | Vitest (web e functions)                                |

## Estrutura do projeto

```
music-downloader/
├── AGENTS.md               # Este guia (fonte da verdade para agentes)
├── CLAUDE.md               # Aponta para o AGENTS.md
├── firebase.json           # Config Firebase (somente recursos deste sistema)
├── .firebaserc             # Projeto javitech-8797d + targets de storage/hosting
├── firestore.rules         # Regras do database `music-downloader`
├── firestore.indexes.json  # Índices do database `music-downloader`
├── storage.rules           # Regras do bucket `javitech-8797d-music-downloader`
├── package.json            # Scripts agregados (test, build, deploy)
├── functions/              # Backend — Cloud Functions em TypeScript
│   ├── src/
│   │   ├── index.ts        # Ponto de entrada: exporta SOMENTE funções com prefixo `md`
│   │   ├── config.ts       # IDs de todos os recursos isolados (database, bucket, região...)
│   │   └── **/*.spec.ts    # Testes ao lado do código testado
│   └── vitest.config.ts
└── web/                    # Frontend — Angular + Tailwind
    └── src/app/            # Componentes, serviços e rotas (testes *.spec.ts ao lado)
```

## Projeto Firebase compartilhado — isolamento OBRIGATÓRIO

O projeto `javitech-8797d` é **compartilhado** com outros sistemas. Todo recurso deste sistema
precisa ser exclusivo dele. Os identificadores ficam centralizados em `functions/src/config.ts`.

| Recurso   | Identificador exclusivo                                         |
| --------- | --------------------------------------------------------------- |
| Firestore | database nomeado **`music-downloader`** (nunca o `(default)`)   |
| Storage   | bucket **`javitech-8797d-music-downloader`**, prefixo `music-downloader/` |
| Functions | codebase **`music-downloader`**, nomes com prefixo **`md`** (ex.: `mdCreateDownloadJob`) |
| Secrets   | prefixo **`MUSIC_DOWNLOADER_`** (ex.: `MUSIC_DOWNLOADER_SPOTIFY_CLIENT_ID`) |
| Hosting   | target `music-downloader` → site `javitech-music-downloader`    |
| Região    | `southamerica-east1`                                            |

Regras:

- **Nunca** rode `firebase deploy` sem `--only`. Use `npm run deploy` (raiz), que restringe a
  `functions:music-downloader,firestore,storage,hosting:music-downloader`.
- **Nunca** use o database `(default)`, o bucket default ou crie funções sem o prefixo `md`.
- O Firebase Authentication é compartilhado no projeto (não é isolável); use-o apenas para
  identificar o usuário (`ownerUid`).

### Provisionamento (uma única vez)

```bash
gcloud firestore databases create --database=music-downloader --location=southamerica-east1 --project=javitech-8797d
gcloud storage buckets create gs://javitech-8797d-music-downloader --location=southamerica-east1 --project=javitech-8797d
# Vincular o bucket ao Firebase: Console > Storage > "Adicionar bucket" > importar o bucket acima
firebase hosting:sites:create javitech-music-downloader --project javitech-8797d
firebase functions:secrets:set MUSIC_DOWNLOADER_SPOTIFY_CLIENT_ID --project javitech-8797d
firebase functions:secrets:set MUSIC_DOWNLOADER_SPOTIFY_CLIENT_SECRET --project javitech-8797d
```

## TDD é OBRIGATÓRIO — RED → GREEN → REFACTOR

Nenhum código de produção é escrito sem um teste falhando antes.

1. **RED** — escreva o teste que descreve o comportamento desejado. Rode e **confirme que falha**
   pelo motivo certo.
2. **GREEN** — escreva o mínimo de código de produção para o teste passar. Rode e confirme.
3. **REFACTOR** — melhore o código (nomes, duplicação, estrutura) mantendo todos os testes verdes.

Diretrizes:

- Testes ficam ao lado do código (`foo.ts` → `foo.spec.ts`) e são escritos em português.
- Isole I/O (Spotify API, YouTube, yt-dlp, ffmpeg, Firestore, Storage) atrás de interfaces/portas
  injetáveis, para que a lógica de domínio seja testada sem rede.
- Um PR só é aberto com **todos os testes passando**: `npm test` (raiz).

Comandos:

```bash
npm --prefix functions test          # testes do backend
npm --prefix functions run test:watch
npm --prefix web test -- --watch=false   # testes do frontend
npm test                             # tudo
```

## Fluxo de desenvolvimento

1. **NUNCA commite na `main`.** Toda mudança entra via Pull Request.
2. **Sempre desenvolva com uma issue aberta.** Se não existir, crie antes de começar
   (`gh issue create`).
3. A branch **SEMPRE** segue o modelo **`issue-<numero>`** (ex.: `issue-12`), criada a partir da
   `main` atualizada:
   ```bash
   git checkout main && git pull
   git checkout -b issue-12
   ```
4. Desenvolva em ciclos TDD, commitando com frequência.
5. Abra o PR para a `main` referenciando a issue (`Closes #12`).

## Conventional Commits

Todos os commits seguem [Conventional Commits](https://www.conventionalcommits.org/pt-br/):

```
<tipo>(<escopo opcional>): <descrição no imperativo>
```

- Tipos: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `build`, `ci`, `style`, `perf`.
- O **escopo é o número da issue** (`#N`), seguindo o template de PR (`.github/PULL_REQUEST_TEMPLATE.md`).
- O ciclo TDD aparece no histórico:
  - `test(#2): adiciona casos do parser de URL do Spotify` (RED)
  - `feat(#2): implementa parser de URL do Spotify` (GREEN)
  - `refactor(#2): extrai normalização de IDs` (REFACTOR)
- Mudanças incompatíveis: `feat!:` ou rodapé `BREAKING CHANGE:`.
