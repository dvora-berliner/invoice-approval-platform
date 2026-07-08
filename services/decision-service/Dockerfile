ARG BASE_IMAGE=node:20-alpine
FROM ${BASE_IMAGE}
WORKDIR /app

COPY package.json ./
COPY packages/logging ./packages/logging
COPY services/decision-service ./services/decision-service
RUN npm install --workspace=packages/logging --workspace=services/decision-service
RUN npm run build --workspace=packages/logging && npm run build --workspace=services/decision-service

WORKDIR /app/services/decision-service
EXPOSE 3002
CMD ["npm", "start"]
