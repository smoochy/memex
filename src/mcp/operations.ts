import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CardStore } from "../lib/store.js";
import { HookRegistry } from "../lib/hooks.js";
import { searchCommand } from "../commands/search.js";
import { readCommand } from "../commands/read.js";
import { writeCommand } from "../commands/write.js";
import { linksCommand } from "../commands/links.js";
import { initCommand } from "../commands/init.js";
import { stringifyFrontmatter } from "../lib/parser.js";
import { GitAdapter, readSyncConfig } from "../lib/sync.js";
import { z } from "zod";

export function registerOperations(
  server: McpServer,
  store: CardStore,
  hooks: HookRegistry,
  home: string,
  getClientName: () => string,
): void {
  // ---- recall ----
  server.registerTool("memex_recall", {
    description: "Recall relevant memory before starting a task. Returns the keyword index (if exists) or card list. Optionally search by query. Always call this at the start of a task.",
    inputSchema: z.object({
      query: z.string().optional().describe("Optional search query to find specific cards"),
    }),
  }, async ({ query }) => {
    await hooks.run("pre", "recall");

    if (query) {
      const result = await searchCommand(store, query, { limit: 10 });
      return { content: [{ type: "text" as const, text: result.output || "No cards found." }] };
    }

    // Try index first, fall back to card list
    const indexResult = await readCommand(store, "index");
    if (indexResult.success) {
      return { content: [{ type: "text" as const, text: indexResult.content! }] };
    }

    const listResult = await searchCommand(store, undefined, {});
    return { content: [{ type: "text" as const, text: listResult.output || "No cards yet." }] };
  });

  // ---- retro ----
  server.registerTool("memex_retro", {
    description: "Save an insight after completing a task. Handles frontmatter, source injection, and sync automatically. Call this at the end of a task when you learned something worth remembering.",
    inputSchema: z.object({
      slug: z.string().describe("Card slug in kebab-case"),
      title: z.string().describe("Card title"),
      body: z.string().describe("Card body in markdown with [[wikilinks]]"),
      category: z.string().optional().describe("Category (e.g. frontend, architecture, devops, bugfix)"),
    }),
  }, async ({ slug, title, body, category }) => {
    await hooks.run("pre", "retro");

    const today = new Date().toISOString().split("T")[0];
    const data: Record<string, unknown> = {
      title,
      created: today,
      source: getClientName(),
    };
    if (category) data.category = category;
    const content = stringifyFrontmatter(body, data);

    const result = await writeCommand(store, slug, content);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error! }], isError: true };
    }

    await hooks.run("post", "retro");

    // Upsell init if sync not configured
    const config = await readSyncConfig(home);
    const tip = !config.remote
      ? "\n\nTip: Run `memex init` to enable cross-device sync."
      : "";

    return { content: [{ type: "text" as const, text: `Card '${slug}' saved.${tip}` }] };
  });

  // ---- organize ----
  server.registerTool("memex_organize", {
    description: "Analyze the card network for maintenance. Returns link stats, orphans, and hubs. Call periodically to keep the knowledge graph healthy.",
    inputSchema: z.object({}),
  }, async () => {
    await hooks.run("pre", "organize");

    const result = await linksCommand(store, undefined);

    await hooks.run("post", "organize");

    return { content: [{ type: "text" as const, text: result.output || "No cards found." }] };
  });

  // ---- pull ----
  server.registerTool("memex_pull", {
    description: "Pull latest cards from remote. Use to get changes from other devices.",
    inputSchema: z.object({}),
  }, async () => {
    await hooks.run("pre", "pull");

    const config = await readSyncConfig(home);
    if (!config.remote) {
      return { content: [{ type: "text" as const, text: "Sync not configured. Run `memex init` to set up." }] };
    }
    const adapter = new GitAdapter(home);
    const result = await adapter.pull();

    await hooks.run("post", "pull");

    return { content: [{ type: "text" as const, text: result.message }], isError: !result.success };
  });

  // ---- push ----
  server.registerTool("memex_push", {
    description: "Push local cards to remote. Use after writing cards to sync to other devices.",
    inputSchema: z.object({}),
  }, async () => {
    await hooks.run("pre", "push");

    const config = await readSyncConfig(home);
    if (!config.remote) {
      return { content: [{ type: "text" as const, text: "Sync not configured. Run `memex init` to set up." }] };
    }
    const adapter = new GitAdapter(home);
    const result = await adapter.push();

    await hooks.run("post", "push");

    return { content: [{ type: "text" as const, text: result.message }], isError: !result.success };
  });

  // ---- init ----
  server.registerTool("memex_init", {
    description: "Set up memex in the current project. Creates AGENTS.md with memory workflow instructions.",
    inputSchema: z.object({
      dir: z.string().optional().describe("Project directory (defaults to cwd)"),
    }),
  }, async ({ dir }) => {
    const result = await initCommand(dir || process.cwd());
    return { content: [{ type: "text" as const, text: result.output || result.error || "" }], isError: !result.success };
  });
}
