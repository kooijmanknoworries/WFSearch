FROM node:22-alpine
WORKDIR /app
COPY server.js ./
# Directory for extra WordFeud accounts, mounted from the host (./data).
# Must be writable by the non-root 'node' user that runs the server.
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 8011
CMD ["node", "server.js"]
