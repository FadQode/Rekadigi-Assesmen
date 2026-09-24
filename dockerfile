FROM oven/bun:1

WORKDIR /app

# Install dependencies first for better Docker layer caching
COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

# Copy application source
COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "start"]