ARG BUN_VERSION
ARG PNPM_VERSION

FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app
RUN bun i -g pnpm@${PNPM_VERSION}

FROM base AS install
RUN mkdir -p /temp/install
COPY package.json /temp/install
RUN cd /temp/install && bun i

FROM base AS release
COPY --from=install /temp/install/node_modules node_modules
COPY . .
ENV NODE_ENV=production
USER bun
ENTRYPOINT ["bun", "run", "/app/src/bin.ts"]
