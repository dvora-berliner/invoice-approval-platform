ARG BASE_IMAGE=node:20-alpine
FROM ${BASE_IMAGE}
WORKDIR /app

COPY package.json ./
COPY packages/logging ./packages/logging
COPY services/payment-service ./services/payment-service
RUN npm install --workspace=packages/logging --workspace=services/payment-service
RUN npm run build --workspace=packages/logging && npm run build --workspace=services/payment-service

WORKDIR /app/services/payment-service
EXPOSE 3004
CMD ["npm", "start"]
