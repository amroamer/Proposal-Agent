# Proposal Agent - frontend
# Multi-stage build:
#   - dev:        Vite dev server with hot reload (used by local docker-compose)
#   - build:      Produces static assets in /app/dist
#   - production: nginx serving the built assets (used by kpmg-infra)
#
# Vite is built with base: "/ProposalAgent/" (set in vite.config.ts), so the
# HTML references assets at /ProposalAgent/assets/... The inner nginx maps
# that prefix back to the real file root with `alias`.

# -------------------------------------------------------------
# Stage: dev - local development with hot reload
# -------------------------------------------------------------
FROM node:20-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund || npm install
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# -------------------------------------------------------------
# Stage: build - produce static assets
# -------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund || npm install
COPY . .
RUN npm run build

# -------------------------------------------------------------
# Stage: production - nginx serves the static build
# -------------------------------------------------------------
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
