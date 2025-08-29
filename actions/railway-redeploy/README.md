# Railway redeploy

This Github action call to Railway redeploy mutation using the official GraphQL API.

# Usage

```yml
- name: 🚀 Redeploy Railway
  uses: variableland/gh-actions/actions/railway-redeploy@main
  with:
    service_id: ${{ var.SERVICE_ID }}
    auth_token: ${{ secrets.RAILWAY_TOKEN }}
```

# Example

```yml
name: CI/CD

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # other steps like test and build

  deploy-to-stage:
    needs: build

    if: github.ref == 'refs/heads/main'

    runs-on: ubuntu-latest

    env:
      SERVICE_ID: ${{ vars.YOPPY_API_RAILWAY_STAGE_SERVICE_ID }}
      RAILWAY_TOKEN: ${{ secrets.RAILWAY_STAGE_TOKEN }}

    steps:
      - name: ⬇️ Checkout repo
        uses: actions/checkout@v4

      - name: ⌛ Setup bun
        uses: variableland/gh-actions/actions/setup-bun@main

      - name: 🚀 Redeploy Railway
        uses: variableland/gh-actions/actions/railway-redeploy@main
        with:
          service_id: ${{ env.SERVICE_ID }}
          railway_token: ${{ env.RAILWAY_TOKEN }}

```
