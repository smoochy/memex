import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface MemexConfig {
  nestedSlugs: boolean;
  searchDirs?: string[];
  openaiApiKey?: string;
  embeddingModel?: string;
  semanticWeight?: number;
}

/**
 * Read config from $MEMEX_HOME/.memexrc
 * Returns default config if file doesn't exist or is invalid.
 */
export async function readConfig(memexHome: string): Promise<MemexConfig> {
  const configPath = join(memexHome, ".memexrc");

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);

    return {
      nestedSlugs: parsed.nestedSlugs === true,
      searchDirs: Array.isArray(parsed.searchDirs) ? parsed.searchDirs : undefined,
      openaiApiKey: typeof parsed.openaiApiKey === "string" ? parsed.openaiApiKey : undefined,
      embeddingModel: typeof parsed.embeddingModel === "string" ? parsed.embeddingModel : undefined,
      semanticWeight: typeof parsed.semanticWeight === "number" && parsed.semanticWeight >= 0 && parsed.semanticWeight <= 1
        ? parsed.semanticWeight
        : undefined,
    };
  } catch {
    // File doesn't exist or invalid JSON - return defaults
    return {
      nestedSlugs: false,
    };
  }
}
