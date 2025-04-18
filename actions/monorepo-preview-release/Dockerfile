FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/install
COPY package.json /temp/install
RUN cd /temp/install && bun i

FROM base AS release
COPY --from=install /temp/install/node_modules node_modules
COPY . .
ENV NODE_ENV=production
USER bun
ENTRYPOINT [ "bun", "start" ]
