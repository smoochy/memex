import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { request } from "node:https";
import { join, dirname } from "node:path";
import type { CardStore } from "./store.js";

/**
 * Generic embedding provider interface.
 * Implementations convert text arrays into vector arrays.
 */
export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * OpenAI embedding provider using text-embedding-3-small (1536 dims).
 * Uses native Node `https` module — no external dependencies.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model = "text-embedding-3-small";
  private apiKey: string;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OpenAI API key required: pass to constructor or set OPENAI_API_KEY"
      );
    }
    this.apiKey = key;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const results: number[][] = [];
    // OpenAI allows up to 2048 inputs per request
    const batchSize = 2048;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const vectors = await this.requestEmbeddings(batch);
      results.push(...vectors);
    }

    return results;
  }

  private requestEmbeddings(texts: string[]): Promise<number[][]> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: this.model,
        input: texts,
      });

      const req = request(
        {
          hostname: "api.openai.com",
          path: "/v1/embeddings",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                reject(
                  new Error(`OpenAI API error: ${parsed.error.message}`)
                );
                return;
              }
              // Sort by index to guarantee order matches input
              const sorted = (
                parsed.data as Array<{ index: number; embedding: number[] }>
              ).sort((a, b) => a.index - b.index);
              resolve(sorted.map((d) => d.embedding));
            } catch (e) {
              reject(new Error(`Failed to parse OpenAI response: ${e}`));
            }
          });
        }
      );

      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }
}

// --- Cache ---

interface CacheEntry {
  vector: number[];
  contentHash: string;
  updatedAt: string;
}

interface CacheData {
  model: string;
  version: number;
  entries: Record<string, CacheEntry>;
}

/**
 * File-backed embedding cache.
 * Stores vectors keyed by card slug with content-hash invalidation.
 */
export class EmbeddingCache {
  private data: CacheData;
  private filePath: string;

  constructor(
    private memexHome: string,
    private model: string
  ) {
    this.filePath = join(
      memexHome,
      ".memex",
      "embeddings",
      `${model}.json`
    );
    this.data = { model, version: 1, entries: {} };
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as CacheData;
      if (parsed.model === this.model && parsed.version === 1) {
        this.data = parsed;
      }
    } catch {
      // File missing or corrupt — start fresh
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  get(slug: string): CacheEntry | undefined {
    return this.data.entries[slug];
  }

  set(slug: string, vector: number[], contentHash: string): void {
    this.data.entries[slug] = {
      vector,
      contentHash,
      updatedAt: new Date().toISOString(),
    };
  }

  remove(slug: string): void {
    delete this.data.entries[slug];
  }

  needsUpdate(slug: string, currentHash: string): boolean {
    const entry = this.data.entries[slug];
    return !entry || entry.contentHash !== currentHash;
  }

  /** Returns all cached slugs (for stale-entry detection). */
  slugs(): string[] {
    return Object.keys(this.data.entries);
  }
}

// --- Utilities ---

/** Compute SHA-256 hex digest of a string. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Cosine similarity between two vectors of equal length. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// --- Orchestrator ---

export interface EmbedCardsResult {
  embedded: number;
  removed: number;
  total: number;
}

/**
 * Scan all cards, embed new/changed ones, remove stale cache entries.
 */
export async function embedCards(
  store: CardStore,
  provider: EmbeddingProvider,
  cache: EmbeddingCache
): Promise<EmbedCardsResult> {
  const cards = await store.scanAll();
  const currentSlugs = new Set<string>();
  const toEmbed: Array<{ slug: string; hash: string; text: string }> = [];

  // Identify new/changed cards
  for (const card of cards) {
    currentSlugs.add(card.slug);
    const raw = await store.readCard(card.slug);
    const hash = contentHash(raw);

    if (cache.needsUpdate(card.slug, hash)) {
      toEmbed.push({ slug: card.slug, hash, text: raw });
    }
  }

  // Batch-embed changed cards
  if (toEmbed.length > 0) {
    const vectors = await provider.embed(toEmbed.map((c) => c.text));
    for (let i = 0; i < toEmbed.length; i++) {
      cache.set(toEmbed[i].slug, vectors[i], toEmbed[i].hash);
    }
  }

  // Remove stale entries (cards that no longer exist)
  let removed = 0;
  for (const slug of cache.slugs()) {
    if (!currentSlugs.has(slug)) {
      cache.remove(slug);
      removed++;
    }
  }

  return {
    embedded: toEmbed.length,
    removed,
    total: cards.length,
  };
}
