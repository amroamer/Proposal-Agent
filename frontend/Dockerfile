FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund || npm install

COPY . .

RUN npm run build

# Final stage: minimal image that keeps a baked copy of dist outside the
# /app/dist mount point. On startup we sync into /app/dist (the shared
# volume), so a `compose build && compose up` always serves fresh assets
# even when the named volume persists across runs.
FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/dist ./dist-source

CMD ["sh", "-c", "mkdir -p /app/dist && rm -rf /app/dist/* && cp -r /app/dist-source/. /app/dist/ && echo 'Frontend dist deployed to volume' && tail -f /dev/null"]
