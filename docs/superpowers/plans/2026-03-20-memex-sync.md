# memex sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `memex sync` command for cross-device card synchronization via git.

**Architecture:** SyncAdapter interface with GitAdapter implementation. Config stored in `~/.memex/.sync.json`. Auto-sync optionally hooks into write/archive commands. Git operations via `child_process.execFile`.

**Tech Stack:** Node.js, TypeScript, Vitest, child_process (git CLI)

**Spec:** `docs/superpowers/specs/2026-03-20-memex-sync-design.md`

---

## File Structure

```
src/lib/sync.ts          — SyncAdapter interface + GitAdapter + config read/write
src/commands/sync.ts      — CLI-facing sync command logic
tests/lib/sync.test.ts    — GitAdapter unit tests (with real git in temp dirs)
tests/commands/sync.test.ts — syncCommand integration tests
```

Modifications:
- `src/cli.ts` — register `sync` subcommand
- `src/commands/write.ts` — call auto-sync after write
- `src/commands/archive.ts` — call auto-sync after archive

---

### Task 1: SyncAdapter interface + config helpers

**Files:**
- Create: `src/lib/sync.ts`
- Test: `tests/lib/sync.test.ts`

- [ ] **Step 1: Write failing tests for config read/write**

```typescript
// tests/lib/sync.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readSyncConfig, writeSyncConfig } from "../src/lib/sync.js";

describe("sync config", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "memex-sync-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true });
  });

  it("returns default config when no file exists", async () => {
    const config = await readSyncConfig(home);
    expect(config).toEqual({ adapter: "git", auto: false });
  });

  it("writes and reads config", async () => {
    await writeSyncConfig(home, {
      remote: "git@github.com:user/cards.git",
      adapter: "git",
      auto: true,
      lastSync: "2026-03-20T17:00:00Z",
    });
    const config = await readSyncConfig(home);
    expect(config.remote).toBe("git@github.com:user/cards.git");
    expect(config.auto).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/sync.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SyncAdapter interface + config helpers**

```typescript
// src/lib/sync.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

export interface SyncConfig {
  remote?: string;
  adapter: string;
  auto: boolean;
  lastSync?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
}

export interface SyncStatus {
  configured: boolean;
  remote?: string;
  adapter: string;
  auto: boolean;
  lastSync?: string;
}

export interface SyncAdapter {
  init(remote?: string): Promise<void>;
  sync(): Promise<SyncResult>;
  status(): Promise<SyncStatus>;
}

const CONFIG_FILE = ".sync.json";

export async function readSyncConfig(home: string): Promise<SyncConfig> {
  try {
    const raw = await readFile(join(home, CONFIG_FILE), "utf-8");
    return JSON.parse(raw);
  } catch {
    return { adapter: "git", auto: false };
  }
}

