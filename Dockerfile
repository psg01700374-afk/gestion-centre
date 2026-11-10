# Image Node.js avec Linux Debian
FROM node:18-slim

# Installer les dépendances Linux requises par Chromium / Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Indiquer à Puppeteer d'utiliser le Chromium système
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
