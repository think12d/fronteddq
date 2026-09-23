FROM node:20-alpine AS build
WORKDIR /web
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
ARG VITE_APP_MODE=user
ARG VITE_API_URL=http://localhost:8000/api/v1
ARG VITE_ADMIN_URL=http://localhost:5174/admin/login
ARG VITE_LEARNER_URL=http://localhost:5173/login
ENV VITE_APP_MODE=$VITE_APP_MODE
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ADMIN_URL=$VITE_ADMIN_URL
ENV VITE_LEARNER_URL=$VITE_LEARNER_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
