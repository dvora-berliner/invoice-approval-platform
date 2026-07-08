ARG BASE_IMAGE=node:20-alpine
FROM ${BASE_IMAGE}
WORKDIR /app

COPY package.json ./
COPY packages/logging ./packages/logging
COPY services/submission-service ./services/submission-service
RUN npm install --workspace=packages/logging --workspace=services/submission-service
RUN npm run build --workspace=packages/logging && npm run build --workspace=services/submission-service

WORKDIR /app/services/submission-service
EXPOSE 3001
CMD ["npm", "start"]
