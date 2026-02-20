FROM node:24-bookworm-slim

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    ca-certificates \
    curl \
    git \
    jq \
    openssh-client \
    pkg-config \
    python3 \
    ripgrep \
    unzip \
    xz-utils \
    zip \
  && rm -rf /var/lib/apt/lists/*

ENV BUN_VERSION=1.3.9
ENV PATH=/usr/local/bun/bin:${PATH}

RUN set -eux; \
  export BUN_INSTALL=/usr/local/bun; \
  curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh; \
  bash /tmp/bun-install.sh "bun-v${BUN_VERSION}"; \
  rm -f /tmp/bun-install.sh; \
  bun --version; \
  chmod -R a+rX /usr/local/bun

RUN useradd \
  --create-home \
  --home-dir /home/opencode \
  --shell /bin/bash \
  opencode

RUN mkdir -p \
    /data/opencode/data \
    /data/opencode/config \
    /data/opencode/cache \
    /data/opencode/state \
    /opt/opencode/ui \
    /home/opencode/opencode \
  && chown -R opencode:opencode /data/opencode /opt/opencode /home/opencode

ENV XDG_DATA_HOME=/data/opencode/data
ENV XDG_CONFIG_HOME=/data/opencode/config
ENV XDG_CACHE_HOME=/data/opencode/cache
ENV XDG_STATE_HOME=/data/opencode/state

VOLUME ["/data/opencode"]

WORKDIR /home/opencode

COPY docker/opencode-web /usr/local/bin/opencode-web
RUN chmod 0755 /usr/local/bin/opencode-web

COPY --chown=opencode:opencode . /home/opencode/opencode

USER opencode
WORKDIR /home/opencode/opencode

RUN node --version && npm --version && bun --version

RUN bun install --frozen-lockfile

RUN bun run --cwd packages/app build \
  && rm -rf /opt/opencode/ui \
  && mkdir -p /opt/opencode/ui \
  && cp -a packages/app/dist/. /opt/opencode/ui/

RUN bun run --cwd packages/opencode build --single

USER root
RUN install -m 0755 \
  /home/opencode/opencode/packages/opencode/dist/opencode-linux-x64/bin/opencode \
  /usr/local/bin/opencode

USER opencode

RUN opencode --version
RUN opencode web --help

WORKDIR /home/opencode

EXPOSE 4096

CMD ["bash"]
