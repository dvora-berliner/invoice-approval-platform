ARG BASE_IMAGE=node:20-alpine
FROM ${BASE_IMAGE}
WORKDIR /app

COPY package.json ./
COPY packages/logging ./packages/logging
COPY services/api-gateway ./services/api-gateway
RUN npm install --workspace=packages/logging --workspace=services/api-gateway
RUN npm run build --workspace=packages/logging && npm run build --workspace=services/api-gateway

WORKDIR /app/services/api-gateway
EXPOSE 3000
CMD ["npm", "start"]