export async function writeSyncConfig(
  home: string,
  config: SyncConfig
): Promise<void> {
  await mkdir(home, { recursive: true });
  await writeFile(
    join(home, CONFIG_FILE),
    JSON.stringify(config, null, 2),
    "utf-8"
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts tests/lib/sync.test.ts
git commit -m "feat(sync): add SyncAdapter interface and config helpers"
```

---

### Task 2: GitAdapter — init

**Files:**
- Modify: `src/lib/sync.ts`
- Test: `tests/lib/sync.test.ts`

- [ ] **Step 1: Write failing tests for GitAdapter.init**

```typescript
// append to tests/lib/sync.test.ts
import { GitAdapter } from "../src/lib/sync.js";
import { mkdir, writeFile as fsWrite } from "node:fs/promises";

describe("GitAdapter", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "memex-sync-"));
    // Create cards dir with a test card
    await mkdir(join(home, "cards"), { recursive: true });
    await fsWrite(
      join(home, "cards", "test.md"),
      "---\ntitle: Test\ncreated: 2026-03-20\nsource: retro\n---\nHello",
      "utf-8"
    );
  });

  afterEach(async () => {
    await rm(home, { recursive: true });
  });

  it("init with URL sets up git repo and remote", async () => {
    const adapter = new GitAdapter(home);
    // Use a bare repo as fake remote
    const bare = await mkdtemp(join(tmpdir(), "memex-bare-"));
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const exec = promisify(execFile);
    await exec("git", ["init", "--bare", bare]);

    await adapter.init(bare);

    const config = await readSyncConfig(home);
    expect(config.remote).toBe(bare);
    expect(config.adapter).toBe("git");

    // Verify git repo was created
    const { stdout } = await exec("git", ["-C", home, "remote", "-v"]);
    expect(stdout).toContain(bare);

    await rm(bare, { recursive: true });
  });

  it("init without URL fails when gh is not available", async () => {
    const adapter = new GitAdapter(home);
    // Force gh to not be found by using a bad PATH
    const origPath = process.env.PATH;
    process.env.PATH = "";
    await expect(adapter.init()).rejects.toThrow();
    process.env.PATH = origPath;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/sync.test.ts`
Expected: FAIL — GitAdapter not defined

- [ ] **Step 3: Implement GitAdapter.init**

Add to `src/lib/sync.ts`:

```typescript
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

async function gitAvailable(): Promise<boolean> {
  try {
    await execFile("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function ghAvailable(): Promise<boolean> {
  try {
    await execFile("gh", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export class GitAdapter implements SyncAdapter {
  constructor(private home: string) {}

  async init(remote?: string): Promise<void> {
    if (!(await gitAvailable())) {
      throw new Error("git is required for sync. Install git first.");
    }

    let url = remote;

    if (!url) {
      if (!(await ghAvailable())) {
        throw new Error(
          "Provide a repo URL or install gh CLI (https://cli.github.com)."
        );
      }
      const { stdout } = await execFile("gh", [
        "repo",
        "create",
        "memex-cards",
        "--private",
        "--clone=false",
        "--json",
        "sshUrl",
        "-q",
        ".sshUrl",
      ]);
      url = stdout.trim();
    }

    // Init git repo if not already
    try {
      await execFile("git", ["-C", this.home, "rev-parse", "--git-dir"]);
    } catch {
      await execFile("git", ["init", this.home]);
    }

    // Set remote
    try {
      await execFile("git", ["-C", this.home, "remote", "add", "origin", url]);
    } catch {
      await execFile("git", ["-C", this.home, "remote", "set-url", "origin", url]);
    }

    // Initial commit and push
    await execFile("git", ["-C", this.home, "add", "-A"]);
    try {
      await execFile("git", ["-C", this.home, "commit", "-m", "memex: initial sync"]);
    } catch {
      // Nothing to commit is OK
    }
    await execFile("git", ["-C", this.home, "push", "-u", "origin", "HEAD"]);

    await writeSyncConfig(this.home, {
      remote: url,
      adapter: "git",
      auto: false,
    });
  }

  async sync(): Promise<SyncResult> {
    throw new Error("Not implemented");
  }

  async status(): Promise<SyncStatus> {
    throw new Error("Not implemented");
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts tests/lib/sync.test.ts
git commit -m "feat(sync): implement GitAdapter.init"
```

---

### Task 3: GitAdapter — sync + status

**Files:**
- Modify: `src/lib/sync.ts`
- Test: `tests/lib/sync.test.ts`

- [ ] **Step 1: Write failing tests for sync and status**

```typescript
// append to GitAdapter describe block
it("sync commits and pushes changes", async () => {
  const adapter = new GitAdapter(home);
  const bare = await mkdtemp(join(tmpdir(), "memex-bare-"));
  const { promisify } = await import("node:util");
  const exec = promisify((await import("node:child_process")).execFile);
  await exec("git", ["init", "--bare", bare]);
  await adapter.init(bare);

  // Add a new card
  await fsWrite(join(home, "cards", "new.md"), "---\ntitle: New\ncreated: 2026-03-20\nsource: retro\n---\nNew card", "utf-8");

  const result = await adapter.sync();
  expect(result.success).toBe(true);

  // Verify push happened — clone bare and check
  const clone = await mkdtemp(join(tmpdir(), "memex-clone-"));
  await exec("git", ["clone", bare, clone]);
  const content = await readFile(join(clone, "cards", "new.md"), "utf-8");
  expect(content).toContain("New card");

  await rm(bare, { recursive: true });
  await rm(clone, { recursive: true });
});

it("sync with nothing to commit succeeds", async () => {
  const adapter = new GitAdapter(home);
  const bare = await mkdtemp(join(tmpdir(), "memex-bare-"));
  const exec = promisify((await import("node:child_process")).execFile);
  await exec("git", ["init", "--bare", bare]);
  await adapter.init(bare);

  const result = await adapter.sync();
  expect(result.success).toBe(true);

  await rm(bare, { recursive: true });
});

it("status returns configured state", async () => {
  const adapter = new GitAdapter(home);
  const bare = await mkdtemp(join(tmpdir(), "memex-bare-"));
  const exec = promisify((await import("node:child_process")).execFile);
  await exec("git", ["init", "--bare", bare]);
  await adapter.init(bare);

  const status = await adapter.status();
  expect(status.configured).toBe(true);
  expect(status.remote).toBe(bare);
  expect(status.adapter).toBe("git");
  expect(status.auto).toBe(false);

  await rm(bare, { recursive: true });
});

it("status returns unconfigured when no sync.json", async () => {
  const adapter = new GitAdapter(home);
  const status = await adapter.status();
  expect(status.configured).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/sync.test.ts`
Expected: FAIL — "Not implemented"

- [ ] **Step 3: Implement sync() and status()**

Replace the placeholder methods in `GitAdapter`:

```typescript
async sync(): Promise<SyncResult> {
  const config = await readSyncConfig(this.home);
  if (!config.remote) {
    return { success: false, message: "Not initialized. Run `memex sync --init` first." };
  }

  // Stage all changes
  await execFile("git", ["-C", this.home, "add", "-A"]);

  // Commit if there are changes
  try {
    const ts = new Date().toISOString();
    await execFile("git", ["-C", this.home, "commit", "-m", `memex sync ${ts}`]);
  } catch {
    // Nothing to commit — that's fine
  }

  // Pull rebase
  try {
    await execFile("git", ["-C", this.home, "pull", "--rebase", "origin", "HEAD"]);
  } catch (err) {
    // Rebase conflict — abort and report
    try {
      await execFile("git", ["-C", this.home, "rebase", "--abort"]);
    } catch { /* ignore */ }
    return {
      success: false,
      message: "Rebase conflict. Resolve manually in " + this.home,
    };
  }

  // Push
  await execFile("git", ["-C", this.home, "push", "origin", "HEAD"]);

  config.lastSync = new Date().toISOString();
  await writeSyncConfig(this.home, config);

  return { success: true, message: "Synced." };
}

async status(): Promise<SyncStatus> {
  const config = await readSyncConfig(this.home);
  return {
    configured: !!config.remote,
    remote: config.remote,
    adapter: config.adapter,
    auto: config.auto,
    lastSync: config.lastSync,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts tests/lib/sync.test.ts
git commit -m "feat(sync): implement GitAdapter.sync and status"
```

---

### Task 4: CLI command — `memex sync`

**Files:**
- Create: `src/commands/sync.ts`
- Modify: `src/cli.ts`
- Test: `tests/commands/sync.test.ts`

- [ ] **Step 1: Write failing tests for syncCommand**

```typescript
// tests/commands/sync.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { syncCommand } from "../src/commands/sync.js";

const execFile = promisify(execFileCb);

describe("syncCommand", () => {
  let home: string;
  let bare: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "memex-sync-cmd-"));
    bare = await mkdtemp(join(tmpdir(), "memex-bare-"));
    await mkdir(join(home, "cards"), { recursive: true });
    await writeFile(
      join(home, "cards", "test.md"),
      "---\ntitle: Test\ncreated: 2026-03-20\nsource: retro\n---\nHello",
    );
    await execFile("git", ["init", "--bare", bare]);
  });

  afterEach(async () => {
    await rm(home, { recursive: true });
    await rm(bare, { recursive: true });
  });

  it("init with URL configures sync", async () => {
    const result = await syncCommand(home, { init: true, remote: bare });
    expect(result.success).toBe(true);
  });

  it("sync after init succeeds", async () => {
    await syncCommand(home, { init: true, remote: bare });
    const result = await syncCommand(home, {});
    expect(result.success).toBe(true);
  });

  it("status shows configured after init", async () => {
    await syncCommand(home, { init: true, remote: bare });
    const result = await syncCommand(home, { status: true });
    expect(result.success).toBe(true);
    expect(result.output).toContain(bare);
  });

  it("auto on/off toggles config", async () => {
    await syncCommand(home, { init: true, remote: bare });
    await syncCommand(home, { auto: "on" });
    let status = await syncCommand(home, { status: true });
    expect(status.output).toContain("auto: on");

    await syncCommand(home, { auto: "off" });
    status = await syncCommand(home, { status: true });
    expect(status.output).toContain("auto: off");
  });

  it("sync without init fails gracefully", async () => {
    const result = await syncCommand(home, {});
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/commands/sync.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement syncCommand**

```typescript
// src/commands/sync.ts
import { GitAdapter, readSyncConfig, writeSyncConfig } from "../lib/sync.js";

interface SyncOptions {
  init?: boolean;
  remote?: string;
  auto?: string;   // "on" | "off"
  status?: boolean;
}

interface SyncCommandResult {
  success: boolean;
  output?: string;
  error?: string;
}

export async function syncCommand(
  home: string,
  opts: SyncOptions
): Promise<SyncCommandResult> {
  const adapter = new GitAdapter(home);

  if (opts.init) {
    try {
      await adapter.init(opts.remote);
      return { success: true, output: "Sync initialized." };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  if (opts.auto !== undefined) {
    const config = await readSyncConfig(home);
    if (!config.remote) {
      return { success: false, error: "Not initialized. Run `memex sync --init` first." };
    }
    config.auto = opts.auto === "on";
    await writeSyncConfig(home, config);
    return { success: true, output: `Auto sync ${opts.auto}.` };
  }

  if (opts.status) {
    const status = await adapter.status();
    if (!status.configured) {
      return { success: true, output: "Sync not configured. Run `memex sync --init`." };
    }
    const lines = [
      `remote: ${status.remote}`,
      `adapter: ${status.adapter}`,
      `auto: ${status.auto ? "on" : "off"}`,
      `last sync: ${status.lastSync || "never"}`,
    ];
    return { success: true, output: lines.join("\n") };
  }

  // Default: sync
  const config = await readSyncConfig(home);
  if (!config.remote) {
    return { success: false, error: "Not initialized. Run `memex sync --init` first." };
  }

  const result = await adapter.sync();
  return {
    success: result.success,
    output: result.success ? result.message : undefined,
    error: result.success ? undefined : result.message,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/commands/sync.test.ts`
Expected: PASS

- [ ] **Step 5: Register in cli.ts**

Add to `src/cli.ts`:

```typescript
import { syncCommand } from "./commands/sync.js";

program
  .command("sync")
  .description("Sync cards across devices via git")
  .option("--init", "Initialize sync")
  .option("--auto <mode>", "Set auto sync: on|off")
  .option("--status", "Show sync status")
  .argument("[remote]", "Remote repo URL (for --init)")
  .action(async (remote: string | undefined, opts: { init?: boolean; auto?: string; status?: boolean }) => {
    const home = process.env.MEMEX_HOME || join(homedir(), ".memex");
    const result = await syncCommand(home, { ...opts, remote, init: opts.init || !!remote });
    if (result.output) process.stdout.write(result.output + "\n");
    if (result.error) {
      process.stderr.write(result.error + "\n");
      process.exit(1);
    }
  });
```

- [ ] **Step 6: Build and run full test suite**

Run: `npm run build && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/commands/sync.ts src/cli.ts tests/commands/sync.test.ts
git commit -m "feat(sync): add memex sync CLI command"
```

---

### Task 5: Auto-sync in write and archive

**Files:**
- Modify: `src/commands/write.ts`
- Modify: `src/commands/archive.ts`
- Test: `tests/commands/write.test.ts` (add auto-sync test)

- [ ] **Step 1: Write failing test for auto-sync on write**

Add to `tests/commands/write.test.ts`:

```typescript
import { readSyncConfig, writeSyncConfig } from "../src/lib/sync.js";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
const execFile = promisify(execFileCb);

it("auto-syncs after write when auto is on", async () => {
  // Setup bare remote and init sync
  const bare = await mkdtemp(join(tmpdir(), "memex-bare-"));
  await execFile("git", ["init", "--bare", bare]);
  const { GitAdapter } = await import("../src/lib/sync.js");
  const adapter = new GitAdapter(home);
  await adapter.init(bare);
  await writeSyncConfig(home, { remote: bare, adapter: "git", auto: true });

  const input = "---\ntitle: Auto\ncreated: 2026-03-20\nsource: retro\n---\nAuto sync test";
  const result = await writeCommand(store, "auto-test", input);
  expect(result.success).toBe(true);

  // Verify it was pushed
  const clone = await mkdtemp(join(tmpdir(), "memex-clone-"));
  await execFile("git", ["clone", bare, clone]);
  const content = await readFile(join(clone, "cards", "auto-test.md"), "utf-8");
  expect(content).toContain("Auto sync test");

  await rm(bare, { recursive: true });
  await rm(clone, { recursive: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands/write.test.ts`
Expected: FAIL — card not found in clone (no auto-sync yet)

- [ ] **Step 3: Add auto-sync helper and wire into write + archive**

Add to `src/lib/sync.ts`:

```typescript
export async function autoSync(home: string): Promise<void> {
  const config = await readSyncConfig(home);
  if (!config.auto || !config.remote) return;
  try {
    const adapter = new GitAdapter(home);
    await adapter.sync();
  } catch (err) {
    process.stderr.write(`sync warning: ${(err as Error).message}\n`);
  }
}
```

Modify `src/commands/write.ts` — add at end of `writeCommand`, before return:

```typescript
import { autoSync } from "../lib/sync.js";
// ... after store.writeCard(slug, output):
const home = dirname(store.cardsDir);
await autoSync(home);
```

Same pattern in `src/commands/archive.ts` — after `store.archiveCard(slug)`:

```typescript
import { autoSync } from "../lib/sync.js";
const home = dirname(store.cardsDir);
await autoSync(home);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts src/commands/write.ts src/commands/archive.ts tests/commands/write.test.ts
git commit -m "feat(sync): auto-sync after write and archive"
```

---

### Task 6: Update README + bump version + publish

**Files:**
- Modify: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Add sync section to README**

Add after the CLI section:

```markdown
## Sync

Sync your cards across devices via git:

\```bash
memex sync --init git@github.com:you/memex-cards.git  # setup with your repo
memex sync --init                                       # or auto-create via gh CLI
memex sync                                              # push + pull
memex sync --status                                     # check sync state
memex sync --auto on                                    # auto-sync after every write
\```
```

- [ ] **Step 2: Bump version and publish**

```bash
npm version patch --no-git-tag-version
npm run build
npm test
git add -A
git commit -m "chore: bump to 0.1.3, add sync feature"
git push origin main
npm publish --access public
```

- [ ] **Step 3: Verify**

```bash
npm info @touchskyer/memex version  # should be 0.1.3
```
