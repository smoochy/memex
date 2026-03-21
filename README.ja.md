# memex

AI コーディングエージェントのための永続メモリ。エージェントがセッションをまたいで学んだことを記憶します。

[English](./README.md) | [中文](./README.zh.md) | [한국어](./README.ko.md) | [Español](./README.es.md)

![memex timeline view](screenshot.png)

## 何ができるか

AI エージェントがタスクを完了するたびに、`[[双方向リンク]]` 付きのアトミックなナレッジカードとしてインサイトを保存します。次のセッションでは、作業開始前に関連カードを呼び出し、ゼロからではなく既存の知識の上に構築します。

```
Session 1: エージェントが認証バグを修正 → JWT revocation に関するインサイトを保存
Session 2: エージェントがセッション管理に取り組む → JWT カードを呼び出し、既存知識を活用
Session 3: エージェントがカードネットワークを整理 → 孤立カードを検出し、キーワードインデックスを再構築
```

ベクトルデータベースも embedding も不要 — エージェント（とあなた）が読める markdown ファイルだけです。

## 対応プラットフォーム

| プラットフォーム | 統合方式 | 体験 |
|----------|------------|------------|
| **Claude Code** | Plugin (hooks + skills) | 最高 — 自動 recall、スラッシュコマンド、SessionStart hook |
| **VS Code / Copilot** | MCP Server | 6 tools + AGENTS.md ワークフロー |
| **Cursor** | MCP Server | 6 tools + AGENTS.md ワークフロー |
| **Codex** | MCP Server | 6 tools + AGENTS.md ワークフロー |
| **Windsurf** | MCP Server | 6 tools + AGENTS.md ワークフロー |
| **任意の MCP クライアント** | MCP Server | 6 tools + AGENTS.md ワークフロー |

すべてのプラットフォームが同じ `~/.memex/cards/` ディレクトリを共有します。Claude Code で作成したカードは、Cursor、Codex、その他のクライアントから即座に利用可能です。

## インストール

| プラットフォーム | コマンド |
|----------|---------|
| **任意のエディタ** | `npx add-mcp @touchskyer/memex -- mcp` |
| **Claude Code** | `/plugin marketplace add iamtouchskyer/memex` → `/plugin install memex@memex` |
| **VS Code / Copilot** | [MCP Registry からインストール](https://registry.modelcontextprotocol.io) または `code --add-mcp '{"name":"memex","command":"npx","args":["-y","@touchskyer/memex","mcp"]}'` |
| **Cursor** | [ワンクリックインストール](cursor://anysphere.cursor-deeplink/mcp/install?name=memex&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkB0b3VjaHNreWVyL21lbWV4IiwibWNwIl19) |
| **Codex** | `codex mcp add memex -- npx -y @touchskyer/memex mcp` |
| **Windsurf / その他** | MCP server を追加: command `npx`, args `["-y", "@touchskyer/memex", "mcp"]` |

**次に、プロジェクトディレクトリで：**

```bash
npx @touchskyer/memex init
```

これにより `AGENTS.md` に memex セクションが追加され、エージェントに recall と retro のタイミングを教えます。Cursor、Copilot、Codex、Windsurf で動作します。Claude Code ユーザーはこの手順は不要です — プラグインが自動で処理します。

## アップグレード

| プラットフォーム | 方法 |
|----------|-----|
| **npx ユーザー** (VS Code, Cursor, Windsurf) | 自動 — `npx -y` は常に最新版を取得 |
| **Claude Code** | `npm update -g @touchskyer/memex`（プラグインは marketplace から更新） |
| **Codex / グローバルインストール** | `npm update -g @touchskyer/memex` |

## クロスプラットフォーム共有

すべてのクライアントが同じ `~/.memex/cards/` ディレクトリを読み書きします。git でデバイス間を同期：

```bash
memex sync --init git@github.com:you/memex-cards.git
memex sync on
memex sync
memex sync off
```

## メモリを閲覧する

```bash
memex serve
```

`localhost:3939` ですべてのカードのビジュアルタイムラインを表示します。

## CLI リファレンス

```bash
memex search [query]          # カードを検索、またはすべて一覧
memex read <slug>             # カードを読む
memex write <slug>            # カードを書く（stdin）
memex links [slug]            # リンクグラフの統計
memex archive <slug>          # カードをアーカイブ
memex serve                   # ビジュアルタイムライン UI
memex sync                    # git 経由で同期
memex mcp                     # MCP server を起動（stdio）
memex init                    # AGENTS.md に memex セクションを追加
```

## 仕組み

Niklas Luhmann の Zettelkasten メソッドに基づいています — 90,000 枚の手書きカードから 70 冊の著作を生み出したシステムです：

- **アトミックノート** — 1 カードに 1 アイデア
- **自分の言葉で** — 理解を強制する（Feynman メソッド）
- **文脈付きリンク** — 単なるタグではなく「これは [[X]] と関連する、なぜなら…」
- **キーワードインデックス** — カードネットワークへの厳選されたエントリーポイント

カードは `~/.memex/cards/` に markdown として保存されます。Obsidian で開き、vim で編集し、ターミナルから grep できます。あなたのメモリは決してロックインされません。

## ライセンス

MIT
