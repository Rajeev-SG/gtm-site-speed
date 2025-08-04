##########  builder stage  ##########
FROM node:20-bookworm AS builder

# Give Next.js a 2 GiB V8 heap
ENV NODE_OPTIONS="--max_old_space_size=2048"

# ----- system packages + signed Google Chrome -----
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends wget gnupg ca-certificates && \
    wget -qO- https://dl.google.com/linux/linux_signing_key.pub | \
        gpg --dearmor -o /usr/share/keyrings/google-linux.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update -qq && \
    apt-get install -y --no-install-recommends google-chrome-stable && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Tell Lighthouse / Playwright where Chrome lives
ENV CHROME_BIN=/usr/bin/google-chrome

# ----- build the Next.js app -----
WORKDIR /app
COPY package*.json ./
COPY next.config.js ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit --progress=false
COPY . .
RUN npm run build

##########  runtime stage  ##########
FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
