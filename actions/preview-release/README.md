# Preview release

GitHub Action that publishes a **per-PR preview release** of a standalone library (a single npm package, not part of a workspace) and notifies [`vland-bot`](https://bot.variable.land) so it can post a sticky comment on the pull request with the published version.

For each PR:

- The package in `working_directory` (default the repo root) gets its version bumped to `<current>-git-<short-sha>` (prerelease).
- The package is published to npm under the dist-tag `pr-<pr-number>`.
- Private packages (`"private": true`) are skipped.
- Once publishing finishes, the action calls the `vland-bot` server (authenticated with a GitHub OIDC token scoped to the `vland-bot` audience) so it can comment on the PR.

> Working in a pnpm monorepo? Use [`monorepo-preview-release`](../monorepo-preview-release/README.md) instead — it detects changed packages and their workspace dependents.

## Usage

```yml
- name: 🚀 Preview release
  uses: variableland/gh-actions/actions/preview-release@main
  with:
    npm_token: ${{ secrets.NPM_TOKEN }} # optional, see "Authentication" below
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `npm_token` | no | — | npm classic/automation token. When set, enables the OIDC + token fallback mode (see below). |
| `working_directory` | no | `.` | Directory containing the `package.json` to publish. Use this when the library lives in a subdirectory. |
| `vland_bot_url` | no | `https://bot.variable.land` | Base URL of the `vland-bot` server that receives the post-publish notification. |

## Required permissions

The calling job needs:

```yml
permissions:
  contents: read
  id-token: write   # required to mint the GitHub OIDC token (npm Trusted Publisher + vland-bot auth)
```

## Authentication modes

The action picks one of three publishing modes automatically based on the directory state and the inputs:

| Detected state | Mode | Behavior |
| --- | --- | --- |
| `.npmrc` already provides auth | `token-only` | Publishes using the existing `.npmrc` credentials. Never adds `--provenance`. |
| `npm_token` input is provided (and no `.npmrc` auth) | `oidc-with-token-fallback` | Publishes with OIDC + provenance via `pnpm publish --provenance`. If the publish fails **and** the package is unpublished on npm, it falls back to `NPM_TOKEN` auth without provenance. |
| Neither of the above | `oidc-only` | Publishes with OIDC + provenance. Any failure is fatal. |

The `oidc-with-token-fallback` mode exists to handle the **first-time publish** of a package that doesn't yet have a Trusted Publisher configured on npm: it lands via the token (no provenance), and every subsequent publish keeps its provenance attestation.

## Outputs

This action has no outputs. The PR comment is produced by `vland-bot`, not by the action itself.

## How publishing works

The action shells out to the real `pnpm` CLI for the heavy lifting:

- `pnpm version prerelease --preid git-<sha> --no-git-tag-version` to bump.
- `pnpm publish --tag pr-<n> --no-git-checks [--provenance]` to publish.

`pnpm publish` takes care of `publishConfig` overrides, lifecycle scripts (`prepublishOnly`, `prepack`, `prepare`), and the npm Trusted Publisher OIDC exchange. This action just orchestrates the bump and the auth-mode selection.

## Requirements on the calling workflow

Because `pnpm publish` is invoked from inside the action, the caller's job needs:

- **`pnpm` available in `PATH`** — easiest via [`variableland/gh-actions/actions/setup-pnpm`](../setup-pnpm/README.md) or `corepack enable`.
- **A populated `node_modules`** — `pnpm install` must run before the action so lifecycle scripts (`prepack` / `prepare` doing `pnpm build`, `tsdown`, etc.) can find their devDependencies.

## Security notes

- The action **refuses to run on `pull_request_target`**. That trigger gives the workflow access to base-branch secrets while letting it check out PR-controlled code, which combined with lifecycle scripts in `prepack`/`prepare` would let any PR exfiltrate the publish credentials. Use `on: pull_request` — GitHub strips secrets for fork PRs there.
- All runtime tokens (the npm auth token transiently written to `~/.npmrc` and the `vland-bot` OIDC token) are registered with `core.setSecret` so accidental log echoes are masked by the runner.

## Example

```yml
name: CI

on:
  pull_request:
    branches:
      - main

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # other steps like test, lint, build...

  preview:
    runs-on: ubuntu-latest
    needs: test
    if: ${{ startsWith(github.head_ref, 'feat') || startsWith(github.head_ref, 'fix') }}
    permissions:
      contents: read
      id-token: write
    steps:
      - name: ⬇️ Checkout repo
        uses: actions/checkout@v4

      - name: 🟢 Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: .node-version

      - name: ⌛ Setup pnpm
        uses: variableland/gh-actions/actions/setup-pnpm@main

      - name: 🚀 Preview release
        uses: variableland/gh-actions/actions/preview-release@main
        with:
          npm_token: ${{ secrets.NPM_TOKEN }} # optional
```
