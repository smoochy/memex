import { CardStore } from "../lib/store.js";
import { parseFrontmatter, extractLinks } from "../lib/parser.js";
import { formatCardList, formatSearchResult } from "../lib/formatter.js";

const DEFAULT_LIMIT = 10;

interface SearchOptions {
  limit?: number;
}

interface SearchResult {
  output: string;
  exitCode: number;
}

export async function searchCommand(store: CardStore, query: string | undefined, options: SearchOptions = {}): Promise<SearchResult> {
  const cards = await store.scanAll();
  if (cards.length === 0) return { output: "", exitCode: 0 };

  // No query: list all cards
  if (!query) {
    const items = await Promise.all(
      cards.map(async (c) => {
        const raw = await store.readCard(c.slug);
        const { data } = parseFrontmatter(raw);
        return { slug: c.slug, title: String(data.title || c.slug) };
      })
    );
    return { output: formatCardList(items), exitCode: 0 };
  }

  // With query: search body only (strip frontmatter before matching)
  const rawLimit = options.limit ?? DEFAULT_LIMIT;
  // Clamp limit to a safe positive range; 0 returns no results (intentional)
  const limit = rawLimit < 0 ? DEFAULT_LIMIT : rawLimit;
  const matchedCards: { slug: string; matchLine: string; matchCount: number }[] = [];

  // Split query into tokens — ALL tokens must appear (AND logic)
  const tokens = query.split(/\s+/).filter(Boolean);
  const escapedTokens = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  for (const card of cards) {
    const raw = await store.readCard(card.slug);
    const { data, content } = parseFrontmatter(raw);
    const title = String(data.title || card.slug);
    const searchText = title + "\n" + content;

    // Every token must appear (case-insensitive)
    const allMatch = escapedTokens.every((t) => new RegExp(t, "i").test(searchText));
    if (!allMatch) continue;

    // Count total token hits for ranking
    let matchCount = 0;
    for (const t of escapedTokens) {
      const hits = searchText.match(new RegExp(t, "gi"));
      if (hits) matchCount += hits.length;
    }

    // Find first matching line (use first token for the preview line)
    const lineRegex = new RegExp(escapedTokens[0], "i");
    const bodyLines = content.split("\n");
    const matchLine = bodyLines.find((l) => lineRegex.test(l))?.trim() || "";
    matchedCards.push({ slug: card.slug, matchLine, matchCount });
  }

  if (matchedCards.length === 0) return { output: "", exitCode: 0 };

  // Sort by match count (most relevant first), take top N
  matchedCards.sort((a, b) => b.matchCount - a.matchCount);
  const topCards = matchedCards.slice(0, limit);

  const results: string[] = [];
  for (const matched of topCards) {
    const raw = await store.readCard(matched.slug);
    const { data, content } = parseFrontmatter(raw);
    const links = extractLinks(content);
    const paragraphs = content.trim().split(/\n\n+/);
    const firstParagraph = paragraphs[0]?.trim() || "";

    const showMatchLine = matched.matchLine && !firstParagraph.includes(matched.matchLine) ? matched.matchLine : null;

    results.push(
      formatSearchResult({
        slug: matched.slug,
        title: String(data.title || matched.slug),
        firstParagraph,
        matchLine: showMatchLine,
        links,
      })
    );
  }

  return { output: results.join("\n\n"), exitCode: 0 };
}
