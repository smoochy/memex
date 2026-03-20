import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

describe("memex mcp subcommand", () => {
  it("memex mcp --help shows MCP description", async () => {
    const { stdout } = await exec("node", ["dist/cli.js", "mcp", "--help"]);
    expect(stdout).toContain("MCP");
  });
});
