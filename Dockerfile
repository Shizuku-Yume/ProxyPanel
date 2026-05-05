FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 WEB_DIST_PATH=/app/apps/web/dist GEOIP_DB_PATH=/app/data/geoip.json DATABASE_PATH=/data/proxypanel.db
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/data/geoip.json data/geoip.json
RUN npm install --omit=dev --workspaces
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
