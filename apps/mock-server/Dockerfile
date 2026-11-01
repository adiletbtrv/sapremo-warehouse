FROM node:20-alpine AS builder
WORKDIR /workspace

COPY package.json turbo.json ./
COPY apps/mock-server/package.json ./apps/mock-server/
COPY apps/client/package.json ./apps/client/

RUN npm install

COPY apps/mock-server ./apps/mock-server
RUN npm run build --workspace=@sapremo/mock-server

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/mock-server/package.json ./package.json
COPY --from=builder /workspace/apps/mock-server/dist ./dist

EXPOSE 3001
CMD ["node", "dist/index.js"]

