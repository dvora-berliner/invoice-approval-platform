ARG BASE_IMAGE=node:20-alpine
FROM ${BASE_IMAGE}
WORKDIR /app

COPY package.json ./
COPY packages/logging ./packages/logging
COPY services/audit-service ./services/audit-service
RUN npm install --workspace=packages/logging --workspace=services/audit-service
RUN npm run build --workspace=packages/logging && npm run build --workspace=services/audit-service

WORKDIR /app/services/audit-service
EXPOSE 3005
CMD ["npm", "start"]
