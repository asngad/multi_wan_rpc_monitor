# =====================================================================
# Dockerfile: Multi-WAN RPC Network Monitor
# Target: Production Linux / Home Server (Docker & Docker Compose)
# =====================================================================

FROM node:20-alpine

# Set folder kerja di dalam container
WORKDIR /app

# Salin package.json dan package-lock.json untuk optimasi Docker layer caching
COPY package*.json ./

# Install dependensi produksi saja
RUN npm install --omit=dev

# Salin seluruh kode program aplikasi
COPY . .

# Set environment produksi
ENV NODE_ENV=production
ENV PORT=4000

# Buka port 4000 untuk dashboard web dan Socket.io
EXPOSE 4000

# Periksa kesiapan aplikasi secara periodik
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/api/status || exit 1

# Jalankan server
CMD ["node", "src/server.js"]
