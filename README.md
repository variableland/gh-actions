# Github Actions

## List

- [Setup pnpm](./actions/setup-pnpm/action.yml)
- [Setup bun](./actions/setup-bun/action.yml)
- [Setup pnpm + bun](./actions/setup-pnpm-bun/action.yml)
- [Monorepo preview release](./actions/monorepo-preview-release/action.yml)
- [Railway redeploy](./actions/railway-redeploy/action.yml)

## Usage

1. Setup pnpm

  ```yml
  steps:
    - name: Setup pnpm
      uses: variableland/gh-actions/actions/setup-pnpm@main
  ```

2. Setup bun

  ```yml
  steps:
    - name: Setup bun
      uses: variableland/gh-actions/actions/setup-bun@main
  ```

3. Setup pnpm + bun

  ```yml
  steps:
    - name: Setup pnpm + bun
      uses: variableland/gh-actions/actions/setup-pnpm-bun@main
  ```

4. Monorepo preview release

  ```yml
  steps:
    - name: Preview release
      uses: variableland/gh-actions/actions/monorepo-preview-release@main
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        auth_token: ${{ secrets.NPM_TOKEN }} # optional
  ```

5. Railway redeploy

  ```yml
  steps:
    - name: Redeploy Railway Service
      uses: variableland/gh-actions/actions/railway-redeploy@main
      with:
        service_id: ${{ var.SERVICE_ID }}
        auth_token: ${{ secrets.RAILWAY_TOKEN }}
  ```
