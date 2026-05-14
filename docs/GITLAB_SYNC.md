# GitLab Sync

Memex sync is git-native. It already works with GitLab and self-hosted GitLab when you pass a repository URL to `memex sync --init`.

## Quick Start

Create an empty private repository in GitLab, then initialize Memex sync with that remote:

```bash
memex sync --init git@gitlab.example.com:group/memex-cards.git
memex sync on
memex sync
```

HTTPS remotes work too:

```bash
memex sync --init https://gitlab.example.com/group/memex-cards.git
```

GitLab.com uses the same pattern:

```bash
memex sync --init git@gitlab.com:user/memex-cards.git
```

## Authentication

Memex does not handle GitLab credentials directly. Git does.

- SSH auth uses your SSH key, SSH agent, or deploy key.
- HTTPS auth uses your git credential helper or GitLab personal access token.
- Avoid putting tokens directly in the command line, because shell history may store them.

## GitHub Auto-Create vs GitLab Remotes

Running `memex sync --init` without a URL is a GitHub convenience path. It uses the GitHub CLI (`gh`) to create or reuse a private `memex-cards` repository.

GitLab support does not require the GitLab CLI (`glab`) for normal sync. Create the repository in GitLab first, then pass its git remote URL.

## Supported Remote Forms

`memex sync --init <repo-url>` accepts standard git remote forms:

```bash
memex sync --init git@gitlab.example.com:group/project.git
memex sync --init ssh://git@gitlab.example.com/group/project.git
memex sync --init https://gitlab.example.com/group/project.git
```

Absolute local paths are also supported for tests and local bare repositories.

## Known Gaps

- Memex does not auto-create GitLab repositories.
- Memex does not call GitLab APIs.
- `memex sync --status` reports the generic `git` adapter, not a provider-specific GitLab adapter.

Those are platform integration features, not blockers for GitLab-backed sync.

## Contribution Path

If you want to improve GitLab support, start with one focused PR:

1. Improve docs or examples.
2. Add tests for GitLab-style remote URL handling.
3. Propose a design doc before adding GitLab API or `glab` integration.

Keep the base sync path git-native unless there is a clear user-facing reason to add platform-specific behavior.
