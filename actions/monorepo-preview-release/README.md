# Monorepo preview release

This Github action creates a preview release of your package and comments on the pull request with the release information.

## Usage

```yml
- name: 🚀 Preview release
  uses: variableland/gh-actions/actions/monorepo-preview-release@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    npm_token: ${{ secrets.NPM_TOKEN }} # optional, see "Authentication" below
```

## Authentication

Three modes, picked automatically based on inputs and the workspace state:

| State                                  | Mode                          | Behavior                                                                                                              |
| -------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `.npmrc` already in workspace          | `token-only`                  | Publish using the existing `.npmrc`; never adds `--provenance`.                                                       |
| `npm_token` input provided             | `oidc-with-token-fallback`    | Publish each package with OIDC + `--provenance`; on failure for a given package, fall back to NPM_TOKEN auth without provenance. |
| Neither                                | `oidc-only`                   | Publish with OIDC + `--provenance`; fail otherwise.                                                                   |

The `oidc-with-token-fallback` mode exists to handle first-time publishes of packages that have no Trusted Publisher configured on npm yet — those publishes will land via the token without provenance, while every other package keeps its provenance attestation.

## Requirements

- [pnpm](https://pnpm.io)
- [Bun](https://bun.sh)

> [!TIP]
> You can use the [setup-pnpm-bun](../setup-pnpm-bun/README.md) action to set up pnpm and Bun in your workflow.

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
  # other steps like test...

  preview:
    runs-on: ubuntu-latest
    needs: test
    if: ${{ startsWith(github.head_ref, 'feat') || startsWith(github.head_ref, 'fix') }}
    steps:
      - name: ⬇️ Checkout repo
        uses: actions/checkout@v4

      - name: ⌛ Setup CI
        uses: variableland/gh-actions/actions/setup-pnpm-bun@main

      - name: 🚀 Preview release
        uses: variableland/gh-actions/actions/monorepo-preview-release@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          npm_token: ${{ secrets.NPM_TOKEN }} # optional, see "Authentication" below
```
