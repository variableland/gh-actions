# Railway redeploy

This Github action call to Railway redeploy mutation using the official GraphQL API.

# Usage

```yml
- name: 🚀 Redeploy Railway
  uses: variableland/gh-actions/actions/railway-redeploy@main
  with:
    project_id: ${{ vars.RAILWAY_PROJECT_ID }}
    api_token: ${{ secrets.RAILWAY_API_TOKEN }}
    environment: staging
    service_name: api
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

    steps:
      - name: ⬇️ Checkout repo
        uses: actions/checkout@v4

      - name: ⌛ Setup bun
        uses: variableland/gh-actions/actions/setup-bun@main

      - name: 🚀 Redeploy Railway
        uses: variableland/gh-actions/actions/railway-redeploy@main
        with:
          project_id: ${{ vars.RAILWAY_PROJECT_ID }}
          api_token: ${{ secrets.RAILWAY_API_TOKEN }}
          environment: staging
          service_name: api
```
