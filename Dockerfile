FROM node:22-alpine
WORKDIR /app
COPY server.js ./
USER node
EXPOSE 8011
CMD ["node", "server.js"]
