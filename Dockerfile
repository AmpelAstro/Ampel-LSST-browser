# Builder stage: install all dependencies and compile TypeScript.
FROM dhi.io/node:26-alpine3.24-dev AS builder

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm ci

# Copy the source code into the container and compile TypeScript.
COPY . .
RUN npm run build:backend

# Deps stage: install production dependencies only.
FROM dhi.io/node:26-alpine3.24-dev AS deps

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm ci --omit=dev

# Runner stage: minimal runtime image with compiled app and production deps.
FROM dhi.io/node:26-alpine3.24 AS runner

ENV PATH=/app/node_modules/.bin:$PATH

ENV GRAPHQL_PORT=4000
ENV GRAPHQL_HOST=
ENV GRAPHQL_PATH=/

ENV MONGODB_URI=mongodb://localhost:27017/
ENV MONGODB_DB=ampel

WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist/backend ./dist

# Expose the port that the application listens on.
EXPOSE 4000

# Run the application.
CMD ["node", "dist/index.js"]
