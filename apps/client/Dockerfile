FROM node:20-alpine AS builder
WORKDIR /workspace

ARG VITE_API_URL=/api
ARG VITE_WS_URL=/api/warehouse/ws
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

COPY package.json turbo.json ./
COPY apps/client/package.json ./apps/client/
COPY apps/mock-server/package.json ./apps/mock-server/

RUN npm install

COPY apps/client ./apps/client
RUN npm run build --workspace=warehouse-manager

FROM nginx:1.27-alpine
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/apps/client/dist /usr/share/nginx/html

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]

