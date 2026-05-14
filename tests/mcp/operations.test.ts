import { describe, it, expect, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMemexServer } from "../../src/mcp/server.js";
import { CardStore } from "../../src/lib/store.js";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;
let client: Client;

async function setup(cards: Record<string, string> = {}) {
  tmpDir = await mkdtemp(join(tmpdir(), "memex-ops-"));
  const cardsDir = join(tmpDir, "cards");
  const archiveDir = join(tmpDir, "archive");
  await mkdir(cardsDir, { recursive: true });
  await mkdir(archiveDir, { recursive: true });

  for (const [slug, content] of Object.entries(cards)) {
    await writeFile(join(cardsDir, `${slug}.md`), content);
  }

  const store = new CardStore(cardsDir, archiveDir);
  const server = createMemexServer(store, tmpDir);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
}

async function teardown() {
  await client.close();
  await rm(tmpDir, { recursive: true });
}

describe("High-level operations", () => {
  afterEach(teardown);

  it("memex_recall returns index content", async () => {
    await setup({
      "index": "---\ntitle: Keyword Index\ncreated: 2026-01-01\nsource: organize\n---\n## Topic\n- [[card-a]] — desc",
      "card-a": "---\ntitle: Card A\ncreated: 2026-01-01\nsource: claude-code\n---\nSome content",
    });
    const result = await client.callTool({ name: "memex_recall", arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Keyword Index");
    expect(text).toContain("[[card-a]]");
  });

  it("memex_recall returns card list when no index", async () => {
    await setup({
      "card-a": "---\ntitle: Card A\ncreated: 2026-01-01\nsource: claude-code\n---\nContent",
    });
    const result = await client.callTool({ name: "memex_recall", arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("card-a");
  });

  it("memex_recall with query searches cards", async () => {
    await setup({
      "auth-card": "---\ntitle: Auth\ncreated: 2026-01-01\nsource: claude-code\n---\nJWT authentication",
    });
    const result = await client.callTool({ name: "memex_recall", arguments: { query: "JWT" } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("auth-card");
  });

  it("memex_retro writes a card with auto-source", async () => {
    await setup();
    const result = await client.callTool({
      name: "memex_retro",
      arguments: {
        slug: "my-insight",
        title: "My Insight",
        body: "Something I learned about [[related-topic]].",
        category: "architecture",
      },
    });
    expect(result.isError).toBeFalsy();

    const readResult = await client.callTool({ name: "memex_read", arguments: { slug: "my-insight" } });
    const text = (readResult.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("My Insight");
    expect(text).toContain("architecture");
    expect(text).toContain("test-client");
  });

  it("memex_retro returns upsell when sync not configured", async () => {
    await setup();
    const result = await client.callTool({
      name: "memex_retro",
      arguments: { slug: "test", title: "Test", body: "Content" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("memex sync --init");
  });

  it("memex_organize returns link stats", async () => {
    await setup({
      "a": "---\ntitle: A\ncreated: 2026-01-01\nsource: claude-code\n---\nSee [[b]]",
      "b": "---\ntitle: B\ncreated: 2026-01-01\nsource: claude-code\n---\nStandalone",
    });
    const result = await client.callTool({ name: "memex_organize", arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("a");
    expect(text).toContain("b");
  });

  it("memex_recall truncates large index and shows summary", async () => {
    let indexBody = "---\ntitle: Keyword Index\ncreated: 2026-01-01\nsource: organize\n---\n";
    indexBody += "## Section A\n";
    for (let i = 0; i < 100; i++) {
      indexBody += `- [[card-a-${i}]] — description of card a ${i}\n`;
    }
    indexBody += "## Section B\n";
    for (let i = 0; i < 100; i++) {
      indexBody += `- [[card-b-${i}]] — description of card b ${i}\n`;
    }
    await setup({ index: indexBody });
    const result = await client.callTool({ name: "memex_recall", arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Index summary");
    expect(text).toContain("Section A");
    expect(text).toContain("Section B");
    expect(text).toContain("entries");
    expect(text).toContain("memex search");
    expect(text.length).toBeLessThan(indexBody.length);
  });

  it("memex_recall returns small index in full", async () => {
    const smallIndex = "---\ntitle: Keyword Index\ncreated: 2026-01-01\nsource: organize\n---\n## Topic\n- [[card-a]] — desc";
    await setup({ index: smallIndex, "card-a": "---\ntitle: A\n---\ncontent" });
    const result = await client.callTool({ name: "memex_recall", arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).not.toContain("Index summary");
    expect(text).toContain("[[card-a]]");
  });

  it("has all expected high-level tools", async () => {
    await setup();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("memex_recall");
    expect(names).toContain("memex_retro");
    expect(names).toContain("memex_organize");
    expect(names).toContain("memex_pull");
    expect(names).toContain("memex_push");
    expect(names).not.toContain("memex_init");
  });
});
