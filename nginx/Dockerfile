FROM nginx:1.25-alpine

RUN apk add --no-cache curl tzdata && \
    cp /usr/share/zoneinfo/Asia/Riyadh /etc/localtime && \
    echo "Asia/Riyadh" > /etc/timezone

# Config is bind-mounted from compose. Static assets arrive via named volume.
EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://localhost/ProposalAgent/api/health || exit 1
