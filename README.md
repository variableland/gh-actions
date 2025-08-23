# Github Actions

## List

- [Setup pnpm](./actions/setup-pnpm/action.yml)
- [Setup pnpm + bun](./actions/setup-pnpm-bun/action.yml)
- [Monorepo preview release](./actions/monorepo-preview-release/action.yml)
- [Railway redeploy](./actions/railway-redeploy/action.yml)

## Usage

1. Setup pnpm

  ```yml
  steps:
    - name: Setup CI
      uses: variableland/gh-actions/actions/setup-pnpm@main
  ```

2. Setup pnpm + bun

  ```yml
  steps:
    - name: Setup CI
      uses: variableland/gh-actions/actions/setup-pnpm-bun@main
  ```

3. Monorepo preview release

  ```yml
  steps:
    - name: Preview release
      uses: variableland/gh-actions/actions/monorepo-preview-release@main
      with:
        pr_number: ${{ github.event.pull_request.number }}
        github_token: ${{ secrets.GITHUB_TOKEN }}
        auth_token: ${{ secrets.NPM_TOKEN }} # optional
  ```

4. Railway redeploy

  ```yml
  steps:
    - name: Redeploy Railway Service
      uses: variableland/gh-actions/actions/railway-redeploy@main
      with:
        service_id: ${{ var.SERVICE_ID }}
        auth_token: ${{ secrets.RAILWAY_TOKEN }}
  ```
