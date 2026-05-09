# Contributing

Thanks for helping improve Memex. Keep changes small, reviewable, and tied to a real issue.

## Before You Start

- For bug fixes, link the issue and describe the failure mode.
- For behavior changes, CLI changes, config changes, or sync changes, open a design doc PR in `docs/` first.
- For docs-only changes, keep the PR limited to the affected docs.
- AI-assisted contributions are welcome, but the contributor is responsible for reviewing the diff and running tests.

## Local Setup

```bash
npm install
npm test
npm run build
```

## Pull Requests

- Branch from `main`.
- Keep one logical change per PR.
- Add or update tests for code changes.
- Update docs when user-visible behavior changes.
- Run `npm run build` when changing runtime code under `src/`, and include generated `dist/` updates.
- Avoid unrelated formatting, cleanup, or refactors.

## Sync Changes

Sync is intentionally git-native. The normal path should keep working with any valid git remote, including GitHub, GitLab, self-hosted GitLab, and local bare repositories.

See `docs/GITLAB_SYNC.md` before proposing GitLab-specific changes.
