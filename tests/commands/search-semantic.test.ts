import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchCommand } from "../../src/commands/search.js";
import { CardStore } from "../../src/lib/store.js";
import { contentHash, type EmbeddingProvider } from "../../src/lib/embeddings.js";

/**
 * Mock embedding provider that returns deterministic vectors.
 * Vectors are derived from content hashes so they're stable across runs.
 */
function createMockProvider(): EmbeddingProvider & { embedCalls: string[][] } {
  const provider = {
    model: "mock-model",
    embedCalls: [] as string[][],
    async embed(texts: string[]): Promise<number[][]> {
      provider.embedCalls.push([...texts]);
      return texts.map((t) => textToVector(t));
    },
  };
  return provider;
}

/** Convert text to a deterministic 3-dimensional unit vector. */
function textToVector(text: string): number[] {
  const h = contentHash(text);
  const raw = [
    parseInt(h.slice(0, 8), 16) / 0xffffffff,
    parseInt(h.slice(8, 16), 16) / 0xffffffff,
    parseInt(h.slice(16, 24), 16) / 0xffffffff,
  ];
  // Normalize to unit vector
  const norm = Math.sqrt(raw[0] ** 2 + raw[1] ** 2 + raw[2] ** 2);
  return norm > 0 ? raw.map((v) => v / norm) : raw;
}

/**
 * Mock provider for hybrid scoring tests.
 * Returns controlled vectors: cards get equal semantic similarity to the query,
 * so keyword score is the tiebreaker.
 */
function createHybridMockProvider(): EmbeddingProvider & { embedCalls: string[][] } {
  // All cards get the same vector [1,0,0], query gets [1,0,0] too.
  // This makes all semantic scores identical (1.0), so hybrid scoring
  // is entirely determined by the keyword component.
  const provider = {
    model: "mock-model",
    embedCalls: [] as string[][],
    async embed(texts: string[]): Promise<number[][]> {
      provider.embedCalls.push([...texts]);
      return texts.map(() => [1, 0, 0]);
    },
  };
  return provider;
}

describe("searchCommand with --semantic", () => {
  let tmpDir: string;
  let store: CardStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "memex-semantic-"));
    const cardsDir = join(tmpDir, "cards");
    await mkdir(cardsDir, { recursive: true });
    store = new CardStore(cardsDir, join(tmpDir, "archive"));

    await writeFile(
      join(cardsDir, "auth-patterns.md"),
      `---
title: Authentication Patterns
created: 2026-03-18
---

OAuth2 and JWT authentication patterns for web services.

See [[session-mgmt]] for related session management.`
    );

    await writeFile(
      join(cardsDir, "caching.md"),
      `---
title: Caching Strategy
created: 2026-03-18
---

Redis vs Memcached for high-throughput caching.`
    );

    await writeFile(
      join(cardsDir, "deployment.md"),
      `---
title: Deployment Guide
created: 2026-03-18
---

Docker and Kubernetes deployment best practices.`
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns semantic results using mock provider", async () => {
    const provider = createMockProvider();
    const result = await searchCommand(store, "login security", {
      semantic: true,
      memexHome: tmpDir,
      _embeddingProvider: provider,
    });

    // Should return results (all cards get scored)
    expect(result.exitCode).toBe(0);
    expect(result.output).toBeTruthy();
    // All 3 cards should appear (semantic search returns all, scored by similarity)
    expect(result.output).toContain("auth-patterns");
    expect(result.output).toContain("caching");
    expect(result.output).toContain("deployment");
    // Provider should have been called (for cards + query)
    expect(provider.embedCalls.length).toBeGreaterThan(0);
  });

  it("respects limit option", async () => {
    const provider = createMockProvider();
    const result = await searchCommand(store, "query", {
      semantic: true,
      memexHome: tmpDir,
      limit: 1,
      _embeddingProvider: provider,
    });

    expect(result.exitCode).toBe(0);
    const headings = result.output.match(/^## /gm) || [];
    expect(headings.length).toBe(1);
  });

  it("returns error when no API key and no provider override", async () => {
    // Clear env var to ensure no key is available
    const origKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await searchCommand(store, "test query", {
        semantic: true,
        memexHome: tmpDir,
        // No _embeddingProvider, no config with apiKey
      });

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("OpenAI API key");
      expect(result.output).toContain(".memexrc");
    } finally {
      if (origKey !== undefined) process.env.OPENAI_API_KEY = origKey;
    }
  });

  it("does not use semantic path when semantic is false", async () => {
    const provider = createMockProvider();
    const result = await searchCommand(store, "Redis", {
      semantic: false,
      memexHome: tmpDir,
      _embeddingProvider: provider,
    });

    // Should use keyword search — "Redis" matches caching card
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("caching");
    expect(result.output).toContain("Caching Strategy");
    // Provider should NOT have been called (keyword path)
    expect(provider.embedCalls.length).toBe(0);
  });

  it("does not use semantic path by default (semantic unset)", async () => {
    const provider = createMockProvider();
    const result = await searchCommand(store, "Docker", {
      memexHome: tmpDir,
      _embeddingProvider: provider,
    });

    // Default is keyword search
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("deployment");
    expect(provider.embedCalls.length).toBe(0);
  });
});

describe("semantic search hybrid scoring", () => {
  let tmpDir: string;
  let store: CardStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "memex-hybrid-"));
    const cardsDir = join(tmpDir, "cards");
    await mkdir(cardsDir, { recursive: true });
    store = new CardStore(cardsDir, join(tmpDir, "archive"));

    // Card that matches keyword "JWT"
    await writeFile(
      join(cardsDir, "jwt-guide.md"),
      `---
title: JWT Guide
created: 2026-03-18
---

JWT tokens are used for stateless authentication. JWT JWT JWT.`
    );

    // Card that doesn't match keyword "JWT"
    await writeFile(
      join(cardsDir, "unrelated.md"),
      `---
title: Cooking Tips
created: 2026-03-18
---

How to make the perfect sourdough bread.`
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("applies hybrid scoring — keyword match boosts ranking", async () => {
    // Use a provider that returns identical vectors for all texts.
    // With equal semantic scores, the keyword-matching card (jwt-guide)
    // gets a hybrid boost and should rank first.
    const provider = createHybridMockProvider();
    const result = await searchCommand(store, "JWT", {
      semantic: true,
      memexHome: tmpDir,
      _embeddingProvider: provider,
    });

    expect(result.exitCode).toBe(0);
    // Both cards should appear in results
    expect(result.output).toContain("jwt-guide");
    expect(result.output).toContain("unrelated");

    // jwt-guide should rank higher because it has keyword match boost
    const jwtPos = result.output.indexOf("jwt-guide");
    const unrelatedPos = result.output.indexOf("unrelated");
    expect(jwtPos).toBeLessThan(unrelatedPos);
  });

  it("returns empty for semantic search with limit=0", async () => {
    const provider = createMockProvider();
    const result = await searchCommand(store, "JWT", {
      semantic: true,
      memexHome: tmpDir,
      limit: 0,
      _embeddingProvider: provider,
    });

    expect(result.output).toBe("");
  });
});
