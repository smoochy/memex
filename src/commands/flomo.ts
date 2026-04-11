import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parseFrontmatter, stringifyFrontmatter } from "../lib/parser.js";
import { CardStore } from "../lib/store.js";
import { autoSync } from "../lib/sync.js";

// ── Config ──────────────────────────────────────────────────────────

interface FlomoConfig {
  webhookUrl?: string;
}

export async function readFlomoConfig(memexHome: string): Promise<FlomoConfig> {
  const configPath = join(memexHome, ".memexrc");
  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);
    return {
      webhookUrl: typeof parsed.flomoWebhookUrl === "string" ? parsed.flomoWebhookUrl : undefined,
    };
  } catch {
    return {};
  }
}

export async function writeFlomoConfig(memexHome: string, webhookUrl: string): Promise<{ success: boolean; error?: string }> {
  if (!webhookUrl.startsWith("https://flomoapp.com/iwh/")) {
    return { success: false, error: "Invalid flomo webhook URL. Must start with https://flomoapp.com/iwh/" };
  }

  const configPath = join(memexHome, ".memexrc");
  let existing: Record<string, unknown> = {};
  try {
    const content = await readFile(configPath, "utf-8");
    existing = JSON.parse(content);
  } catch {
    // File doesn't exist or invalid — start fresh
  }
  existing.flomoWebhookUrl = webhookUrl;
  await writeFile(configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  return { success: true };
}

export async function flomoConfigCommand(
  memexHome: string,
  opts: { setWebhook?: string; show?: boolean }
): Promise<{ output: string; exitCode: number }> {
  if (opts.setWebhook) {
    const result = await writeFlomoConfig(memexHome, opts.setWebhook);
    if (!result.success) {
      return { output: `Error: ${result.error}`, exitCode: 1 };
    }
    return { output: "Flomo webhook URL configured.", exitCode: 0 };
  }

  // Default: show
  const config = await readFlomoConfig(memexHome);
  if (config.webhookUrl) {
    return { output: `Flomo webhook URL: ${config.webhookUrl}`, exitCode: 0 };
  }
  return { output: "Flomo webhook URL: (not configured)\nSet with: memex flomo config --set-webhook <url>", exitCode: 0 };
}

// ── Push ────────────────────────────────────────────────────────────

interface PushResult {
  slug: string;
  status: "pushed" | "skipped" | "error";
  message?: string;
}

function cardToFlomoContent(data: Record<string, unknown>, body: string): string {
  const parts: string[] = [];

  // Add title as first line
  if (data.title) {
    parts.push(`# ${data.title}`);
    parts.push("");
  }

  // Add body
  parts.push(body.trim());

  // Add tags from frontmatter
  const tags: string[] = [];
  if (typeof data.category === "string") tags.push(`#${data.category}`);
  if (typeof data.source === "string") tags.push(`#memex/${data.source}`);
  if (typeof data.tags === "string") {
    data.tags.split(/[,\s]+/).filter(Boolean).forEach((t: string) => {
      tags.push(t.startsWith("#") ? t : `#${t}`);
    });
  } else if (Array.isArray(data.tags)) {
    (data.tags as string[]).forEach((t: string) => {
      const s = String(t).trim();
      if (s) tags.push(s.startsWith("#") ? s : `#${s}`);
    });
  }
  if (tags.length > 0) {
    parts.push("");
    parts.push(tags.join(" "));
  }

  return parts.join("\n");
}

async function pushSingleCard(
  store: CardStore,
  slug: string,
  webhookUrl: string,
  dryRun: boolean,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<PushResult> {
  let raw: string;
  try {
    raw = await store.readCard(slug);
  } catch {
    return { slug, status: "error", message: `Card not found: ${slug}` };
  }

  const { data, content } = parseFrontmatter(raw);

  // Skip if already pushed
  if (data.flomoPushedAt) {
    return { slug, status: "skipped", message: `Already pushed at ${data.flomoPushedAt}` };
  }

  const flomoContent = cardToFlomoContent(data, content);

  if (dryRun) {
    return { slug, status: "pushed", message: `[dry-run] Would push:\n${flomoContent}` };
  }

  try {
    const response = await fetchFn(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: flomoContent }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return { slug, status: "error", message: `HTTP ${response.status}: ${await response.text()}` };
    }

    const result = await response.json() as { code: number; message: string };
    if (result.code !== 0) {
      return { slug, status: "error", message: `Flomo error: ${result.message}` };
    }

    // Record push timestamp in card frontmatter
    data.flomoPushedAt = new Date().toISOString().split("T")[0];
    const updated = stringifyFrontmatter(content, data);
    await store.writeCard(slug, updated);

    return { slug, status: "pushed", message: "OK" };
  } catch (e) {
    return { slug, status: "error", message: `Network error: ${(e as Error).message}` };
  }
}

export async function flomoPushCommand(
  store: CardStore,
  memexHome: string,
  slugOrOpts: string | undefined,
  opts: {
    all?: boolean;
    source?: string;
    tag?: string;
    dryRun?: boolean;
    fetchFn?: typeof globalThis.fetch;
  },
): Promise<{ output: string; exitCode: number }> {
  const config = await readFlomoConfig(memexHome);
  if (!config.webhookUrl) {
    return {
      output: "Error: Flomo webhook URL not configured.\nRun: memex flomo config --set-webhook <url>",
      exitCode: 1,
    };
  }

  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const dryRun = opts.dryRun ?? false;

  // Determine which cards to push
  let slugs: string[];

  if (slugOrOpts && !opts.all) {
    // Single card
    slugs = [slugOrOpts];
  } else {
    // Batch: scan all cards and filter
    const all = await store.scanAll();
    const filteredSlugs: string[] = [];

    for (const card of all) {
      const raw = await store.readCard(card.slug);
      const { data } = parseFrontmatter(raw);

      if (opts.source && data.source !== opts.source) continue;
      if (opts.tag) {
        const tagSet = new Set<string>();
        if (typeof data.tags === "string") {
          data.tags.split(/[,\s]+/).filter(Boolean).forEach((t: string) => tagSet.add(t));
        } else if (Array.isArray(data.tags)) {
          (data.tags as string[]).forEach((t: string) => tagSet.add(String(t).trim()));
        }
        const cardCategory = typeof data.category === "string" ? data.category : "";
        if (!tagSet.has(opts.tag) && cardCategory !== opts.tag) continue;
      }

      filteredSlugs.push(card.slug);
    }
    slugs = filteredSlugs;
  }

  if (slugs.length === 0) {
    return { output: "No cards matched the filter criteria.", exitCode: 0 };
  }

  const results: PushResult[] = [];
  for (const slug of slugs) {
    const result = await pushSingleCard(store, slug, config.webhookUrl, dryRun, fetchFn);
    results.push(result);
  }

  // Sync after push if any cards were modified
  if (!dryRun && results.some(r => r.status === "pushed")) {
    await autoSync(dirname(store.cardsDir));
  }

  const pushed = results.filter(r => r.status === "pushed").length;
  const skipped = results.filter(r => r.status === "skipped").length;
  const errors = results.filter(r => r.status === "error").length;

  const lines: string[] = [];
  for (const r of results) {
    const icon = r.status === "pushed" ? "✓" : r.status === "skipped" ? "⏭" : "✗";
    lines.push(`${icon} ${r.slug}: ${r.message}`);
  }

  lines.push("");
  lines.push(`Summary: ${pushed} pushed, ${skipped} skipped, ${errors} errors`);

  return {
    output: lines.join("\n"),
    exitCode: errors > 0 ? 1 : 0,
  };
}
