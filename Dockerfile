# GeneoApp en mode web (sans Electron) : client buildé + API sur un seul port.
# Voir docs/WEB.md.
FROM node:22-slim AS build
WORKDIR /app
# Outils de compilation pour better-sqlite3 si aucun binaire précompilé n'existe.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY src/client/package.json src/client/
COPY src/server/package.json src/server/
COPY src/db/package.json src/db/
COPY src/electron/package.json src/electron/
# Electron n'est pas nécessaire en conteneur : on ignore son téléchargement.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci --build-from-source=better-sqlite3
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
  GENEOAPP_HOST=0.0.0.0 \
  PORT=3000 \
  GENEOAPP_DATA_DIR=/data \
  GENEOAPP_WEB_DIR=/app/src/client/dist
COPY --from=build /app /app
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
EXPOSE 3000
USER node
# GENEOAPP_ACCESS_TOKEN est obligatoire (hôte non local) : à fournir au `docker run`.
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/server/src/server.js"]
