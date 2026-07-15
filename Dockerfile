# BigWater backend — Bun + Hono API and the Telegram bot run from this one image.
# The same image backs two Railway services; each overrides the start command:
#   - API service:  bun run start:api   (runs drizzle migrations, then the server)
#   - Bot service:  bun run start:bot   (long-polling Telegram bot)
FROM oven/bun:1.3

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# App source.
COPY . .

ENV NODE_ENV=production

# Default command is the API (migrate + serve). Railway's bot service overrides
# this with `bun run start:bot`.
CMD ["bun", "run", "start:api"]
