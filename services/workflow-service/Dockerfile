ARG BASE_IMAGE=node:20-alpine
FROM ${BASE_IMAGE}
WORKDIR /app

COPY package.json ./
COPY packages/logging ./packages/logging
COPY services/workflow-service ./services/workflow-service
RUN npm install --workspace=packages/logging --workspace=services/workflow-service
RUN npm run build --workspace=packages/logging && npm run build --workspace=services/workflow-service

WORKDIR /app/services/workflow-service
EXPOSE 3003
CMD ["npm", "start"]
