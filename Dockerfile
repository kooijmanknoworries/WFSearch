FROM node:22-alpine
WORKDIR /app
# Tor + curl: rate-limit fallback. When WordFeud rate-limits the server IP,
# searches are routed through a local Tor circuit (fresh exit IP per request).
RUN apk add --no-cache tor curl
COPY server.js tor.js ./
# Directory for extra WordFeud accounts, mounted from the host (./data).
# Must be writable by the non-root 'node' user that runs the server.
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 8011
CMD ["node", "server.js"]
