# memex

AI 编程 agent 的持久记忆。你的 agent 能跨 session 记住它学到的东西。

[English](./README.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md)

![memex timeline view](screenshot.png)

## 它做什么

每次你的 AI agent 完成任务后，它会把洞察保存为带有 `[[双向链接]]` 的原子知识卡片。下一个 session 开始时，它会先回忆相关卡片——基于已有知识继续工作，而不是从零开始。

```
Session 1: Agent 修复 auth bug → 保存关于 JWT revocation 的洞察
Session 2: Agent 处理 session 管理 → 回忆 JWT 卡片，基于已有知识继续
Session 3: Agent 整理卡片网络 → 检测孤立卡片，重建 keyword index
```

不需要向量数据库，不需要 embeddings——只是你的 agent（和你）都能读的 markdown 文件。

## 支持的平台

| 平台 | 集成方式 | 体验 |
|----------|------------|------------|
| **Claude Code** | Plugin (hooks + skills) | 最佳——自动回忆、slash commands、SessionStart hook |
| **VS Code / Copilot** | MCP Server | 6 个工具 + AGENTS.md 工作流 |
| **Cursor** | MCP Server | 6 个工具 + AGENTS.md 工作流 |
| **Codex** | MCP Server | 6 个工具 + AGENTS.md 工作流 |
| **Windsurf** | MCP Server | 6 个工具 + AGENTS.md 工作流 |
| **任何 MCP 客户端** | MCP Server | 6 个工具 + AGENTS.md 工作流 |

所有平台共享同一个 `~/.memex/cards/` 目录。在 Claude Code 中写的卡片，在 Cursor、Codex 或任何其他客户端中都能立即使用。

## 安装

| 平台 | 命令 |
|----------|---------|
| **任何编辑器** | `npx add-mcp @touchskyer/memex -- mcp` |
| **Claude Code** | `/plugin marketplace add iamtouchskyer/memex` 然后 `/plugin install memex@memex` |
| **VS Code / Copilot** | [从 MCP Registry 安装](https://registry.modelcontextprotocol.io) 或 `code --add-mcp '{"name":"memex","command":"npx","args":["-y","@touchskyer/memex","mcp"]}'` |
| **Cursor** | [一键安装](cursor://anysphere.cursor-deeplink/mcp/install?name=memex&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkB0b3VjaHNreWVyL21lbWV4IiwibWNwIl19) |
| **Codex** | `codex mcp add memex -- npx -y @touchskyer/memex mcp` |
| **Windsurf / 其他** | 添加 MCP server: command `npx`, args `["-y", "@touchskyer/memex", "mcp"]` |

**然后，在你的项目目录中：**

```bash
npx @touchskyer/memex init
```

这会在 `AGENTS.md` 中添加一个 memex 段落，教你的 agent 何时 recall 和 retro。适用于 Cursor、Copilot、Codex 和 Windsurf。Claude Code 用户不需要这一步——plugin 会自动处理。

## 升级

| 平台 | 方法 |
|----------|-----|
| **npx 用户** (VS Code, Cursor, Windsurf) | 自动——`npx -y` 总是拉取最新版 |
| **Claude Code** | `npm update -g @touchskyer/memex`（plugin 从 marketplace 更新） |
| **Codex / 全局安装** | `npm update -g @touchskyer/memex` |

## 跨平台共享

所有客户端读写同一个 `~/.memex/cards/` 目录。通过 git 在设备间同步：

```bash
memex sync --init git@github.com:you/memex-cards.git
memex sync on      # 每次写入后自动同步
memex sync         # 手动同步
memex sync off     # 关闭自动同步
```

## 浏览你的记忆

```bash
memex serve
```

在 `localhost:3939` 打开所有卡片的可视化时间线。

## CLI 参考

```bash
memex search [query]          # 搜索卡片，或列出全部
memex read <slug>             # 读取一张卡片
memex write <slug>            # 写入一张卡片（stdin）
memex links [slug]            # 链接图谱统计
memex archive <slug>          # 归档一张卡片
memex serve                   # 可视化时间线 UI
memex sync                    # 通过 git 同步
memex mcp                     # 启动 MCP server（stdio）
memex init                    # 在 AGENTS.md 中添加 memex 段落
```

## 工作原理

基于 Niklas Luhmann 的 Zettelkasten 方法——这套系统让他用 90,000 张手写卡片写出了 70 本书：

- **原子笔记** — 每张卡片一个想法
- **用自己的话** — 迫使你真正理解（Feynman 方法）
- **带上下文的链接** — "这与 [[X]] 相关，因为……" 而不只是标签
- **关键词索引** — 精心策划的卡片网络入口

卡片以 markdown 格式存储在 `~/.memex/cards/` 中。用 Obsidian 打开，用 vim 编辑，在终端用 grep 搜索。你的记忆永远不会被锁定。

## License

MIT
