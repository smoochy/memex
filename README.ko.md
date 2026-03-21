# memex

AI 코딩 에이전트를 위한 영속적 메모리. 에이전트가 세션을 넘어 학습한 내용을 기억합니다.

[English](./README.md) | [中文](./README.zh.md) | [日本語](./README.ja.md) | [Español](./README.es.md)

![memex timeline view](screenshot.png)

## 기능

AI 에이전트가 작업을 마칠 때마다 `[[양방향 링크]]`가 포함된 원자적 지식 카드로 인사이트를 저장합니다. 다음 세션에서는 작업을 시작하기 전에 관련 카드를 불러와 — 처음부터 다시 시작하는 대신 이미 알고 있는 지식 위에 쌓아갑니다.

```
Session 1: 에이전트가 인증 버그 수정 → JWT revocation에 대한 인사이트 저장
Session 2: 에이전트가 세션 관리 작업 → JWT 카드를 불러와 기존 지식 위에 구축
Session 3: 에이전트가 카드 네트워크 정리 → 고아 카드 감지, 키워드 인덱스 재구축
```

Vector database도, embedding도 없이 — 에이전트(그리고 당신)가 읽을 수 있는 마크다운 파일만으로 동작합니다.

## 지원 플랫폼

| 플랫폼 | 연동 방식 | 경험 |
|----------|------------|------------|
| **Claude Code** | Plugin (hooks + skills) | 최상 — 자동 recall, slash commands, SessionStart hook |
| **VS Code / Copilot** | MCP Server | 6개 도구 + AGENTS.md workflow |
| **Cursor** | MCP Server | 6개 도구 + AGENTS.md workflow |
| **Codex** | MCP Server | 6개 도구 + AGENTS.md workflow |
| **Windsurf** | MCP Server | 6개 도구 + AGENTS.md workflow |
| **모든 MCP client** | MCP Server | 6개 도구 + AGENTS.md workflow |

모든 플랫폼이 동일한 `~/.memex/cards/` 디렉토리를 공유합니다. Claude Code에서 작성한 카드는 Cursor, Codex 또는 다른 클라이언트에서 즉시 사용할 수 있습니다.

## 설치

| 플랫폼 | 명령어 |
|----------|---------|
| **모든 에디터** | `npx add-mcp @touchskyer/memex -- mcp` |
| **Claude Code** | `/plugin marketplace add iamtouchskyer/memex` 후 `/plugin install memex@memex` |
| **VS Code / Copilot** | [MCP Registry에서 설치](https://registry.modelcontextprotocol.io) 또는 `code --add-mcp '{"name":"memex","command":"npx","args":["-y","@touchskyer/memex","mcp"]}'` |
| **Cursor** | [원클릭 설치](cursor://anysphere.cursor-deeplink/mcp/install?name=memex&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkB0b3VjaHNreWVyL21lbWV4IiwibWNwIl19) |
| **Codex** | `codex mcp add memex -- npx -y @touchskyer/memex mcp` |
| **Windsurf / 기타** | MCP server 추가: command `npx`, args `["-y", "@touchskyer/memex", "mcp"]` |

**그런 다음, 프로젝트 디렉토리에서:**

```bash
npx @touchskyer/memex init
```

이 명령은 `AGENTS.md`에 memex 섹션을 추가하여 에이전트에게 언제 recall하고 retro할지 알려줍니다. Cursor, Copilot, Codex, Windsurf에서 작동합니다. Claude Code 사용자는 이 과정이 필요 없습니다 — 플러그인이 자동으로 처리합니다.

## 업그레이드

| 플랫폼 | 방법 |
|----------|-----|
| **npx 사용자** (VS Code, Cursor, Windsurf) | 자동 — `npx -y`가 항상 최신 버전을 가져옵니다 |
| **Claude Code** | `npm update -g @touchskyer/memex` (플러그인은 marketplace에서 업데이트) |
| **Codex / 글로벌 설치** | `npm update -g @touchskyer/memex` |

## 크로스 플랫폼 공유

모든 클라이언트가 동일한 `~/.memex/cards/` 디렉토리를 읽고 씁니다. git으로 기기 간 동기화:

```bash
memex sync --init git@github.com:you/memex-cards.git
memex sync on
memex sync
memex sync off
```

## 메모리 탐색

```bash
memex serve
```

`localhost:3939`에서 모든 카드의 시각적 타임라인을 엽니다.

## CLI 레퍼런스

```bash
memex search [query]          # 카드 검색 또는 전체 목록
memex read <slug>             # 카드 읽기
memex write <slug>            # 카드 작성 (stdin)
memex links [slug]            # 링크 그래프 통계
memex archive <slug>          # 카드 아카이브
memex serve                   # 시각적 타임라인 UI
memex sync                    # git으로 동기화
memex mcp                     # MCP server 시작 (stdio)
memex init                    # AGENTS.md에 memex 섹션 추가
```

## 작동 원리

Niklas Luhmann의 Zettelkasten 방법론에 기반합니다 — 90,000장의 수기 카드에서 70권의 책을 만들어낸 시스템:

- **원자적 노트** — 카드 하나에 아이디어 하나
- **자신의 말로** — 이해를 강제합니다 (Feynman method)
- **맥락 속의 링크** — 단순한 태그가 아닌 "이것은 [[X]]와 관련된다, 왜냐하면..."
- **키워드 인덱스** — 카드 네트워크로의 큐레이션된 진입점

카드는 `~/.memex/cards/`에 마크다운으로 저장됩니다. Obsidian으로 열고, vim으로 편집하고, 터미널에서 grep하세요. 당신의 메모리는 절대 잠기지 않습니다.

## License

MIT
