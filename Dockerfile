##########  builder stage  ##########
FROM node:20-bookworm AS builder

# Give Next.js a 2 GiB V8 heap
ENV NODE_OPTIONS="--max_old_space_size=2048"

# ----- system packages + signed Google Chrome -----
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
      wget gnupg ca-certificates && \
    wget -qO- https://dl.google.com/linux/linux_signing_key.pub | \
      gpg --dearmor -o /usr/share/keyrings/google-linux.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] \
      https://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update -qq && \
    apt-get install -y --no-install-recommends \
      google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

##########  runtime stage  ##########
FROM node:20-slim
WORKDIR /app

# 1. Install Chrome in runtime so chrome-launcher can find it :contentReference[oaicite:5]{index=5}
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
      wget gnupg ca-certificates && \
    wget -qO- https://dl.google.com/linux/linux_signing_key.pub | \
      gpg --dearmor -o /usr/share/keyrings/google-linux.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] \
      https://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update -qq && \
    apt-get install -y --no-install-recommends \
      google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

# 2. Copy built app and dependencies
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# 3. Set NODE_ENV and CHROME_PATH :contentReference[oaicite:6]{index=6}
ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/google-chrome-stable

# 4. Expose the port your Next.js server listens on
EXPOSE 3000

# 5. Start the app
CMD ["npm", "start"]
