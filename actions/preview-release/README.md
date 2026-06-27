# Preview release

GitHub Action that publishes a **per-PR preview release** of a standalone library (a single npm package, not part of a workspace) and notifies [`vland-bot`](https://bot.variable.land) so it can post a sticky comment on the pull request with the published version.

For each PR:

- The package in `working_directory` (default the repo root) gets its version bumped to `<current>-git-<short-sha>` (prerelease).
- The package is published to npm under the dist-tag `pr-<pr-number>`.
- Private packages (`"private": true`) are skipped.
- For the package's **first ever publish**, npm force-assigns the `latest` dist-tag to that version even with a custom `--tag`. The action detects a first-time publish and removes the auto-assigned `latest` afterwards (best-effort), so a preview build never becomes the default `pnpm add <pkg>` target. See [First-time publishes & `latest`](#first-time-publishes--latest).
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

This action has no GitHub Action outputs. The PR comment is produced by `vland-bot`, not by the action itself.

The action POSTs the published package to `vland-bot` (`POST <vland_bot_url>/v1/github/preview-release`). The entry is:

| Field | Type | Description |
| --- | --- | --- |
| `packageName` | `string` | The npm package name. |
| `nextVersion` | `string` | The published preview version (`<current>-git-<short-sha>`). |
| `firstTime` | `boolean` | `true` when this run published the package's very first version. `vland-bot` can use it to flag the preview in the comment (its `latest` tag was just removed, so the package is only installable via `@pr-<n>` or the exact version until a stable release). |

## First-time publishes & `latest`

npm requires every package to have a `latest` dist-tag, so the **first** version ever published becomes `latest` — even when `pnpm publish --tag pr-<n>` is used. Without intervention, a brand-new package's preview build would silently become the default that `pnpm add <pkg>` (no tag) resolves to.

After publishing, the action removes that auto-assigned `latest` for a first-time package (`pnpm dist-tag rm <pkg> latest`). The result:

- Only the `pr-<n>` tag remains, so `pnpm add <pkg>@pr-<n>` and installs by exact version keep working.
- `pnpm add <pkg>` (no tag) **fails loudly** instead of silently installing a PR build.
- The first real release (via the normal release pipeline) re-establishes a proper stable `latest`.

This step is best-effort: if the registry refuses the removal, the action logs a warning rather than failing the run, and the package is still reported to `vland-bot` with `firstTime: true`.

## How publishing works

The action shells out to the real `pnpm` CLI for the heavy lifting:

- `pnpm version prerelease --preid git-<sha> --no-git-tag-version` to bump.
- `pnpm publish --tag pr-<n> --no-git-checks [--provenance]` to publish.
- `pnpm dist-tag rm <pkg> latest` to undo the auto-assigned `latest` on a first-time publish.

`pnpm publish` takes care of `publishConfig` overrides, lifecycle scripts (`prepublishOnly`, `prepack`, `prepare`), and the npm Trusted Publisher OIDC exchange. This action just orchestrates the bump and the auth-mode selection.

The mutating commands (`pnpm version`, `pnpm publish`, `pnpm dist-tag`) stream their combined output to the Actions log inside collapsible groups, so a run's progress is visible. The JSON query command (`pnpm view`) stays silent — its output is parsed, not displayed.

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
