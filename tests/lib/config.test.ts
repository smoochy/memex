import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig } from "../../src/lib/config.js";

describe("readConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "memex-config-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns default config when file does not exist", async () => {
    const config = await readConfig(tmpDir);
    expect(config).toEqual({ nestedSlugs: false });
  });

  it("returns default config when file is invalid JSON", async () => {
    await writeFile(join(tmpDir, ".memexrc"), "invalid json{");
    const config = await readConfig(tmpDir);
    expect(config).toEqual({ nestedSlugs: false });
  });

  it("reads nestedSlugs: true from config file", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ nestedSlugs: true }));
    const config = await readConfig(tmpDir);
    expect(config).toEqual({ nestedSlugs: true });
  });

  it("reads nestedSlugs: false from config file", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ nestedSlugs: false }));
    const config = await readConfig(tmpDir);
    expect(config).toEqual({ nestedSlugs: false });
  });

  it("treats non-boolean nestedSlugs as false", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ nestedSlugs: "yes" }));
    const config = await readConfig(tmpDir);
    expect(config).toEqual({ nestedSlugs: false });
  });

  it("treats missing nestedSlugs field as false", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ otherField: "value" }));
    const config = await readConfig(tmpDir);
    expect(config).toEqual({ nestedSlugs: false });
  });

  it("reads searchDirs from config file", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ nestedSlugs: true, searchDirs: ["projects", "notes"] }));
    const config = await readConfig(tmpDir);
    expect(config).toEqual({ nestedSlugs: true, searchDirs: ["projects", "notes"] });
  });

  it("treats non-array searchDirs as undefined", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ nestedSlugs: false, searchDirs: "projects" }));
    const config = await readConfig(tmpDir);
    expect(config).toEqual({ nestedSlugs: false, searchDirs: undefined });
  });

  it("treats missing searchDirs field as undefined", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ nestedSlugs: false }));
    const config = await readConfig(tmpDir);
    expect(config).toEqual({ nestedSlugs: false });
  });

  // --- embeddingModel ---

  it("reads embeddingModel from config file", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ embeddingModel: "text-embedding-3-large" }));
    const config = await readConfig(tmpDir);
    expect(config.embeddingModel).toBe("text-embedding-3-large");
  });

  it("treats non-string embeddingModel as undefined", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ embeddingModel: 42 }));
    const config = await readConfig(tmpDir);
    expect(config.embeddingModel).toBeUndefined();
  });

  // --- semanticWeight ---

  it("reads semanticWeight from config file", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ semanticWeight: 0.5 }));
    const config = await readConfig(tmpDir);
    expect(config.semanticWeight).toBe(0.5);
  });

  it("reads semanticWeight: 0 (full keyword)", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ semanticWeight: 0 }));
    const config = await readConfig(tmpDir);
    expect(config.semanticWeight).toBe(0);
  });

  it("reads semanticWeight: 1 (full semantic)", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ semanticWeight: 1 }));
    const config = await readConfig(tmpDir);
    expect(config.semanticWeight).toBe(1);
  });

  it("treats semanticWeight outside [0,1] as undefined", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ semanticWeight: 1.5 }));
    const config = await readConfig(tmpDir);
    expect(config.semanticWeight).toBeUndefined();
  });

  it("treats negative semanticWeight as undefined", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ semanticWeight: -0.1 }));
    const config = await readConfig(tmpDir);
    expect(config.semanticWeight).toBeUndefined();
  });

  it("treats non-number semanticWeight as undefined", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({ semanticWeight: "high" }));
    const config = await readConfig(tmpDir);
    expect(config.semanticWeight).toBeUndefined();
  });

  // --- full config round-trip ---

  it("reads all config fields together", async () => {
    await writeFile(join(tmpDir, ".memexrc"), JSON.stringify({
      nestedSlugs: true,
      searchDirs: ["archive"],
      openaiApiKey: "sk-test",
      embeddingModel: "text-embedding-3-large",
      semanticWeight: 0.6,
    }));
    const config = await readConfig(tmpDir);
    expect(config).toEqual({
      nestedSlugs: true,
      searchDirs: ["archive"],
      openaiApiKey: "sk-test",
      embeddingModel: "text-embedding-3-large",
      semanticWeight: 0.6,
    });
  });
});
