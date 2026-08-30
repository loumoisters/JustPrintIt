# Zero-dependency app, so this is a very plain Dockerfile - no npm install,
# no build step, just Node's built-in http server (server.js) and the
# static public/ frontend. Works the same on Unraid, TrueNAS SCALE, Proxmox
# (in an LXC or VM with Docker), or any other Docker host.
FROM node:20-alpine

WORKDIR /app

# Everything except what .dockerignore excludes (live data, git metadata,
# Mac-only scripts, etc.) - see .dockerignore for the full list.
COPY . .

# DATA_DIR is where data/db.json, uploads/, and backups/ live - point it at
# a mounted volume (see docker-compose.yml) so your data survives image
# rebuilds and container restarts. Without a volume mount here, restarting
# the container would reset back to the seeded demo data every time.
ENV DATA_DIR=/app/data
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
