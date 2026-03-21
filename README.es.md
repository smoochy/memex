# memex

Memoria persistente para agentes de programación con IA. Tu agente recuerda lo que aprendió entre sesiones.

[English](./README.md) | [中文](./README.zh.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md)

![memex timeline view](screenshot.png)

## Qué hace

Cada vez que tu agente de IA termina una tarea, guarda conocimientos como tarjetas atómicas con `[[enlaces bidireccionales]]`. En la siguiente sesión, recupera las tarjetas relevantes antes de empezar a trabajar — construyendo sobre lo que ya sabe en lugar de partir desde cero.

```
Session 1: Agent fixes auth bug → saves insight about JWT revocation
Session 2: Agent works on session management → recalls JWT card, builds on prior knowledge
Session 3: Agent organizes card network → detects orphans, rebuilds keyword index
```

Sin base de datos vectorial, sin embeddings — solo archivos markdown que tu agente (y tú) pueden leer.

## Plataformas compatibles

| Plataforma | Integración | Experiencia |
|----------|------------|------------|
| **Claude Code** | Plugin (hooks + skills) | Óptima — auto-recall, slash commands, SessionStart hook |
| **VS Code / Copilot** | MCP Server | 6 tools + flujo de trabajo AGENTS.md |
| **Cursor** | MCP Server | 6 tools + flujo de trabajo AGENTS.md |
| **Codex** | MCP Server | 6 tools + flujo de trabajo AGENTS.md |
| **Windsurf** | MCP Server | 6 tools + flujo de trabajo AGENTS.md |
| **Cualquier cliente MCP** | MCP Server | 6 tools + flujo de trabajo AGENTS.md |

Todas las plataformas comparten el mismo directorio `~/.memex/cards/`. Una tarjeta escrita en Claude Code está disponible al instante en Cursor, Codex o cualquier otro cliente.

## Instalación

| Plataforma | Comando |
|----------|---------|
| **Cualquier editor** | `npx add-mcp @touchskyer/memex -- mcp` |
| **Claude Code** | `/plugin marketplace add iamtouchskyer/memex` luego `/plugin install memex@memex` |
| **VS Code / Copilot** | [Instalar desde MCP Registry](https://registry.modelcontextprotocol.io) o `code --add-mcp '{"name":"memex","command":"npx","args":["-y","@touchskyer/memex","mcp"]}'` |
| **Cursor** | [Instalación con un clic](cursor://anysphere.cursor-deeplink/mcp/install?name=memex&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkB0b3VjaHNreWVyL21lbWV4IiwibWNwIl19) |
| **Codex** | `codex mcp add memex -- npx -y @touchskyer/memex mcp` |
| **Windsurf / otros** | Añadir MCP server: comando `npx`, args `["-y", "@touchskyer/memex", "mcp"]` |

**Luego, en el directorio de tu proyecto:**

```bash
npx @touchskyer/memex init
```

Esto añade una sección memex a `AGENTS.md` que enseña a tu agente cuándo hacer recall y retro. Funciona con Cursor, Copilot, Codex y Windsurf. Los usuarios de Claude Code no necesitan esto — el plugin se encarga.

## Actualización

| Plataforma | Cómo |
|----------|-----|
| **Usuarios de npx** (VS Code, Cursor, Windsurf) | Automática — `npx -y` siempre obtiene la última versión |
| **Claude Code** | `npm update -g @touchskyer/memex` (el plugin se actualiza desde el marketplace) |
| **Codex / instalación global** | `npm update -g @touchskyer/memex` |

## Compartir entre plataformas

Todos los clientes leen y escriben en el mismo directorio `~/.memex/cards/`. Sincroniza entre dispositivos con git:

```bash
memex sync --init git@github.com:you/memex-cards.git
memex sync on
memex sync
memex sync off
```

## Explora tu memoria

```bash
memex serve
```

Abre una línea de tiempo visual de todas tus tarjetas en `localhost:3939`.

## Referencia CLI

```bash
memex search [query]          # buscar tarjetas, o listar todas
memex read <slug>             # leer una tarjeta
memex write <slug>            # escribir una tarjeta (stdin)
memex links [slug]            # estadísticas del grafo de enlaces
memex archive <slug>          # archivar una tarjeta
memex serve                   # interfaz visual de línea de tiempo
memex sync                    # sincronizar vía git
memex mcp                     # iniciar MCP server (stdio)
memex init                    # añadir sección memex a AGENTS.md
```

## Cómo funciona

Basado en el método Zettelkasten de Niklas Luhmann — el sistema detrás de 70 libros a partir de 90,000 tarjetas escritas a mano:

- **Notas atómicas** — una idea por tarjeta
- **En tus propias palabras** — fuerza la comprensión (el método Feynman)
- **Enlaces en contexto** — "esto se relaciona con [[X]] porque..." no solo etiquetas
- **Keyword index** — puntos de entrada curados a la red de tarjetas

Las tarjetas se almacenan como markdown en `~/.memex/cards/`. Ábrelas en Obsidian, edítalas con vim, búscalas con grep desde la terminal. Tu memoria nunca queda atrapada.

## Licencia

MIT
