FROM node:22-bookworm-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@10.34.4

WORKDIR /workspace
COPY . .

RUN pnpm --dir web install --frozen-lockfile
RUN NUXT_PUBLIC_PB_URL="" npm run pack:hub
RUN PB_VERSION=0.40.4 bash scripts/pb-download.sh
RUN test -s public/index.html

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 pocketbase \
    && useradd --uid 10001 --gid 10001 --no-create-home pocketbase \
    && mkdir -p /app/pb_data \
    && chown 10001:10001 /app/pb_data

WORKDIR /app
COPY --from=builder /workspace/pocketbase/bin/pocketbase /app/pocketbase
COPY --from=builder /workspace/pocketbase/pb_hooks /app/pb_hooks
COPY --from=builder /workspace/pocketbase/pb_migrations /app/pb_migrations
COPY --from=builder /workspace/public /app/pb_public
COPY --from=builder /workspace/hub-manifest.json /app/hub-manifest.json

USER 10001:10001
EXPOSE 8090

ENTRYPOINT ["/app/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/app/pb_data", "--migrationsDir=/app/pb_migrations", "--hooksDir=/app/pb_hooks", "--publicDir=/app/pb_public"]
