# ZeppBridge headless image: zeppbridge-cli and zeppbridge-mcp.
#
# This image deliberately does NOT contain the desktop app. The GUI needs a
# WebView, a display and a login window; none of that belongs in a container,
# and pretending otherwise would ship an image that cannot do the one thing
# people would try first. What is here is the scheduled half — sync on a timer,
# export on demand, and a read-only MCP server for a local model.
#
# Because of that split there is a prerequisite the image cannot remove: an
# account has to be connected once with the desktop app, and the resulting
# token has to be handed to the container. See docs/guides/docker.md.
#
# Build from the repository root:
#   docker build -f packaging/docker/Dockerfile -t zeppbridge:local .

# ---------------------------------------------------------------- build stage
FROM rust:1-bookworm AS build

# libdbus-1-dev: the Secret Service credential backend links libdbus. The
# container will not use that backend (there is no keyring here), but the
# binary links it either way, so it has to be present at build and at run.
# pkg-config is how the dbus crate finds it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libdbus-1-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# Only the Rust workspace is copied — no frontend, no npm. The whole
# tauri/webkit dependency tree stays out of this image because neither selected
# package depends on it.
#
# The entire src-tauri directory goes in, not just the two crates: cargo
# validates every target declared in the workspace manifest before it builds
# anything, and the root package declares an explicit `[lib]`. Handing it only
# `crates/` fails at manifest parse with "can't find library", which is a
# confusing way to learn that. `.dockerignore` keeps `target/` out.
COPY src-tauri ./src-tauri

# zeppbridge-core embeds the device and workout catalogues with `include_str!`,
# and those two files live under the frontend tree (src/assets/...). They are
# the only thing outside src-tauri/ the Rust build reads, so they are copied by
# name — a blanket `COPY src` would drag the whole frontend in for 88 kB of
# JSON.
COPY src/assets/devices/catalog.json ./src/assets/devices/catalog.json
COPY src/assets/workouts/catalog.json ./src/assets/workouts/catalog.json

# --locked: the lockfile is the build input. Without it a dependency published
# five minutes ago can change what this image contains.
RUN cargo build --release --locked \
        --manifest-path src-tauri/Cargo.toml \
        -p zeppbridge-cli -p zeppbridge-mcp \
    && strip src-tauri/target/release/zeppbridge-cli \
    && strip src-tauri/target/release/zeppbridge-mcp

# -------------------------------------------------------------- runtime stage
FROM debian:bookworm-slim AS runtime

# ca-certificates: sync talks to the Zepp cloud over HTTPS. Without it every
# sync fails with a certificate error that reads like a network problem.
# tzdata: the local database stores local days, so the container's timezone
# decides which day a reading belongs to. See docs/reference/contract.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libdbus-1-3 \
        tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/src-tauri/target/release/zeppbridge-cli /usr/local/bin/
COPY --from=build /src/src-tauri/target/release/zeppbridge-mcp /usr/local/bin/
COPY packaging/docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# A fixed, unprivileged uid. 1000 is the first uid most desktop Linux users
# get, so a bind-mounted directory usually just works; when it does not, the
# entrypoint says so and `--user` is the fix (docs/guides/docker.md).
RUN useradd --uid 1000 --user-group --create-home --shell /usr/sbin/nologin zeppbridge \
    && mkdir -p /data \
    && chown zeppbridge:zeppbridge /data

# The container has no "next to the executable" to fall back on: /usr/local/bin
# is part of the image, and anything written there dies with the container.
# Naming the directory explicitly is what makes the volume the only writable
# place that matters.
ENV ZEPPBRIDGE_DATA_DIR=/data

# The database, the auth metadata, exports and backups all live here.
VOLUME ["/data"]

USER zeppbridge
WORKDIR /data

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# Sensible default for `docker run` with no arguments: report what is in the
# library and exit. Never sync by default — an unattended sync on a container
# somebody started to look around is a surprising amount of network traffic.
CMD ["zeppbridge-cli", "status", "--json"]
