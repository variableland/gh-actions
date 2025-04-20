# Github Actions

## List

- [Setup pnpm + bun](./actions/setup-pnpm-bun/action.yml)
- [Monorepo preview release](./actions/monorepo-preview-release/action.yml)

## Usage

1. Setup pnpm + bun

  ```yml
  steps:
    - name: Setup CI
      uses: variableland/gh-actions/actions/setup-pnpm-bun@main
  ```

2. Monorepo preview release

  ```yml
  steps:
    - name: Preview release
      uses: variableland/gh-actions/actions/monorepo-preview-release@main
      env:
        PR_NUMBER: ${{ github.event.pull_request.number }} # depends on the workflow event
        AUTH_TOKEN: ${{ secrets.NPM_TOKEN }} # optional
  ```
