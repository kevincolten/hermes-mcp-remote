# Drop-in replacement for nousresearch/hermes-agent that adds hermes-mcp-remote
# as an s6-supervised service. Everything else about the image is unchanged:
# same entrypoint, same /opt/data volume, same gateway and dashboard services.
ARG HERMES_IMAGE=nousresearch/hermes-agent:latest
FROM ${HERMES_IMAGE}

USER root
WORKDIR /opt/hermes-mcp

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --fetch-retries=5 && npm cache clean --force

COPY src/ ./src/

# s6 service: run script drops to the hermes user, finish script keeps the
# slot "down" (exit 125) when no token is configured instead of crash-looping.
COPY --chmod=0755 s6/hermes-mcp/run /etc/s6-overlay/s6-rc.d/hermes-mcp/run
COPY --chmod=0755 s6/hermes-mcp/finish /etc/s6-overlay/s6-rc.d/hermes-mcp/finish
COPY s6/hermes-mcp/type /etc/s6-overlay/s6-rc.d/hermes-mcp/type
RUN mkdir -p /etc/s6-overlay/s6-rc.d/hermes-mcp/dependencies.d && \
    touch /etc/s6-overlay/s6-rc.d/hermes-mcp/dependencies.d/base && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/hermes-mcp && \
    chmod -R a+rX,go-w /opt/hermes-mcp

WORKDIR /opt/hermes
EXPOSE 8788
