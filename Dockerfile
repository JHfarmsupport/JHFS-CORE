# JHFS Core – programmet (API + sider).
# Kører som almindelig bruger (ikke root) og indeholder kun det, der skal bruges.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
# Kun det, der skal bruges i drift – ikke test-værktøjer og browser.
RUN pnpm install --frozen-lockfile --prod --filter @jhfs/api... --filter @jhfs/db...

FROM base AS app
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN rm -rf apps/api/test packages/*/test
USER node
EXPOSE 3000
ENV HOST=0.0.0.0 PORT=3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/sundhed').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/apps/api
CMD ["node", "--import", "tsx", "src/server.ts"]
