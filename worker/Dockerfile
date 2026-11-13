FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production
CMD ["node", "--experimental-strip-types", "--no-warnings", "src/main.ts"]
