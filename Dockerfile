# syntax=docker/dockerfile:1
FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.32.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY build.mjs index.template.html styles.css ./
COPY assets ./assets
COPY data ./data

RUN pnpm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
