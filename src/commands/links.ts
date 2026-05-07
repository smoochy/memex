import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { readFile } from "node:fs/promises";
import { CardStore } from "../lib/store.js";
import { parseFrontmatter, extractLinks } from "../lib/parser.js";
import { formatLinkStats, formatCardLinks, LinkStatsItem } from "../lib/formatter.js";

const HUB_THRESHOLD = 10;

interface LinksResult {
  output: string;
  exitCode: number;
}

export interface LinksOptions {
  filter?: "orphan" | "hub";
  stats?: boolean;
  json?: boolean;
  home?: string;
  extraLinkDirs?: string[];
}

export async function linksCommand(store: CardStore, slug: string | undefined, opts?: LinksOptions): Promise<LinksResult> {
  const cards = await store.scanAll();
  if (cards.length === 0) return { output: "", exitCode: 0 };

  const resolveLink = store.buildLinkResolver(cards);
  const outboundMap = new Map<string, string[]>();
  const inboundMap = new Map<string, string[]>();

  for (const card of cards) {
    inboundMap.set(card.slug, []);
  }

  for (const card of cards) {
    const raw = await store.readCard(card.slug);
    const { content } = parseFrontmatter(raw);
    const links = extractLinks(content);
    outboundMap.set(card.slug, links);

    for (const link of links) {
      const resolved = resolveLink(link) ?? link;
      const existing = inboundMap.get(resolved) || [];
      existing.push(card.slug);
      inboundMap.set(resolved, existing);
    }
  }

  // Scan extraLinkDirs for inbound links to cards
  if (opts?.home && opts?.extraLinkDirs && opts.extraLinkDirs.length > 0) {
    for (const dirName of opts.extraLinkDirs) {
      const extraFiles = await scanMarkdownFiles(join(opts.home, dirName));
      for (const file of extraFiles) {
        const raw = await readFile(file.path, "utf-8");
        const { content } = parseFrontmatter(raw);
        const links = extractLinks(content);
        for (const link of links) {
          const resolved = resolveLink(link) ?? link;
          if (inboundMap.has(resolved)) {
            const existing = inboundMap.get(resolved)!;
            existing.push(`~${file.slug}`);
          }
        }
      }
    }
  }

  if (slug) {
    const outbound = outboundMap.get(slug) || [];
    const inbound = inboundMap.get(slug) || [];
    if (opts?.json) {
      return { output: JSON.stringify({ slug, outbound, inbound }, null, 2), exitCode: 0 };
    }
    return { output: formatCardLinks(slug, outbound, inbound), exitCode: 0 };
  }

  let stats: LinkStatsItem[] = cards.map((card) => ({
    slug: card.slug,
    outbound: (outboundMap.get(card.slug) || []).length,
    inbound: (inboundMap.get(card.slug) || []).length,
  }));

  const filter = opts?.filter;
  if (filter === "orphan") {
    stats = stats.filter((s) => s.inbound === 0);
  } else if (filter === "hub") {
    stats = stats.filter((s) => s.inbound >= HUB_THRESHOLD);
  }

  if (opts?.json) {
    if (opts?.stats) {
      const orphans = stats.filter((s) => s.inbound === 0).length;
      const hubs = stats.filter((s) => s.inbound >= HUB_THRESHOLD).length;
      const totalOut = stats.reduce((sum, s) => sum + s.outbound, 0);
      const totalIn = stats.reduce((sum, s) => sum + s.inbound, 0);
      return {
        output: JSON.stringify({
          totalCards: cards.length,
          showing: filter || "all",
          count: stats.length,
          orphans,
          hubs,
          avgOutbound: stats.length > 0 ? +(totalOut / stats.length).toFixed(1) : 0,
          avgInbound: stats.length > 0 ? +(totalIn / stats.length).toFixed(1) : 0,
        }, null, 2),
        exitCode: 0,
      };
    }
    return { output: JSON.stringify(stats, null, 2), exitCode: 0 };
  }

  if (opts?.stats) {
    return { output: formatLinkSummary(stats, cards.length, filter), exitCode: 0 };
  }

  return { output: formatLinkStats(stats), exitCode: 0 };
}

function formatLinkSummary(stats: LinkStatsItem[], totalCards: number, filter?: string): string {
  const orphans = stats.filter((s) => s.inbound === 0).length;
  const hubs = stats.filter((s) => s.inbound >= HUB_THRESHOLD).length;
  const totalOut = stats.reduce((sum, s) => sum + s.outbound, 0);
  const totalIn = stats.reduce((sum, s) => sum + s.inbound, 0);
  const avgOut = stats.length > 0 ? (totalOut / stats.length).toFixed(1) : "0";
  const avgIn = stats.length > 0 ? (totalIn / stats.length).toFixed(1) : "0";

  const lines: string[] = [];
  if (filter) {
    lines.push(`Showing: ${filter} (${stats.length} cards)`);
    lines.push(`Total cards: ${totalCards}`);
  } else {
    lines.push(`Total cards: ${totalCards}`);
  }
  lines.push(`Orphans (0 inbound): ${orphans}`);
  lines.push(`Hubs (${HUB_THRESHOLD}+ inbound): ${hubs}`);
  lines.push(`Avg outbound links: ${avgOut}`);
  lines.push(`Avg inbound links: ${avgIn}`);
  return lines.join("\n");
}

/** Recursively scan a directory for .md files, returning slug + path */
async function scanMarkdownFiles(dir: string): Promise<{ slug: string; path: string }[]> {
  const results: { slug: string; path: string }[] = [];
  async function walk(d: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push({ slug: basename(entry.name, ".md"), path: fullPath });
      }
    }
  }
  await walk(dir);
  return results;
}
