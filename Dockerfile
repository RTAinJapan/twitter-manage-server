FROM node:20-slim AS base

WORKDIR /app
RUN npm i -g pnpm

FROM base AS build

COPY package.json pnpm-lock.yaml ./
RUN pnpm i

COPY src src
RUN pnpm build


FROM base

COPY package.json pnpm-lock.yaml ./
RUN pnpm i --production
COPY --from=build /app/build build

CMD ["node", "build/main.js"]
